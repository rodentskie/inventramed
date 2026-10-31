# 01 — Database Setup

## Overview

Set up PostgreSQL + **Prisma ORM 7** in `apps/app` and implement the full schema from @context/database-schema.md: Prisma models, the initial migration (with the raw SQL for CHECK constraints and triggers), the seeded settings row and system roles, and the shared DB helpers (`prisma` client, `withActor`, permission list).

This feature is infrastructure only. There is no UI, auth, or API in this feature.

## Goals

- Prisma 7 installed and configured in `apps/app`
- `prisma/schema.prisma` matches @context/database-schema.md exactly
- One initial migration that creates every table, enum and index, plus all raw SQL (checks, quantity sync, ledger immutability, audit)
- Settings row (`id = 1`) seeded by the migration
- System roles + permissions seeded by a seed script
- A typed Prisma client singleton, `withActor(userId, fn)`, and the permission constants in `src/lib/`
- `prisma migrate status` reports in sync; lint, test and build pass

## Out of Scope

- Authentication / login, user and employee management UI
- Inventory screens, FIFO dispensing logic, barcode generation
- `generateDailyNotification()`, the worker API routes, the Raspberry Pi worker
- Seeding a default admin user (see Open Questions)

---

## Files

All paths are relative to `apps/app/`.

| File                                   | Purpose                                                          |
| -------------------------------------- | ---------------------------------------------------------------- |
| `prisma/schema.prisma`                 | Generator, datasource, enums and models (copied from the schema doc) |
| `prisma.config.ts`                     | Prisma 7 config: schema path, `DATABASE_URL`, seed command        |
| `prisma/migrations/<ts>_init/migration.sql` | Generated DDL + raw SQL appended by hand                   |
| `prisma/seed.ts`                       | Upserts system roles and their permissions (idempotent)           |
| `src/lib/prisma.ts`                    | `PrismaClient` singleton using `@prisma/adapter-pg`               |
| `src/lib/with-actor.ts`                | `withActor(userId, fn)`: interactive transaction that sets `app.actor_id` |
| `src/lib/permissions.ts`               | `PERMISSIONS` constant, `Permission` type, Zod schema, `hasPermission()` wildcard check |
| `.env.example`                         | `DATABASE_URL` placeholder                                        |
| `src/generated/prisma/`                | Generated client output (gitignored)                              |

## Dependencies

- `prisma` (dev), `@prisma/client`, `@prisma/adapter-pg`, `pg`
- `dotenv` (loads `DATABASE_URL` for the Prisma CLI)
- `zod` (permission validation)
- `tsx` (dev, runs `prisma/seed.ts`)

Install into the `apps/app` workspace.

---

## Implementation Steps

### 1. Prisma config

`prisma.config.ts`:

```ts
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: { url: process.env.DATABASE_URL! },
  migrations: { seed: 'tsx prisma/seed.ts' },
});
```

- `schema.prisma` has no `url` (Prisma 7).
- Generator output is `../src/generated/prisma`. Add `src/generated/` to `.gitignore`.
- `.env` is gitignored, and `.env.example` is committed.

### 2. Schema

Copy the Prisma schema from @context/database-schema.md verbatim into `prisma/schema.prisma`. Run `prisma validate` and `prisma format`.

### 3. Initial migration

1. `prisma migrate dev --name init --create-only`
2. Append to the generated `migration.sql`, in this order:
   1. **Check constraints** (all from the schema doc's "Check constraints" block)
   2. **Quantity sync**: `apply_inventory_entry()` + `inventory_entries_apply` trigger
   3. **Ledger immutability**: `reject_modification()` + triggers on `inventory_transactions`, `inventory_entries`, `audit_logs`
   4. **Audit**: `write_audit_log()` + triggers on `inventory_transactions`, `inventory_entries`, `medicine_batches`
   5. **Settings seed**: `INSERT INTO settings (id, updated_at) VALUES (1, now());` so the column defaults fill the rest
3. `prisma migrate dev` to apply it

The settings row lives in the migration (not the seed script), so every environment, including production via `prisma migrate deploy`, always has it.

### 4. Seed script

`prisma/seed.ts` upserts the system roles (`is_system = true`) and replaces their permissions:

| Role           | Permissions                                            |
| -------------- | ------------------------------------------------------ |
| `admin`        | `*`                                                    |
| `staff`        | `medicine:*`, `inventory:*`, `notification:read`       |
| `collaborator` | `medicine:read`, `inventory:read`, `notification:read` |

- Running it twice produces the same result (upsert by `name`).
- Validate every permission string against `src/lib/permissions.ts` before writing.

### 5. `src/lib/permissions.ts`

- `PERMISSIONS`: the 9 concrete permissions from the schema doc (`medicine:read`, `medicine:write`, `inventory:read`, `inventory:write`, `notification:read`, `employee:manage`, `user:manage`, `settings:manage`, `audit:read`).
- Grantable values = concrete permissions + `<resource>:*` for each resource + `*`.
- `permissionSchema` (Zod enum of grantable values) for `role_permissions` writes.
- `hasPermission(granted: string[], required: Permission): boolean`. Default deny, `resource:*` matches any action on that resource, `*` matches everything.

### 6. `src/lib/prisma.ts`

- Create the client with `PrismaPg({ connectionString: process.env.DATABASE_URL })`.
- Cache it on `globalThis` in development so Next.js hot reload does not open new pools.
- Server-only (`import 'server-only'`).

### 7. `src/lib/with-actor.ts`

```ts
withActor<T>(userId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>
```

Runs `prisma.$transaction(async (tx) => { await tx.$executeRaw\`SELECT set_config('app.actor_id', ${userId}, true)\`; return fn(tx); })`. Every future inventory write must go through it.

### 8. Scripts

Nx `run-commands` targets in `apps/app/package.json` (`cwd: {projectRoot}`), run as `TASK=<target> APP=app npm run task -- [args]`:

- `prisma:generate` → `prisma generate` (cached on schema/config)
- `prisma:migrate` → `prisma migrate dev`
- `prisma:migrate:create` → `prisma migrate dev --create-only` (pass `--name <name>`)
- `prisma:deploy` → `prisma migrate deploy`
- `prisma:status` → `prisma migrate status`
- `prisma:reset` → `prisma migrate reset`
- `prisma:seed` → `prisma db seed`
- `prisma:validate` / `prisma:format` / `prisma:studio`

`build`, `test` and `typecheck` depend on `prisma:generate`, so a fresh clone compiles.

---

## Testing

Unit tests (Jest, no database):

- `hasPermission`: exact match, `resource:*`, `*`, default deny, a different resource's wildcard does not match.
- `permissionSchema`: accepts valid strings and wildcards, rejects typos such as `medicine:create`.

Manual DB verification against a local database (record results in the PR):

- [ ] `prisma migrate status` reports up to date
- [ ] `settings` has exactly one row, and inserting `id = 2` fails
- [ ] Seed runs twice without errors or duplicates
- [ ] Inserting an `IN` transaction + entry increases `medicine_batches.quantity`
- [ ] An `OUT` entry larger than the batch quantity fails and rolls back
- [ ] An entry whose batch belongs to another medicine raises `batch … does not belong to medicine …`
- [ ] `UPDATE`/`DELETE` on `inventory_transactions`, `inventory_entries` and `audit_logs` is rejected
- [ ] Writes via `withActor` produce `audit_logs` rows with `actor_id` set; writes without it give `actor_id = NULL`
- [ ] Barcode prefix checks reject a medicine without `MED-` and a batch without `BAT-`
- [ ] `receives_sms_alerts = true` with no `contact_number` is rejected

## Acceptance Criteria

- Schema, migration and seed match @context/database-schema.md
- All manual checks above pass
- `npm` lint, test and build pass
- No generated client or `.env` committed

## Open Questions

- **Local PostgreSQL:** use a `docker-compose.yml` for dev, or an existing local install?
- **First admin user:** auth is out of scope, but a login needs an admin. Seed one from env vars (`SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD`) in this feature, or leave it for the auth feature?
