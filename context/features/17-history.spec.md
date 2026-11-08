# 17 — Transaction History and Audit Logs

## Overview

Add the two read-only history screens: the inventory transaction ledger, and the audit log of medicine, batch and movement changes.

The transaction pages answer "where did this stock go?". Anyone with `inventory:read` can filter by medicine, batch, reason and direction, and open a transaction to see which batches it touched. The audit log answers "who changed what?". Admins can see every recorded change with a before/after comparison.

It needs no schema change or migration. It adds the medicine name to the transaction list, which the API also returns from then on.

## Goals

- `/inventory/transactions` lists transactions newest first, with filters and paging
- `/inventory/transactions/[id]` shows one transaction and its batch entries
- The medicine detail page and each batch row link to their filtered history
- `/audit-logs` lists audit entries with filters for type, action and date range
- Each audit entry can expand to show which fields changed, before and after
- The Transactions and Audit logs nav items are enabled
- Lint, test and build pass

## Out of Scope

- Editing or reversing transactions. The ledger is append-only.
- CSV or PDF export
- Charts and summaries
- Audit of employees, users and settings. Those tables have no audit triggers.
- Filtering the audit log by actor. The API supports `actorId`, but picking a user needs the employee list, which only admins with two more permissions can read.

---

## Current state

Checked in the code on 2026-11-08.

### Already in place

| Area                | Where                                      | Behavior                                                                 |
| ------------------- | ------------------------------------------ | ------------------------------------------------------------------------ |
| Transaction list    | `listTransactions({ medicineId, batchId, reason, direction, page, pageSize })` | Newest first, with performer and entries; no medicine name |
| Transaction detail  | `getTransaction(id)`                       | Same shape, `NOT_FOUND` when missing                                     |
| Audit list          | `listAuditLogs({ entityType, entityId, action, actorId, from, to, page, pageSize })` | Newest first, with actor username; `changes` as stored |
| Audit date range    | `auditLogListQuerySchema`                  | `from` inclusive, `to` exclusive, ISO timestamps with an offset          |
| Labels              | `REASON_LABELS` in `src/lib/format.ts`     | From feature 11                                                          |
| Plumbing            | Earlier features                           | `requirePageUser`, `parseListQuery`, `ListPagination`, `native-select`  |

### Facts that affect this feature

- Deleted medicines keep their transactions, so the list must show their names too
- An audit `updated` entry holds two full row snapshots. Most fields are the same in both, so showing both in full hides the change.
- Each stock movement writes one `inventory_transactions` entry, one per `inventory_entries` row, and one per touched `medicine_batches` row, so one dispense can produce several audit entries
- Audit `from`/`to` need an offset, and the facility's dates are in `settings.timezone`

---

## Decisions

| Topic                   | Decision                                                                                                                          |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Medicine name           | Add `medicine: { id, name, strength, unit, deleted }` to `TRANSACTION_INCLUDE` and `InventoryTransaction`. Additive, so API clients aren't broken. |
| Filters                 | All in the URL, parsed with the existing schemas through `parseListQuery`, so a filtered view can be bookmarked and the medicine page can link to it |
| Medicine filter         | Set by links from the medicine page, shown as a removable chip with the medicine name. No medicine picker on the list.              |
| Signed quantities       | `+` for `IN` in `green.fg`, `−` for `OUT`, as on the dashboard                                                                     |
| Transaction detail      | Its own page, so it can be linked from the audit log and from notes                                                               |
| Audit date filter       | Two `<input type="date">` fields. The page converts each local date to the start of that day in `settings.timezone`, and `to` to the start of the next day, so `to` includes the chosen day. |
| Audit change view       | For `updated`, only fields that differ, as `field: before → after`. For `created` and `deleted`, the full row in a collapsed section. `updated_at` is hidden when it's the only difference. |
| Audit entity links      | `medicines` and `medicine_batches` entries link to the medicine page; transaction and entry entries link to the transaction page   |
| Long values             | Values are shown as text, truncated at 200 characters with an expand control. JSON is never rendered as HTML.                    |

---

## UI

### `/inventory/transactions`

Requires `inventory:read`.

```
 Transactions
 ─────────────────────────────────────────────────────────────────────
 [ Medicine: Paracetamol 500 mg ✕ ]  Reason [ All ▾ ]  Direction [ All ▾ ]

 When              Reason            Qty        Medicine              By
 2026-11-08 11:50  Dispensed         −20 pc     Paracetamol 500 mg    staff1
 2026-11-08 09:12  Received          +100 pc    Paracetamol 500 mg    admin
 2026-11-07 16:03  Expired disposal  −20 cap    Amoxicillin 500 mg    admin
                                         ‹ 1 2 3 › · 1–20 of 57
```

- `When` is in the settings timezone and links to the transaction
- A deleted medicine shows its name with a `Deleted` tag
- Empty state: `No transactions` / `No transactions match these filters.`
- Page title: `Transactions | InventraMed`

### `/inventory/transactions/[id]`

```
 Dispensed −20 pc
 ─────────────────────────────────────────────────────────────────────
 Medicine   Paracetamol 500 mg        By     staff1
 When       2026-11-08 11:50          Notes  Ward 3 request

 Batches
 Batch    Expires      Qty
 P778     2026-11-12   15 pc
 Q120     2026-12-01    5 pc
```

### Links from feature 12's medicine page

- Header: `History` → `/inventory/transactions?medicineId={id}`
- Batch row menu: `History` → `/inventory/transactions?medicineId={id}&batchId={batchId}`
- Both are shown only with `inventory:read`

### `/audit-logs`

Requires `audit:read`.

```
 Audit logs
 ─────────────────────────────────────────────────────────────────────
 Type [ All ▾ ]  Action [ All ▾ ]  From [ 2026-11-01 ]  To [ 2026-11-08 ]

 When              Action    Type        Record                   By
 2026-11-08 11:50  updated   Batch       P778 · Paracetamol       staff1   [▸]
     quantity: 35 → 15
 2026-11-08 11:50  created   Transaction Dispensed −20            staff1   [▸]
 2026-11-07 10:02  updated   Medicine    Paracetamol              admin    [▸]
     strength: 250 mg → 500 mg
```

- Type labels: `Medicine`, `Batch`, `Transaction`, `Transaction entry`
- `Record` is a short label built from the `after` snapshot (or `before` for deletes): the name, batch number or reason. It links as described above.
- `By` shows `system` when there is no actor
- A `to` before `from` shows the schema's message under `To` and no results
- Page title: `Audit logs | InventraMed`

---

## Implementation

### Files

All paths are relative to `apps/app/`.

| File                                                    | Change                                                                   |
| ------------------------------------------------------- | ------------------------------------------------------------------------ |
| `src/lib/inventory.ts`, `src/types/inventory.ts`        | Add `medicine` to transactions                                           |
| `src/lib/expiry.ts`                                     | Add `startOfLocalDay(date, timezone)`, returning a `Date`                |
| `src/lib/audit-diff.ts`                                 | New. `diffSnapshots(before, after)` and `describeAuditRecord(entry)`     |
| `src/app/(app)/inventory/transactions/page.tsx`         | New                                                                      |
| `src/app/(app)/inventory/transactions/[id]/page.tsx`    | New                                                                      |
| `src/app/(app)/audit-logs/page.tsx`                     | New                                                                      |
| `src/components/history/TransactionTable.tsx`           | New                                                                      |
| `src/components/history/TransactionFilters.tsx`         | New. `'use client'`. Updates the URL                                     |
| `src/components/history/AuditLogTable.tsx`             | New. Expandable rows                                                     |
| `src/components/history/AuditFilters.tsx`               | New. `'use client'`                                                      |
| `src/components/history/ChangeList.tsx`                 | New. Renders `field: before → after`                                     |
| `src/components/medicines/*`                            | Add the History links                                                    |
| `src/lib/navigation.ts`                                 | Enable Transactions and Audit logs                                       |
| `specs/api/inventory/*`                                 | Update for the new `medicine` field                                      |

`startOfLocalDay` finds the UTC instant of local midnight with `Intl.DateTimeFormat` offsets, the same API `getLocalToday` uses, so it handles any IANA zone without a date library.

---

## Testing

- `listTransactions` and `getTransaction`: include the medicine, with `deleted` set for a soft-deleted one
- `startOfLocalDay`: Asia/Manila, UTC, and a zone with daylight saving on its change day
- `diffSnapshots`: changed fields only, `updated_at` alone hidden, nested values, `null` on either side
- `describeAuditRecord`: each entity type, created and deleted entries, missing snapshot
- Filters: URL updates, page resets on a filter change, the medicine chip removes `medicineId` and `batchId`
- Pages: permission redirects, invalid filters fall back, `to` before `from` shows the message, `notFound()` for a missing transaction
- Existing inventory API tests updated for the new field

Manual checks:

- [ ] A dispense across two batches shows one transaction with two entries
- [ ] The medicine page's History link shows only that medicine, and the batch link only that batch
- [ ] A deleted medicine's transactions still show its name
- [ ] Editing a medicine's strength shows `strength: 250 mg → 500 mg` in the audit log
- [ ] A date range of one day includes changes from the whole day in the facility's timezone
- [ ] Audit values containing `<script>` show as text
- [ ] A `collaborator` can see transactions but not the audit log, whose URL redirects to `/`

## Acceptance Criteria

- All goals are met and all manual checks pass
- Both screens are read-only, with no action that writes
- `npm` lint, test and build pass
