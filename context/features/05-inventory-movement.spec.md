# 05 — Inventory Movement API

## Overview

Add the REST endpoints in `apps/app` that move stock out of and back into batches, and read the inventory ledger. Stock can only come in today, through `POST /api/medicines/:id/batches`.

This feature is API only, and it needs no schema change or migration.

## Goals

- Dispensing allocates stock first-expired, first-out and never touches expired batches
- Count corrections, damaged, lost and returned stock, and expired disposal all work
- Every movement is one `inventory_transactions` row plus its `inventory_entries` rows, and `quantity` is only changed by the trigger
- Transactions can be listed and read
- Every write records the acting user in `performed_by` and `audit_logs`
- A medicine can reach 0 stock through the API, so it can be soft-deleted
- Lint, test and build pass, and `prisma migrate status` reports in sync

## Out of Scope

- Changing or reversing a transaction. Mistakes get an offsetting transaction.
- Receiving stock, which already exists
- Barcode lookup and scanning
- UI screens

---

## Current database

Checked on the local database through the Postgres MCP on 2026-11-06. It matches @context/database-schema.md.

| Table / trigger                    | What it does                                                                     |
| ---------------------------------- | -------------------------------------------------------------------------------- |
| `inventory_entries_apply`          | After an entry insert, adds or subtracts its quantity on the batch               |
| `medicine_batches_quantity_nonneg` | `CHECK (quantity >= 0)`, so overdrawing fails and rolls back                     |
| `inventory_*_immutable`            | Rejects `UPDATE` and `DELETE` on transactions and entries                        |
| `inventory_*_audit`, `medicine_batches_audit` | Write `audit_logs`, using `app.actor_id`                              |

### Facts that affect this feature

- The database doesn't check that `reason` suits `direction`, or that `inventory_transactions.quantity` equals the sum of its entries. The API must guarantee both.
- `apply_inventory_entry` rejects a batch from another medicine, but the API should return `404` before reaching it.
- A `CHECK` failure surfaces as a generic database error, which would become a `500`. Check stock under lock first, so it's only a backstop.
- `lockActiveMedicine` in `src/lib/medicines.ts` already serializes stock receipts and deletes. @context/features/02-api-medicine.spec.md requires later inventory features to take the same lock.

---

## Decisions

| Topic                  | Decision                                                                                                                                                  |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Permissions            | `inventory:write` for movements, `inventory:read` for reads. With the seeded roles, `admin` and `staff` can write, and `collaborator` can only read.       |
| Dispensing             | Takes a medicine and a quantity. FEFO picks the batches, ordered by `expiration_date, received_at, id`.                                                   |
| Expired stock          | Excluded from dispensing. It leaves through expired disposal, or through damaged or lost.                                                                 |
| Count correction       | The client sends the counted quantity, and the server works out the difference under lock, so a concurrent movement can't make the correction wrong.     |
| Count matches          | Returns `200` with `transaction: null`. There is nothing to record, because `quantity` must be above 0.                                                   |
| `RETURNED`             | Included, with an explicit `direction`: `IN` for returned to stock, `OUT` for returned to supplier. It's in the enum but missing from the actions table in @context/database-schema.md, so this feature adds it there. |
| Notes                  | Required for corrections, damaged, lost and returned, because they explain a change the system can't verify. Optional for dispensing and disposal.       |
| Expired disposal       | Removes the whole quantity of each batch. By default, every expired batch of the medicine, or only those in `batchIds`.                                   |
| Deleted medicines      | Movements return `404`. Their transaction history stays readable.                                                                                         |

---

## API

All routes use the session cookie and the response format from `src/lib/api-response.ts`.

### Data shape

```ts
interface InventoryTransaction {
  id: string;
  medicineId: string;
  direction: 'IN' | 'OUT';
  reason: InventoryReason;
  quantity: number;
  notes: string | null;
  performedBy: { id: string; username: string };
  createdAt: string;
  entries: {
    id: string;
    batchId: string;
    batchNumber: string;
    expirationDate: string; // YYYY-MM-DD
    quantity: number;
  }[];
}
```

### `POST /api/medicines/:id/dispense`

```json
{ "quantity": 25, "notes": "Ward 3" }
```

`quantity` is an integer from 1 to 1,000,000. Returns `201` with the `InventoryTransaction`, which has one entry per batch used. If unexpired stock is short, returns `409 INSUFFICIENT_STOCK` and moves nothing. `error.fields.quantity` says how many are available.

### `POST /api/medicines/:id/batches/:batchId/movements`

The body depends on `reason`:

```json
{ "reason": "DAMAGED", "quantity": 2, "notes": "Dropped" }
{ "reason": "LOST", "quantity": 1, "notes": "Missing after audit" }
{ "reason": "RETURNED", "direction": "IN", "quantity": 5, "notes": "Unused from ward" }
{ "reason": "COUNT_ADJUSTMENT", "countedQuantity": 48, "notes": "Monthly count" }
```

| Reason             | Direction                      | Quantity                                  |
| ------------------ | ------------------------------ | ----------------------------------------- |
| `DAMAGED`, `LOST`  | `OUT`                          | `quantity`, 1 to 1,000,000                |
| `RETURNED`         | From `direction`               | `quantity`, 1 to 1,000,000                |
| `COUNT_ADJUSTMENT` | From the difference            | `countedQuantity`, 0 to 1,000,000         |

`notes` is required, up to 500 characters. `RECEIVED`, `DISPENSED` and `EXPIRED_DISPOSAL` return `400`, because they have their own routes.

Returns `201` with `{ transaction, batch }`, where `batch` is the updated `MedicineBatch`. A count that matches returns `200` with `transaction: null`. An `OUT` above the batch's quantity returns `409 INSUFFICIENT_STOCK`.

### `POST /api/medicines/:id/expired-disposal`

```json
{ "batchIds": ["<batch id>"], "notes": "Collected by disposal contractor" }
```

Both fields are optional. Returns `201` with the `InventoryTransaction`, which has one entry per batch.

- A `batchIds` value from another medicine returns `404`
- A `batchIds` value that isn't expired or has no stock returns `409 BATCH_NOT_EXPIRED`
- With no `batchIds` and no expired stock, returns `409 NO_EXPIRED_STOCK`

### `GET /api/inventory/transactions`

| Query        | Rules                                        |
| ------------ | -------------------------------------------- |
| `medicineId` | Optional UUID                                |
| `batchId`    | Optional UUID, transactions touching this batch |
| `reason`     | Optional `InventoryReason`                   |
| `direction`  | Optional `IN` or `OUT`                       |
| `page`       | Optional integer, at least 1. Default `1`    |
| `pageSize`   | Optional integer from 1 to 100. Default `20` |

Returns `{ items: InventoryTransaction[], total, page, pageSize }`, newest first, then by `id`. Fetch entries and users in the same query, not one query per transaction.

### `GET /api/inventory/transactions/:id`

Returns the `InventoryTransaction`, or `404`.

### Errors

| Status | Code                 | When                                                        |
| ------ | -------------------- | ----------------------------------------------------------- |
| `400`  | `INVALID_JSON`       | The body isn't valid JSON                                   |
| `400`  | `VALIDATION_ERROR`   | A body, query or path value fails validation                |
| `401`  | `UNAUTHENTICATED`    | No valid session                                            |
| `403`  | `FORBIDDEN`          | A required permission is missing                            |
| `404`  | `NOT_FOUND`          | The medicine is missing or deleted, or the batch or transaction doesn't exist or belongs to another medicine |
| `409`  | `INSUFFICIENT_STOCK` | An `OUT` exceeds the stock available                        |
| `409`  | `NO_EXPIRED_STOCK`   | Disposal has nothing to remove                              |
| `409`  | `BATCH_NOT_EXPIRED`  | Disposal names a batch that isn't expired or is empty       |

---

## Implementation

### Dispense flow

In one `withActor` transaction:

1. `lockActiveMedicine(tx, medicineId)`, which returns `404` if it's missing or deleted
2. Work out `today` from `settings.timezone`
3. Lock the usable batches:

   ```sql
   SELECT id, quantity FROM medicine_batches
    WHERE medicine_id = $1 AND quantity > 0 AND expiration_date >= $today::date
    ORDER BY expiration_date, received_at, id
    FOR UPDATE;
   ```

4. Call `allocateFefo(batches, quantity)`, a pure function that returns `{ batchId, quantity }[]`, or `null` if stock is short. Return `409` on `null`.
5. Insert one transaction (`OUT`, `DISPENSED`), then one entry per allocation. The trigger updates each batch.

### Single-batch flow

In one `withActor` transaction: lock the medicine, lock the batch with `FOR UPDATE` and return `404` if it belongs to another medicine, work out the direction and quantity, check stock for `OUT`, then insert the transaction and one entry.

### Disposal flow

In one `withActor` transaction: lock the medicine, lock the target batches in FEFO order, apply the rules above using `today`, then insert one `OUT` / `EXPIRED_DISPOSAL` transaction whose quantity is the sum, and one entry per batch.

### Files

All paths are relative to `apps/app/`.

| File                                                     | Change                                                                     |
| -------------------------------------------------------- | -------------------------------------------------------------------------- |
| `src/app/api/medicines/[id]/dispense/route.ts`           | New. `POST`                                                                |
| `src/app/api/medicines/[id]/batches/[batchId]/movements/route.ts` | New. `POST`                                                       |
| `src/app/api/medicines/[id]/expired-disposal/route.ts`   | New. `POST`                                                                |
| `src/app/api/inventory/transactions/route.ts`            | New. `GET` list                                                            |
| `src/app/api/inventory/transactions/[id]/route.ts`       | New. `GET` one                                                             |
| `src/lib/inventory.ts`                                   | New. Data layer, with `import 'server-only'`                               |
| `src/lib/fefo.ts`                                        | New. `allocateFefo`, so it can be tested without a database                |
| `src/lib/medicines.ts`                                   | Exports `lockActiveMedicine`, `toBatch` and `getExpiryContext`. Removes the stray "Escapes LIKE wildcards" comment above `listMedicines` |
| `src/lib/validations/inventory.ts`                       | New. Zod schemas, using a discriminated union on `reason`                  |
| `src/lib/api-response.ts`                                | Adds `INSUFFICIENT_STOCK`, `NO_EXPIRED_STOCK` and `BATCH_NOT_EXPIRED`      |
| `src/types/inventory.ts`                                 | New. Response types                                                        |
| `specs/lib/fefo.spec.ts`, `specs/lib/inventory.spec.ts`, `specs/lib/validations/inventory.spec.ts`, `specs/api/inventory/*.spec.ts` | New. Tests |
| `../../context/database-schema.md`                       | Adds the `RETURNED` row to the actions table                               |

### Dependencies

None.

---

## Testing

Unit and route tests (Jest, no database):

- `allocateFefo`: one batch, spanning batches, exact match, short stock returns `null`, stops once covered
- Schemas: each `reason` shape, `notes` required, disallowed reasons, `countedQuantity` of 0 allowed, unknown fields rejected
- Data layer, with Prisma mocked: direction and quantity for each reason, `INSUFFICIENT_STOCK`, a matching count writes nothing, disposal rules
- Routes: `401`, `403`, `400` for invalid IDs and JSON, and the response format for each status

Manual checks (use a throwaway database, because ledger rows can't be deleted):

- [ ] `prisma migrate status` reports up to date
- [ ] Dispensing across two batches takes from the earliest expiry first, with one entry per batch
- [ ] Dispensing skips expired batches, including one with the earliest date
- [ ] Dispensing more than is available returns `409` and changes nothing
- [ ] 10 concurrent dispenses never overdraw a batch, and the transaction quantities equal the stock removed
- [ ] Count corrections up and down set the batch to the counted quantity, and a matching count writes nothing
- [ ] Damaged, lost and returned stock change the batch correctly, and `OUT` over the batch quantity returns `409`
- [ ] Disposal removes all expired batches, or only those in `batchIds`, and rejects unexpired ones
- [ ] A batch under another medicine returns `404`, and a deleted medicine returns `404` on every movement
- [ ] Each movement writes `audit_logs` rows with `actor_id` set, and the right `performed_by`
- [ ] `collaborator` can read transactions and gets `403` on every movement
- [ ] Filters and paging work on the list
- [ ] A medicine taken to 0 stock through the API can be soft-deleted
- [ ] `RECEIVED`, the batch route and the medicine routes still work

## Acceptance Criteria

- All endpoints behave as documented, and all manual checks pass
- Stock changes only through inventory transactions
- A transaction's quantity always equals the sum of its entries
- No expired batch is ever dispensed
- `npm` lint, test and build pass
