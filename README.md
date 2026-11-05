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

- **Server** — hosts the InventraMed application: inventory management, barcode scanning, expiration checks, and in-app notifications.
- **SMS worker (Raspberry Pi 3 Model B)** — a lightweight worker that fetches near-expiry and expired medicines from the server and sends SMS notifications through the USB GSM module.

## Hardware Components

- Raspberry Pi 3 Model B — runs the SMS worker
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

Pass extra arguments after `--`. For example, to create a migration with a name:

```bash
TASK=prisma:migrate:create APP=app npm run task -- --name add_something
```

`build`, `test` and `typecheck` generate the Prisma client first.
