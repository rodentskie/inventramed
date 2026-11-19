# InventraMed

Development of a Collaborative Digital Medicine Inventory System

## Overview

InventraMed is a medicine inventory system that keeps track of medicines and monitors their expiration dates. Each record holds key details such as the medicine's name, quantity, and expiration date.

Medicine information is encoded with a barcode generator, and scanning is handled directly through the app — no physical barcode scanner is required.

## Expiration Monitoring

The system checks every medicine in the inventory against its expiration date and classifies it into one of three statuses:

- **Safe** — the medicine is far from its expiration date
- **Near Expiry** — the medicine is nearing its expiration date
- **Expired** — the medicine is expired or no longer safe to consume

When a medicine becomes near expiry or expired, users are alerted through:

- **In-app notifications** — alerts shown in the InventraMed app
- **SMS notifications** — text messages sent to registered mobile numbers through a GSM module

## Architecture

- **Server** — hosts the InventraMed application: inventory management, barcode scanning, expiration checks, and in-app notifications. It also runs RabbitMQ and the Go SMS worker, which claims queued SMS from the app and publishes them to RabbitMQ.
- **SMS consumer (Raspberry Pi 3 Model B)** — a lightweight Go app on the same local network that takes each SMS from RabbitMQ, sends it through the USB GSM module, and publishes the result back.

## Hardware Components

- Raspberry Pi 3 Model B — runs the SMS consumer
- USB GSM module (with an active SIM card) — sends SMS notifications
- Power supply for the Raspberry Pi
- MicroSD card — holds the Raspberry Pi's operating system and worker

## Running Locally

### Prerequisites

- Node.js 24 and npm 11
- Docker with Docker Compose
- Port 5432 free for PostgreSQL, and port 3000 free for the app

### Setup

Run these from the repository root.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start PostgreSQL:

   ```bash
   docker compose up -d
   ```

3. Create the environment file. The defaults match `compose.yml`:

   ```bash
   cp apps/app/.env.example apps/app/.env
   ```

   Then set `NEXTAUTH_SECRET` in `apps/app/.env` to the output of `openssl rand -base64 32`. Login doesn't work without it.

   Set `WORKER_API_TOKEN` the same way, with its own value. The SMS worker API rejects every call without it.

4. Generate the Prisma client, apply the migrations, and seed the system roles:

   ```bash
   TASK=prisma:generate APP=app npm run task
   TASK=prisma:migrate APP=app npm run task
   TASK=prisma:seed APP=app npm run task
   ```

5. Start the app, then open <http://localhost:3000>:

   ```bash
   APP=app npm run dev
   ```

### Database container

| Command                  | What it does                                     |
| ------------------------ | ------------------------------------------------ |
| `docker compose up -d`   | Start PostgreSQL in the background               |
| `docker compose stop`    | Stop PostgreSQL and keep its data                |
| `docker compose logs pg` | Show the PostgreSQL logs                         |
| `docker compose down`    | Remove the container, **which loses local data** |

`compose.yml` doesn't define a named volume, so the next `docker compose up` after `down` starts with an empty database. If that happens, repeat the migrate and seed commands from step 4.

### Docker image

`apps/app/Dockerfile` is a multi-stage build: `target` installs dependencies, `build` builds the app, and `runner` runs the standalone Next.js server as a non-root user. The build context is the repository root, and `apps/app/Dockerfile.dockerignore` keeps local files out of it.

```bash
TASK=docker:build APP=app npm run task
TASK=docker:run APP=app npm run task
```

The image contains no environment values or secrets. Every variable the app uses is read on the server at run time, so `docker:run` passes `apps/app/.env` with `--env-file`. One image works in every environment.

`docker:run` joins the `inventramed` network from `compose.yml` and sets `DATABASE_URL` to the `pg` container, because `localhost` inside the container is the container itself. Start PostgreSQL first, and apply migrations from the host (`prisma:deploy` or `prisma:migrate`), because the image doesn't run them.

### SMS worker and consumer

SMS goes from the app to the GSM module through RabbitMQ. All three processes are Go (1.27, `go.work` at the root):

| Process          | Runs on | What it does                                                                  |
| ---------------- | ------- | ----------------------------------------------------------------------------- |
| `worker/retry`   | server  | Calls `POST /api/worker/sms/claim` and publishes each message to `sms.send`  |
| `consumer`       | Pi      | Sends each `sms.send` message through the GSM module, publishes to `sms.success` |
| `worker/success` | server  | Reports each `sms.success` result to `POST /api/worker/sms/:id/result`       |

`docker compose up -d` also starts RabbitMQ (management UI on <http://localhost:15672>). Its user comes from `RABBITMQ_USER` and `RABBITMQ_PASSWORD`, which default to `inventramed`. Set your own in a root `.env` for anything other than local development. The built-in `guest` user only connects from localhost, so the Pi can't use it.

The consumer loads a `.env` file from its working directory if one exists (`cp apps/consumer/.env.example apps/consumer/.env`). Variables already set in the environment take precedence. The worker reads plain environment variables and doesn't load `.env` files, so copy its example and export it before running:

```bash
cp apps/worker/.env.example apps/worker/.env   # set WORKER_API_TOKEN to the app's value
set -a; source apps/worker/.env; set +a
TASK=dev.retry APP=worker npm run task
TASK=dev.success APP=worker npm run task
```

| Variable               | App      | Purpose                                                               |
| ---------------------- | -------- | --------------------------------------------------------------------- |
| `APP_URL`              | worker   | Base URL of the Next.js app                                           |
| `WORKER_API_TOKEN`     | worker   | Same value as in `apps/app/.env`                                      |
| `RABBITMQ_URL`         | both     | `amqp://<user>:<password>@<host>:5672/`; the Pi uses the server's LAN IP |
| `WORKER_POLL_INTERVAL` | worker   | Wait before the first claim and while no consumer is connected (`30s`). After that, the app's `worker_poll_interval_secs` is used. |
| `GSM_PORTS`            | consumer | Comma-separated serial ports, e.g. `/dev/ttyUSB0`                    |

The worker skips claiming while nothing consumes `sms.send`, so when the Pi is down, messages stay `PENDING` and the settings page shows the worker as offline.

Each digest goes out as **one 160-character GSM-7 SMS**. Keep **Items per SMS** at 1 in settings; a longer body fails with a clear error instead of being cut off.

#### Raspberry Pi

Build the consumer for the Pi (32-bit DietPi; use `GOARCH=arm64` in `apps/consumer/project.json` for the 64-bit image) and copy it over:

```bash
TASK=rasp.build APP=consumer npm run task
rsync -avz dist/consumer/ dietpi@<pi-ip>:/opt/inventramed/
```

On the Pi, give the user access to the serial port, then check the module shows up:

```bash
sudo usermod -aG dialout $USER   # takes effect after a reboot
ls -la /dev/ttyUSB*
```

#### systemd

Each process exits with status 1 when its RabbitMQ connection drops, so run them under systemd with a restart policy. For example, the consumer on the Pi (`/etc/systemd/system/inventramed-consumer.service`):

```ini
[Unit]
Description=InventraMed SMS consumer
After=network-online.target
Wants=network-online.target

[Service]
User=dietpi
EnvironmentFile=/opt/inventramed/consumer.env
ExecStart=/opt/inventramed/consumer
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

The worker uses one unit per binary on the server: `TASK=build APP=worker npm run task` writes `apps/worker/dist/retry` and `apps/worker/dist/success`, each started the same way with the worker's env file.

### Commands

Run any of these as `TASK=<target> APP=app npm run task`.

| Target                  | What it does                                               |
| ----------------------- | ---------------------------------------------------------- |
| `lint`                  | Run ESLint                                                 |
| `typecheck`             | Type-check the app and the `prisma/` folder                |
| `test`                  | Run the Jest tests                                         |
| `build`                 | Build the app for production                               |
| `prisma:generate`       | Generate the Prisma client                                 |
| `prisma:migrate`        | Apply migrations in development (`prisma migrate dev`)     |
| `prisma:migrate:create` | Create a migration without applying it                     |
| `prisma:deploy`         | Apply migrations in production (`prisma migrate deploy`)   |
| `prisma:status`         | Check whether the migrations are in sync                   |
| `prisma:seed`           | Create or update the system roles (safe to re-run)         |
| `prisma:reset`          | **Delete all data** and re-apply the migrations            |
| `prisma:validate`       | Validate `schema.prisma`                                   |
| `prisma:format`         | Format `schema.prisma`                                     |
| `prisma:studio`         | Open Prisma Studio to browse the data                      |
| `docker:build`          | Build the `inventramed-app` Docker image                   |
| `docker:run`            | Run the image on port 3000 with `apps/app/.env`            |

Pass extra arguments after `--`. For example, to create a migration with a name:

```bash
TASK=prisma:migrate:create APP=app npm run task -- --name add_something
```

`build`, `test` and `typecheck` generate the Prisma client first. `typecheck` also generates Next's route types, so it doesn't need a build first.
