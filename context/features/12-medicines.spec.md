# 12 — Medicines Pages

## Overview

Add the first data screens inside the app shell: a medicine list, a medicine detail page with its batches, and the forms to create and edit medicines, receive stock and edit batches. It also adds a printable batch label with its barcode, camera scanning of the product barcode when adding a medicine, and a `/scan` page that looks up a scanned barcode and shows the medicine.

This is the first feature that changes data from the UI, so it also sets up the pieces later screens reuse: Server Actions that wrap the existing `src/lib` functions, a page permission check, URL-driven list paging and search, barcode rendering and barcode scanning.

It adds one migration: an optional, unique `medicines.product_barcode` column for the manufacturer's barcode (EAN/UPC or similar). The generated `MED-` barcode stays. No new API route; the existing medicine routes accept `productBarcode` through the shared schemas.

## Goals

- `/medicines` lists medicines with search, paging and total stock
- `/medicines/[id]` shows a medicine, its barcodes and its batches with live expiry status
- Users with `medicine:write` can create, edit and delete medicines and edit batches
- The New and Edit medicine forms can fill the product barcode by scanning it with the camera
- Users with `medicine:write` and `inventory:write` can receive stock
- Each batch has a printable label with its `BAT-` barcode, and each medicine shows its `MED-` barcode
- `/scan` reads a `MED-`, `BAT-` or product barcode from the camera or typed input and shows the matching medicine
- The Medicines and Scan nav items are enabled
- Lint, test and build pass

## Out of Scope

- Dispensing, count correction, damaged, lost, returned and expired disposal. Feature 13 adds them, and adds their buttons to this detail page and to `/scan`.
- Transaction history for a medicine (feature 17). The detail page links to it once that page exists.
- Looking up product details from an online barcode database. Scanning only fills the code.
- QR codes
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
- No camera access or barcode decoding, and no lookup by barcode. `getBatch` needs the medicine ID.
- Medicines have no field for the manufacturer's barcode

### Facts that affect this feature

- Browsers only allow camera access in a secure context: HTTPS, or `localhost`. Opening the app over a LAN address such as `http://192.168.1.10:3000` gives no camera, so phones need the server on HTTPS.
- The native `BarcodeDetector` API is missing from Firefox and desktop Safari. `react-barcode-scanner/polyfill` installs a ZBar WASM fallback only when it's missing.
- Decoders can report a UPC-A code as the 13-digit EAN with a leading `0`, so the same box can scan as `012345678905` or `0012345678905`.
- A USB barcode scanner acts as a keyboard: it types the code and presses Enter.

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
| Barcode format       | Code 128, rendered as SVG with `react-barcode`. Code 128 encodes the `MED-`/`BAT-` prefixes and Crockford characters, and phone cameras read it reliably. |
| Product barcode      | New nullable `medicines.product_barcode`, unique. Trimmed, 1–64 printable ASCII characters with no spaces, and it can't start with `MED-` or `BAT-` (any case), so scanner routing never collides. A database `CHECK` enforces the prefix rule too. A soft delete clears it, so the same product can be added again. `PRODUCT_BARCODE_DUPLICATE` (409, with `fields.productBarcode`) on a clash. It is stored as scanned or typed, not rendered; it's already printed on the box. |
| Scanner              | `react-barcode-scanner`'s `BarcodeScanner` plus `react-barcode-scanner/polyfill`, in one `'use client'` component loaded with `next/dynamic` and `ssr: false`. Formats: `code_128`, `code_39`, `ean_13`, `ean_8`, `upc_a`, `upc_e`, `itf`. |
| Camera               | Off until the user presses `Scan` / `Start camera`. Prefers the rear camera (`facingMode: environment`). Stops after the first read, and when the dialog closes or the page is left, so one code isn't read ten times. |
| Scan in forms        | The Product barcode field has a `Scan` button that opens the camera inline in the dialog. The first read fills the field and closes the camera. The field stays editable for typing or a USB scanner. |
| Lookup               | New `findByBarcode(code)` routes on the prefix: `MED-` to a medicine, `BAT-` to a batch with its medicine, anything else to `product_barcode`. Product lookups also try the UPC-A/EAN-13 twin (adding or removing one leading `0`). Deleted medicines count as not found. |
| Lookup transport     | A Server Action `lookupBarcodeAction(code)`, requiring `medicine:read`, validated with `barcodeLookupSchema` (trimmed, 1–64 printable ASCII; `MED-`/`BAT-` codes are uppercased and must have 12 Crockford characters) |
| Scan state           | Local state in one `ScanView` client component, which owns the scanner, the typed input and the result. Feature 13 can move it to a `zustand` store when the movement dialogs join. |
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
 Total stock   150 pc             Product barcode  4800123456789
 Barcode  ▌▌▐▌▐▐▌▐▌  MED-7Q2K…

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
| New medicine    | Name*, Generic name, Strength, Dosage form, Unit* (default `pc`), Product barcode with `Scan` | `createMedicine`   | Toast `Medicine created`, go to its detail page |
| Edit medicine   | Same fields, prefilled; sends only changed fields                        | `updateMedicine`   | Toast `Medicine updated`                       |
| Delete medicine | Confirmation with the medicine name                                      | `deleteMedicine`   | Toast `Medicine deleted`, go to `/medicines`   |
| Receive stock   | Batch number*, Expiration date*, Quantity*, Notes                        | `receiveStock`     | Toast `Added to batch {n}` or `New batch {n} created` |
| Edit batch      | Batch number, Expiration date; sends only changed fields                 | `updateBatch`      | Toast `Batch updated`                          |

- `*` marks required fields
- Edit dialogs with no changes keep the Save button disabled, since the schemas reject an empty update
- Receive stock warns inline when the expiration date is already past: `This batch is already expired.` It still allows saving, since recording expired stock that arrived is valid.
- The Delete dialog explains `MEDICINE_HAS_STOCK` when the total stock is above 0, and the button stays disabled. The server still enforces it.
- Error messages come from the server's `message` and `fields`, which are already written for users. Unknown errors show `Something went wrong. Please try again.`
- A duplicate product barcode shows under the Product barcode field: `Another medicine already has this product barcode.`
- Camera errors show inline under the camera, never as toasts:

| Situation            | Message                                                                               |
| -------------------- | ------------------------------------------------------------------------------------- |
| Permission denied    | `Camera access was blocked. Allow it in your browser settings, or type the barcode.`  |
| No camera            | `No camera found. Type the barcode instead.`                                          |
| Not a secure context | `The camera needs HTTPS. Type the barcode, or open the app over HTTPS.`               |
| Anything else        | `The camera couldn't start. Type the barcode instead.`                                |

### `/scan`

Requires `medicine:read`.

```
 Scan
 ─────────────────────────────────────────────────────────────────────
 ┌──────────────────────────────┐   Or enter a barcode
 │        camera preview        │   [ MED-, BAT- or product code ] [ Look up ]
 └──────────────────────────────┘
 [ Start camera ]

 ── Result ────────────────────────────────────────────────────────────
 Paracetamol 500 mg                                   [ Open medicine ]
 (MedicineDetails and BatchTable, read-only; a scanned batch row is highlighted)
```

- The typed input is always visible and submits on Enter, so keyboard-wedge scanners work without a camera
- A read pauses the camera and runs the lookup. `Scan again` restarts it.
- Results: medicine (any of its codes), or batch with its medicine (`Batch P778` noted above the details)
- Not found: `No medicine has this barcode.` For a product code with `medicine:write`, an `Add medicine` button opens the New medicine dialog with the code filled in.
- Invalid input shows the `barcodeLookupSchema` message inline
- Page title: `Scan | InventraMed`

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

Installed in the root `package.json`, then in `apps/app`:

- `react-barcode` 1.6 (ISC), which wraps `jsbarcode` and renders SVG. Ships its own types.
- `react-barcode-scanner` 4.1 (MIT), with the ZBar WASM polyfill for browsers without `BarcodeDetector`

### Migration

`add_medicine_product_barcode`, created with `prisma:migrate:create`, then edited:

```prisma
productBarcode String? @unique @map("product_barcode")
```

```sql
ALTER TABLE medicines ADD CONSTRAINT medicines_product_barcode_prefix
  CHECK (upper(product_barcode) NOT LIKE 'MED-%' AND upper(product_barcode) NOT LIKE 'BAT-%');
```

`softDeleteMedicine` sets `productBarcode` to `null` alongside `deletedAt`. The audit log keeps the old value. Update `database-schema.md`.

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
| `prisma/schema.prisma`, `prisma/migrations/…`       | `productBarcode` column and its `CHECK`                                                       |
| `src/lib/api-response.ts`                           | Add `PRODUCT_BARCODE_DUPLICATE`                                                               |
| `src/lib/validations/medicine.ts`                   | `productBarcode` on the create and update schemas                                             |
| `src/lib/validations/barcode.ts`                    | New. `productBarcodeSchema`, `barcodeLookupSchema`                                            |
| `src/lib/barcode.ts`                                | Add `parseBarcode(code)` → `{ kind: 'medicine' \| 'batch' \| 'product', code }`, and `productBarcodeVariants(code)` |
| `src/lib/medicines.ts`                              | Add `getBatchLabel(batchId)` and `findByBarcode(code)`; `productBarcode` in create, update, delete and `toMedicine` |
| `src/types/medicine.ts`                             | `productBarcode` on `Medicine`, and `ScanResult`                                              |
| `src/lib/navigation.ts`                             | Enable Medicines and Scan                                                                     |
| `src/actions/medicines.ts`                          | New. `createMedicine`, `updateMedicine`, `deleteMedicine`, `receiveStock`, `updateBatch`      |
| `src/actions/scan.ts`                               | New. `lookupBarcodeAction`                                                                    |
| `src/app/(app)/scan/page.tsx`                       | New. Checks the permission and renders `ScanView`                                             |
| `src/components/scan/CameraScanner.tsx`             | New. `'use client'`. `BarcodeScanner`, polyfill, error messages. Loaded with `ssr: false`      |
| `src/components/scan/ScanView.tsx`                  | New. `'use client'`. Camera, typed input and result                                           |
| `src/components/scan/ScanResult.tsx`                | New. Medicine or batch result, not-found state                                                |
| `src/app/(app)/medicines/page.tsx`                  | New. List                                                                                     |
| `src/app/(app)/medicines/[id]/page.tsx`             | New. Detail                                                                                   |
| `src/app/(print)/layout.tsx`                        | New. Bare layout, light only                                                                  |
| `src/app/(print)/labels/batches/[batchId]/page.tsx` | New. Label                                                                                    |
| `src/components/common/SearchInput.tsx`             | New. `'use client'`. Debounced `?search=`                                                     |
| `src/components/common/ListPagination.tsx`          | New. `'use client'`. Pagination snippet driving `?page=`                                      |
| `src/components/common/Barcode.tsx`                 | New. `'use client'`. Renders a Code 128 SVG with `react-barcode`, with the text under it     |
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
- `productBarcodeSchema` and `barcodeLookupSchema`: valid EAN/UPC, spaces and non-ASCII rejected, `MED-`/`BAT-` rejected as a product code, lowercase `med-` lookup uppercased, bad Crockford length rejected
- `parseBarcode` and `productBarcodeVariants`: each kind, 12- and 13-digit twins
- `findByBarcode`: medicine, batch with its medicine, product code and its twin, deleted medicine, unknown code
- Medicine lib: `PRODUCT_BARCODE_DUPLICATE` on `P2002`, soft delete clears the product barcode
- `lookupBarcodeAction`: permission, invalid input, not found, found
- `MedicineFormDialog`: the scan button fills the field (scanner mocked), duplicate product barcode shown on the field
- `CameraScanner`: each error message, `onDetected` called once
- `ScanView`: typed lookup on Enter, medicine and batch results, not found with and without `Add medicine`
- `MedicineTable`: rows, stock with unit, both empty states
- `BatchTable`: status colors and text, zero-quantity rows muted, edit item only with `medicine:write`
- `MedicineFormDialog`: field errors from `fields`, toast on other errors, Save disabled with no changes when editing
- `ReceiveStockDialog`: past-date warning, `created` true and false toasts
- List and detail pages: permission redirect, buttons shown per permission, `notFound()` for a deleted medicine
- `navigation.spec.ts`: Medicines and Scan are enabled

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
- [ ] Scanning a medicine box's barcode in the New medicine form fills Product barcode, and adding a second medicine with it shows the duplicate message
- [ ] `/scan` finds a medicine by its product barcode, its `MED-` barcode, and a printed `BAT-` label
- [ ] An unknown product code offers `Add medicine` to `admin`, with the code filled in
- [ ] Denying camera access shows the message, and typing a code still works, as does a USB scanner
- [ ] Closing the dialog or leaving `/scan` turns the camera off
- [ ] Both color modes are readable, and no page scrolls sideways at phone width

## Acceptance Criteria

- All goals are met and all manual checks pass
- Every action checks its permission on the server
- Expiry status on the detail page matches the dashboard and the API
- `npm` lint, test and build pass
