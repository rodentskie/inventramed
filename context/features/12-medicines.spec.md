# 12 — Medicines Pages

## Overview

Add the first data screens inside the app shell: a medicine list, a medicine detail page with its batches, and the forms to create and edit medicines, receive stock and edit batches. It also adds a printable batch label with its barcode.

This is the first feature that changes data from the UI, so it also sets up the pieces later screens reuse: Server Actions that wrap the existing `src/lib` functions, a page permission check, URL-driven list paging and search, and barcode rendering.

It needs no schema change, migration or new API route. The existing API routes stay for non-browser clients.

## Goals

- `/medicines` lists medicines with search, paging and total stock
- `/medicines/[id]` shows a medicine, its barcode and its batches with live expiry status
- Users with `medicine:write` can create, edit and delete medicines and edit batches
- Users with `medicine:write` and `inventory:write` can receive stock
- Each batch has a printable label with its `BAT-` barcode, and each medicine shows its `MED-` barcode
- The Medicines nav item is enabled
- Lint, test and build pass

## Out of Scope

- Dispensing, count correction, damaged, lost, returned and expired disposal. Feature 13 adds them, and adds their buttons to this detail page.
- Scanning (feature 13)
- Transaction history for a medicine (feature 17). The detail page links to it once that page exists.
- Expiry status per medicine in the list. The dashboard's "Needs attention" covers this.
- Bulk import, CSV export and bulk label printing
- Restoring a deleted medicine

---

## Current state

Checked in the code on 2026-11-08.

### Already in place

| Area           | Where                                     | Behavior                                                                      |
| -------------- | ----------------------------------------- | ----------------------------------------------------------------------------- |
| List           | `listMedicines({ search, page, pageSize })` | Non-deleted medicines by name, searching name and generic name, with `totalStock` |
| Detail         | `getMedicine(id)`                         | Medicine with batches, each with `status` and `daysToExpiry`. `404` when deleted |
| Create / edit  | `createMedicine`, `updateMedicine`        | Generates a `MED-` barcode. `MEDICINE_DUPLICATE` on the same name, strength and form |
| Delete         | `softDeleteMedicine`                      | `MEDICINE_HAS_STOCK` while any batch has stock                                |
| Receive stock  | `receiveStock`                            | New batch with a `BAT-` barcode, or adds to the batch with the same number and expiry. Returns `{ batch, created }` |
| Edit batch     | `updateBatch`                             | Batch number and expiry only. `BATCH_DUPLICATE` on a clash                    |
| Validation     | `src/lib/validations/medicine.ts`         | Zod schemas with limits and messages for all of the above                     |
| Errors         | `ApiError` in `src/lib/api-response.ts`   | `status`, `code`, `message`, optional `fields`                                |
| Page user      | `getCurrentUser()`                        | Name, role and permissions, cached per request                                |
| Shell          | `src/app/(app)/layout.tsx`, `src/lib/navigation.ts` | Medicines is listed but disabled                                    |

### Missing

- No Server Actions exist yet, and nothing maps an `ApiError` to the `{ success, data, error }` shape the coding standards ask for
- No page checks a permission. `requirePermission` throws, which suits actions but not pages.
- No barcode rendering, and no list paging UI

---

## Decisions

| Topic                | Decision                                                                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mutations            | Server Actions in `src/actions/medicines.ts` call the existing `src/lib` functions. They don't call the API routes over HTTP.                                 |
| Action auth          | Each action calls `requirePermission(...)` itself. A page hiding a button is not a security check.                                                         |
| Action results       | A shared `runAction(fn)` in `src/lib/action-result.ts` returns `{ success: true, data }` or `{ success: false, error: { code, message, fields? } }`. It maps `ApiError` as `apiFailure` does, and logs anything else as `INTERNAL_ERROR`. |
| Action input         | Actions take plain objects and validate them with the existing schemas through `parseInput`, so the rules and messages match the API                      |
| After a change       | `revalidatePath` for the list and the medicine's detail page, then the client shows a toast. Creating a medicine navigates to its detail page.             |
| Page permissions     | New `requirePageUser(permission?)` in `src/lib/auth.ts`: redirects to `/login` without a user, and to `/` when the permission is missing. Nav already hides the item, so this only catches typed URLs. |
| Lists                | Search, page and page size live in the URL (`?search=&page=`), parsed with `medicineListQuerySchema`. An invalid value falls back to the default instead of erroring. |
| Search input         | A small client component updates `?search=` after 300 ms of no typing and resets `page`, with `router.replace` so typing doesn't fill the history        |
| Forms                | Dialogs on the list and detail pages, one client component per form. Field errors come from the action's `fields`, other errors show as a toast. No form library. |
| State                | Form state stays local to each form component. Nothing is shared between components here, so there is no `zustand` store yet.                              |
| Barcode format       | Code 128, rendered as SVG with `jsbarcode`. Code 128 encodes the `MED-`/`BAT-` prefixes and Crockford characters, and phone cameras read it reliably.      |
| Label printing       | `/labels/batches/[batchId]` in a new `(print)` route group with no shell. It shows the label and a Print button that calls `window.print()`. Print CSS hides the button. |
| Deleted medicine     | `getMedicine` throws `NOT_FOUND`, and the page calls `notFound()`                                                                                          |
| Dates                | Expiration dates are plain `YYYY-MM-DD` strings throughout, entered with `<input type="date">`. No timezone conversion is needed.                          |

---

## UI

All pages use the shell from feature 11: page title, divider, then content, with Chakra semantic tokens only.

### `/medicines`

Requires `medicine:read`.

```
 Medicines                                              [ New medicine ]
 ─────────────────────────────────────────────────────────────────────
 [ Search by name or generic name…            ]

 Name                 Generic name    Strength   Form      Stock
 Amoxicillin          amoxicillin     500 mg     capsule   1,200 cap
 Paracetamol          paracetamol     500 mg     tablet      150 pc
 …
                                         ‹ 1 2 3 › · 1–20 of 54
```

- `New medicine` only appears with `medicine:write`
- The name links to `/medicines/[id]`. Rows aren't clickable as a whole, so the table stays keyboard-friendly.
- Empty states: `No medicines yet` (with the New button if allowed), or `No medicines match "{search}"`
- The table scrolls inside its own container below `md`
- Page title: `Medicines | InventraMed`

### `/medicines/[id]`

Requires `medicine:read`.

```
 Paracetamol 500 mg                                  [ Edit ] [ Delete ]
 ─────────────────────────────────────────────────────────────────────
 Generic name  paracetamol        Form  tablet        Unit  pc
 Total stock   150 pc             Barcode  ▌▌▐▌▐▐▌▐▌  MED-7Q2K…

 Batches                                              [ Receive stock ]
 Batch    Barcode         Expires      Status          Received     Qty
 P778     BAT-91XZ…       2026-11-12   ● 4d left       2026-10-01   150 pc   [⋯]
 A123     BAT-4KD0…       2026-11-01   ● Expired 7d    2026-09-12     0 pc   [⋯]
```

- Header actions:
  - `Edit` and `Delete` need `medicine:write`
  - `Receive stock` needs `medicine:write` and `inventory:write`
- Details are a `DataList`
- Batches are sorted `expiration_date, received_at, id` (FEFO order, as `getMedicine` returns them)
- Status uses the `Status` snippet: red for expired, orange for near expiry, green for safe, with `formatDaysToExpiry`
- Batches with 0 quantity stay listed, in `fg.muted`, because they still have history
- Row menu (`⋯`):
  - `Print label` opens `/labels/batches/[batchId]` in a new tab
  - `Edit batch` needs `medicine:write`
- Empty batches state: `No stock received yet`
- Page title: `{name} | InventraMed`

### Forms

| Dialog          | Fields                                                                   | Action             | On success                                     |
| --------------- | ------------------------------------------------------------------------ | ------------------ | ---------------------------------------------- |
| New medicine    | Name*, Generic name, Strength, Dosage form, Unit* (default `pc`)         | `createMedicine`   | Toast `Medicine created`, go to its detail page |
| Edit medicine   | Same fields, prefilled; sends only changed fields                        | `updateMedicine`   | Toast `Medicine updated`                       |
| Delete medicine | Confirmation with the medicine name                                      | `deleteMedicine`   | Toast `Medicine deleted`, go to `/medicines`   |
| Receive stock   | Batch number*, Expiration date*, Quantity*, Notes                        | `receiveStock`     | Toast `Added to batch {n}` or `New batch {n} created` |
| Edit batch      | Batch number, Expiration date; sends only changed fields                 | `updateBatch`      | Toast `Batch updated`                          |

- `*` marks required fields
- Edit dialogs with no changes keep the Save button disabled, since the schemas reject an empty update
- Receive stock warns inline when the expiration date is already past: `This batch is already expired.` It still allows saving, since recording expired stock that arrived is valid.
- The Delete dialog explains `MEDICINE_HAS_STOCK` when the total stock is above 0, and the button stays disabled. The server still enforces it.
- Error messages come from the server's `message` and `fields`, which are already written for users. Unknown errors show `Something went wrong. Please try again.`

### `/labels/batches/[batchId]`

Requires `medicine:read`. Outside the shell, on a white background in both color modes, sized for a small label:

```
 Paracetamol 500 mg
 Batch P778 · Exp 2026-11-12
 ▌▌▐▌▐▐▌▐▌▐▌▌▐▐▌▐▌▌▐▌
 BAT-91XZ4KD0Q7M2
                                   [ Print ]
```

`getBatch` needs the medicine ID, so the page looks the batch up by ID alone with a new `getBatchLabel(batchId)`. It returns the medicine name and strength, batch number, expiry and barcode, and `NOT_FOUND` for a deleted medicine.

---

## Implementation

### Dependencies

- `jsbarcode`, which is MIT licensed and has no runtime dependencies. Install it in the root `package.json`, then in `apps/app`. Check the current API with Context7 before use.

### Chakra snippets

```bash
npx @chakra-ui/cli snippet add dialog --outdir libs/components/src/ui
npx @chakra-ui/cli snippet add pagination --outdir libs/components/src/ui
npx @chakra-ui/cli snippet add data-list --outdir libs/components/src/ui
npx @chakra-ui/cli snippet add field --outdir libs/components/src/ui
```

Export each from `libs/components/src/index.ts`, and fix any TS2590 errors the same way as in features 10 and 11.

### Files

All paths are relative to `apps/app/` unless they start with `libs/`.

| File                                                | Change                                                                                       |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `src/lib/action-result.ts`                          | New. `ActionResult<T>` type and `runAction(fn)`                                               |
| `src/lib/auth.ts`                                   | Add `requirePageUser(permission?)`                                                            |
| `src/lib/list-query.ts`                             | New. `parseListQuery(schema, searchParams)`, which falls back to defaults on invalid input    |
| `src/lib/medicines.ts`                              | Add `getBatchLabel(batchId)`                                                                  |
| `src/lib/navigation.ts`                             | Enable Medicines                                                                              |
| `src/actions/medicines.ts`                          | New. `createMedicine`, `updateMedicine`, `deleteMedicine`, `receiveStock`, `updateBatch`      |
| `src/app/(app)/medicines/page.tsx`                  | New. List                                                                                     |
| `src/app/(app)/medicines/[id]/page.tsx`             | New. Detail                                                                                   |
| `src/app/(print)/layout.tsx`                        | New. Bare layout, light only                                                                  |
| `src/app/(print)/labels/batches/[batchId]/page.tsx` | New. Label                                                                                    |
| `src/components/common/SearchInput.tsx`             | New. `'use client'`. Debounced `?search=`                                                     |
| `src/components/common/ListPagination.tsx`          | New. `'use client'`. Pagination snippet driving `?page=`                                      |
| `src/components/common/Barcode.tsx`                 | New. `'use client'`. Renders a Code 128 SVG with `jsbarcode`, with the text under it         |
| `src/components/medicines/MedicineTable.tsx`        | New                                                                                           |
| `src/components/medicines/MedicineDetails.tsx`      | New                                                                                           |
| `src/components/medicines/BatchTable.tsx`           | New. Includes the row menu                                                                    |
| `src/components/medicines/MedicineFormDialog.tsx`   | New. `'use client'`. Create and edit                                                          |
| `src/components/medicines/DeleteMedicineDialog.tsx` | New. `'use client'`                                                                           |
| `src/components/medicines/ReceiveStockDialog.tsx`   | New. `'use client'`                                                                           |
| `src/components/medicines/EditBatchDialog.tsx`      | New. `'use client'`                                                                           |
| `src/components/labels/PrintButton.tsx`             | New. `'use client'`                                                                           |
| `src/types/action.ts`                               | New. `ActionResult<T>`, `ActionError`                                                         |

### `runAction`

```ts
type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: ApiErrorCode; message: string; fields?: ApiFieldErrors } };
```

Every action follows the same shape:

```ts
export async function receiveStockAction(medicineId: string, input: unknown) {
  return runAction(async () => {
    const user = await requirePermission('medicine:write', 'inventory:write');
    const id = parseInput(idSchema, medicineId);
    const data = await receiveStock(user.id, id, parseInput(receiveStockSchema, input));
    revalidatePath(`/medicines/${id}`);
    revalidatePath('/medicines');
    return data;
  });
}
```

`runAction` must not catch Next's redirect and not-found errors. Use `unstable_rethrow` from `next/navigation` first, or don't call `redirect` inside actions.

---

## Testing

Unit and component tests (Jest, no database). Mock the lib functions, `next/cache` and `next/navigation`.

- `runAction`: success, `ApiError` with and without fields, unknown error becomes `INTERNAL_ERROR` and is logged
- `requirePageUser`: no user redirects to `/login`, missing permission redirects to `/`, allowed returns the user
- `parseListQuery`: valid values, invalid page and page size fall back to defaults, search is trimmed
- Each action: calls `requirePermission` with the right permissions, validates input, returns the lib result, revalidates the right paths, and returns `FORBIDDEN` and `VALIDATION_ERROR` results without calling the lib
- `getBatchLabel`: found, deleted medicine, missing batch
- `MedicineTable`: rows, stock with unit, both empty states
- `BatchTable`: status colors and text, zero-quantity rows muted, edit item only with `medicine:write`
- `MedicineFormDialog`: field errors from `fields`, toast on other errors, Save disabled with no changes when editing
- `ReceiveStockDialog`: past-date warning, `created` true and false toasts
- List and detail pages: permission redirect, buttons shown per permission, `notFound()` for a deleted medicine
- `navigation.spec.ts`: Medicines is enabled

Manual checks, run with `APP=app npm run dev`:

- [ ] `admin` creates a medicine and lands on its detail page with a `MED-` barcode
- [ ] Creating the same name, strength and form shows the duplicate message on the form
- [ ] Receiving stock creates a batch, and receiving the same batch number and expiry adds to it
- [ ] A batch expiring within the threshold shows as near expiry, and a past one as expired
- [ ] The dashboard's counts and "Needs attention" reflect the new batches
- [ ] Editing a batch to collide with another shows the duplicate message
- [ ] Deleting is blocked while stock is above 0
- [ ] Search finds by name and generic name, and paging keeps the search
- [ ] The label page prints one label with a barcode a phone camera can read
- [ ] A `collaborator` can browse and print labels but sees no create, edit, delete or receive buttons, and a crafted action call returns `FORBIDDEN`
- [ ] Opening a deleted medicine's URL shows the not-found page
- [ ] Both color modes are readable, and no page scrolls sideways at phone width

## Acceptance Criteria

- All goals are met and all manual checks pass
- Every action checks its permission on the server
- Expiry status on the detail page matches the dashboard and the API
- `npm` lint, test and build pass
