# Local Production Setup

Runs InventraMed's server side with Docker: PostgreSQL, RabbitMQ, the app, and the two SMS workers.

The Raspberry Pi consumer is not part of this stack. It connects to RabbitMQ over the LAN.

## Requirements

- Docker with Docker Compose
- Free ports: `3000` (app), `5432` (PostgreSQL), `5672` and `15672` (RabbitMQ)

If the development stack (`compose.yml` at the repository root) is running, stop it first with `docker compose stop` from the root, or change the ports in `.env`.

Run every command below from this `setup/` directory.

## 1. Create the env file

```bash
cp .env.example .env
```

Fill in these three values in `.env`:

| Variable            | Generate with              |
| ------------------- | -------------------------- |
| `POSTGRES_PASSWORD` | `openssl rand -hex 24`     |
| `NEXTAUTH_SECRET`   | `openssl rand -base64 32`  |
| `WORKER_API_TOKEN`  | `openssl rand -base64 32`  |

Also change `RABBITMQ_PASSWORD` to something other than the default.

To open the app from other machines, set `NEXTAUTH_URL` to `http://<server-ip>:3000`.

## 2. Start

```bash
docker compose up -d --build
```

The first build takes a few minutes. Migrations and the seed run automatically before the app starts.

## 3. Check

```bash
docker compose ps -a
```

All services should be `Up`, and `migrate` should show `Exited (0)`.

Open <http://localhost:3000> and log in as `admin`. The default password is in `apps/app/prisma/seed.ts`. Change it after your first login.

The RabbitMQ management UI is at <http://localhost:15672>.

## 4. Connect the Raspberry Pi

In the Pi's `consumer.env`, point `RABBITMQ_URL` at this server:

```
RABBITMQ_URL=amqp://<RABBITMQ_USER>:<RABBITMQ_PASSWORD>@<server-ip>:5672/
```

## Everyday commands

| Task                         | Command                                                          |
| ---------------------------- | ---------------------------------------------------------------- |
| Show status                  | `docker compose ps -a`                                           |
| Follow logs                  | `docker compose logs -f app` (or `worker-retry`, `worker-success`, `pg`, `rabbitmq`) |
| Restart a service            | `docker compose restart app`                                     |
| Stop everything (keeps data) | `docker compose down`                                            |
| Start again                  | `docker compose up -d`                                           |
| Update after `git pull`      | `docker compose up -d --build`                                   |
| Back up the database         | `docker compose exec pg pg_dump -U postgres inventramed > backup.sql` |
| Restore a backup (empty database) | `docker compose exec -T pg psql -U postgres inventramed < backup.sql` |

## Data

The database is stored in `setup/data/pg` on the host, not in a Docker volume. It is kept after `docker compose down` or `docker volume prune`.

To start over with an empty database, delete the folder. It is owned by the container's `postgres` user, so it needs `sudo`:

```bash
docker compose down
sudo rm -rf data/pg
docker compose up -d
```
