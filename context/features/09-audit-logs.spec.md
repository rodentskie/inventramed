# 09 — Audit Log API

## Overview

Add one REST endpoint in `apps/app` to read `audit_logs`. Database triggers write this table, and it's append-only, so reading is the only operation.

This feature is API only, and it needs no schema change or migration.

## Goals

- `GET /api/audit-logs` lists audit rows with filters and paging, newest first
- Each row shows who made the change, or `null` for the system
- Only callers with `audit:read` can use it
- Lint, test and build pass, and `prisma migrate status` reports in sync

## Out of Scope

- Writing, editing or deleting audit rows
- Auditing more tables, such as `employees`, `users` and `settings`
- Exporting audit logs
- UI screens

---

## Current database

Checked on the local database through the Postgres MCP on 2026-11-06. The table is empty.

| Written by                     | Entity type              | Actions                    |
| ------------------------------ | ------------------------ | -------------------------- |
| `medicines_audit`              | `medicines`              | created, updated, deleted  |
| `medicine_batches_audit`       | `medicine_batches`       | created, updated, deleted  |
| `inventory_transactions_audit` | `inventory_transactions` | created                    |
| `inventory_entries_audit`      | `inventory_entries`      | created                    |

### Facts that affect this feature

- `audit_logs_immutable` rejects `UPDATE` and `DELETE`
- Indexes exist on `created_at` and `(entity_type, entity_id)`, which cover the default sort and the entity filter
- `actor_id` deliberately has no foreign key, so Prisma has no relation to `users`, and actors need a separate query
- `actor_id` is `NULL` for writes with no `app.actor_id`, such as direct SQL
- `changes` holds full row snapshots from `to_jsonb`. None of the audited tables hold passwords or tokens.

---

## Decisions

| Topic      | Decision                                                                                                 |
| ---------- | -------------------------------------------------------------------------------------------------------- |
| Permission | `audit:read`. Only `admin` holds it today.                                                                |
| Actors     | One `prisma.user.findMany` over the page's distinct actor IDs, not one query per row.                     |
| `changes`  | Returned as stored, in the list. There is no detail endpoint, because a row has nothing more to show.     |
| Date range | `from` and `to` are ISO timestamps with an offset, so the caller sets the timezone and no conversion is needed. |

---

## API

### `GET /api/audit-logs`

| Query        | Rules                                                                     |
| ------------ | ------------------------------------------------------------------------- |
| `entityType` | Optional. `medicines`, `medicine_batches`, `inventory_transactions` or `inventory_entries` |
| `entityId`   | Optional UUID                                                             |
| `action`     | Optional. `created`, `updated` or `deleted`                               |
| `actorId`    | Optional UUID                                                             |
| `from`       | Optional ISO timestamp with an offset, inclusive                          |
| `to`         | Optional ISO timestamp with an offset, exclusive. Must be after `from`    |
| `page`       | Optional integer, at least 1. Default `1`                                 |
| `pageSize`   | Optional integer from 1 to 100. Default `20`                              |

Returns `{ items: AuditLog[], total, page, pageSize }`, sorted by `createdAt` descending, then `id`:

```ts
interface AuditLog {
  id: string;
  entityType: string;
  entityId: string;
  action: 'created' | 'updated' | 'deleted';
  changes: { before: unknown; after: unknown } | null;
  actor: { id: string; username: string } | null;
  createdAt: string;
}
```

`actor` is `null` when `actor_id` is `NULL`.

### Errors

| Status | Code               | When                             |
| ------ | ------------------ | -------------------------------- |
| `400`  | `VALIDATION_ERROR` | A query value fails validation   |
| `401`  | `UNAUTHENTICATED`  | No valid session                 |
| `403`  | `FORBIDDEN`        | The caller lacks `audit:read`    |

---

## Implementation

### Files

All paths are relative to `apps/app/`.

| File                                | Change                                      |
| ----------------------------------- | ------------------------------------------- |
| `src/app/api/audit-logs/route.ts`   | New. `GET`                                  |
| `src/lib/audit-logs.ts`             | New. `listAuditLogs`, with `import 'server-only'` |
| `src/lib/validations/audit-log.ts`  | New. Query schema                           |
| `src/types/audit-log.ts`            | New. Response type                          |
| `specs/lib/validations/audit-log.spec.ts`, `specs/lib/audit-logs.spec.ts`, `specs/api/audit-logs/routes.spec.ts` | New. Tests |

### Dependencies

None.

---

## Testing

Unit and route tests (Jest, no database):

- Query schema: defaults, limits, valid and invalid enums and UUIDs, `to` before `from` rejected, unknown fields rejected
- `listAuditLogs`, with Prisma mocked: builds each filter, one actor query for the whole page, `actor` is `null` for a `NULL` `actor_id`
- Routes: `401`, `403`, `400`, and the response format

Manual checks (use a throwaway database, because audit rows can't be deleted):

- [ ] `prisma migrate status` reports up to date
- [ ] Creating and editing a medicine and receiving stock produce rows, newest first, with the right `actor`
- [ ] Each filter narrows the results, and `total` matches
- [ ] A row from direct SQL has `actor: null`
- [ ] `changes` shows before and after values for an update
- [ ] `staff` and `collaborator` get `403`, and no session gets `401`
- [ ] No `POST`, `PATCH` or `DELETE` route exists

## Acceptance Criteria

- The endpoint behaves as documented, and all manual checks pass
- No endpoint can write to `audit_logs`
- `npm` lint, test and build pass
