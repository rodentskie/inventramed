# History

- **Project scaffold** `Oct. 30, 2026` - setup project, context.
- **Database setup** `Oct. 31, 2026` - Prisma 7 + PostgreSQL in `apps/app` ([spec](features/01-database-setup.spec.md)).
  - Full schema with an initial migration that includes CHECK constraints, quantity-sync, immutability and audit triggers, and the settings row
  - Idempotent seed for the system roles (`admin`, `staff`, `collaborator`)
  - `src/lib/`: `prisma` client (pg adapter), `withActor`, `permissions` + unit tests
  - Nx `prisma:*` targets; `build`/`test`/`typecheck` generate the client first; real `typecheck` covering `prisma/`
  - Local DB via the root `compose.yml`