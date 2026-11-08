# 13 — Scan and Stock Movements

## Overview

Add browser-based barcode scanning and the screens that move stock out of, or back into, batches: dispense, count correction, damaged, lost, returned and expired disposal.

`/scan` reads a `MED-` or `BAT-` barcode with the device camera, or from typed input, and shows the actions that fit what was scanned. The same action forms also appear on the medicine detail page from feature 12, so every movement can be done with or without a camera.

It needs no schema change or migration. It adds one lib function to look up a barcode.

## Goals

- `/scan` reads Code 128 barcodes from the camera, with a typed fallback that also works with a USB keyboard-wedge scanner
- A medicine barcode shows the medicine, its stock, and a Dispense form
- A batch barcode shows the batch, and forms to receive more, correct the count, record damaged, lost or returned stock, and dispose of it once expired
- The medicine detail page gets Dispense and Dispose expired buttons, and each batch row's menu gets the batch actions
- Every movement checks `inventory:write` on the server
- The Scan nav item is enabled
- Lint, test and build pass

## Out of Scope

- QR codes and barcodes not made by InventraMed. Anything without a `MED-` or `BAT-` prefix shows `Not an InventraMed barcode`.
- Scanning several items into a cart before dispensing
- Offline scanning
- Undoing a movement. The ledger is append-only; a mistake is fixed with an offsetting movement.
- Transaction history (feature 17)

---

## Current state

Checked in the code on 2026-11-08.

### Already in place

| Area              | Where                                    | Behavior                                                                            |
| ----------------- | ---------------------------------------- | ----------------------------------------------------------------------------------- |
| Dispense          | `dispense(actorId, medicineId, input)`   | FEFO across usable batches, never expired ones. `INSUFFICIENT_STOCK` with `fields.quantity` |
| Batch movement    | `recordBatchMovement(actorId, medicineId, batchId, input)` | `DAMAGED`/`LOST`, `RETURNED` with a direction, and `COUNT_ADJUSTMENT` from a counted quantity. Returns `{ transaction, batch }`, with `transaction: null` when the count matched |
| Expired disposal  | `disposeExpiredStock(actorId, medicineId, input)` | All expired batches, or the listed `batchIds`. `NO_EXPIRED_STOCK`, `BATCH_NOT_EXPIRED` |
| Receive stock     | `receiveStock` and its action from feature 12 | Adds to the batch with the same number and expiry                               |
| Validation        | `src/lib/validations/inventory.ts`       | `dispenseSchema`, `batchMovementSchema`, `expiredDisposalSchema`. Notes are required for batch movements. |
| Action plumbing   | Feature 12                               | `runAction`, `requirePageUser`, `revalidatePath` pattern                            |

### Missing

- No lookup by barcode. `listMedicines` searches names only, and `getBatch` needs the medicine ID.
- No camera access or barcode decoding in the app

### Facts that affect this feature

- Browsers only allow camera access in a secure context: HTTPS, or `localhost`. Opening the app over a LAN address such as `http://192.168.1.10:3000` gives no camera. The server needs HTTPS before phones on the network can scan.
- The native `BarcodeDetector` API is missing from Firefox and desktop Safari, so a JavaScript decoder is needed for consistent behavior.
- A USB barcode scanner acts as a keyboard: it types the code and presses Enter.

---

## Decisions

| Topic                 | Decision                                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Decoder               | `@zxing/browser` (Apache-2.0), limited to Code 128 for speed. Check its current API with Context7 before use.                                 |
| Camera                | Off until the user presses `Start camera`. Prefers the rear camera (`facingMode: environment`), with a camera picker when there are several. Stops when the page is left or a code is read. |
| After a read          | The camera pauses and the result panel opens, so one code isn't read ten times. `Scan again` resumes it.                                    |
| Typed fallback        | Always visible. Trims and uppercases the input, and submits on Enter, so keyboard-wedge scanners work with no camera.                        |
| Lookup                | New `findByBarcode(code)` routes on the prefix: `MED-` to a medicine, `BAT-` to a batch with its medicine. Deleted medicines count as not found. |
| Lookup transport      | A Server Action `lookupBarcode(code)`, requiring `medicine:read`, validated with a Zod schema of the prefix plus 12 Crockford characters        |
| State                 | A `zustand` store (`src/stores/scan-store.ts`) holds the camera state, the last result and the open action, because the scanner, the typed input and the result panel are separate components |
| Forms                 | One client component per movement in `src/components/movements/`, used by both `/scan` and the medicine detail page                         |
| After a movement      | Toast, `revalidatePath` for the medicine pages, `/` and `/scan`, and on `/scan` the result panel re-runs the lookup so the stock shown is current |
| Count correction      | The form asks for the counted quantity and shows the difference before saving. A matching count shows `Count matches, nothing recorded.`     |
| Expired disposal      | On a batch, it disposes that batch only (`batchIds: [id]`). On a medicine, it lists the expired batches with stock and disposes all of them, or the ones ticked. |
| Expired batches       | Dispense is FEFO over usable batches only, so a medicine scan shows a note when expired stock exists: `{n} expired, not dispensable.`        |
| Sound and vibration   | None. Visual feedback only.                                                                                                               |

---

## UI

### `/scan`

Requires `medicine:read`. Actions need `inventory:write` (receive also needs `medicine:write`), and are hidden without it.

```
 Scan
 ─────────────────────────────────────────────────────────────────────
 ┌──────────────────────────────┐   Or enter a barcode
 │                              │   [ MED-… or BAT-…          ] [ Look up ]
 │        camera preview        │
 │                              │
 └──────────────────────────────┘
 [ Start camera ]  [ Camera: Back ▾ ]

 ── Result ────────────────────────────────────────────────────────────
 Paracetamol 500 mg                          MED-7Q2K…   [ Open medicine ]
 Stock 150 pc · 2 batches · 20 pc expired, not dispensable

 [ Dispense ]
```

Batch result:

```
 Batch P778 · Paracetamol 500 mg             BAT-91XZ…   [ Open medicine ]
 Expires 2026-11-12 · ● 4d left · 150 pc

 [ Receive more ] [ Count ] [ Damaged ] [ Lost ] [ Returned ] [ Dispose expired ]
```

- `Dispose expired` only appears when the batch is expired and has stock
- Camera errors are shown inline, not as toasts:

| Situation                     | Message                                                                 |
| ----------------------------- | ----------------------------------------------------------------------- |
| Permission denied             | `Camera access was blocked. Allow it in your browser settings, or type the barcode.` |
| No camera                     | `No camera found. Type the barcode instead.`                            |
| Not a secure context          | `The camera needs HTTPS. Type the barcode, or open the app over HTTPS.` |
| Unknown prefix                | `Not an InventraMed barcode.`                                           |
| Valid format, no match        | `No medicine or batch has this barcode.`                                |

- Page title: `Scan | InventraMed`

### Movement forms

All are dialogs. Each shows the medicine, batch and current quantity at the top.

| Form             | Fields                                                     | Action                 | Success toast                              |
| ---------------- | ---------------------------------------------------------- | ---------------------- | ------------------------------------------ |
| Dispense         | Quantity*, Notes                                           | `dispenseAction`       | `Dispensed {n} {unit}`                     |
| Receive more     | Quantity*, Notes. Batch number and expiry are fixed        | `receiveStockAction` (feature 12) | `Added {n} {unit} to batch {b}` |
| Count            | Counted quantity*, Notes*. Shows `Difference: +3` or `−3`  | `recordMovementAction` | `Count updated` or `Count matches, nothing recorded.` |
| Damaged / Lost   | Quantity*, Notes*                                          | `recordMovementAction` | `Recorded {n} {unit} as damaged` / `lost`  |
| Returned         | Direction* (`Returned to stock` / `Returned to supplier`), Quantity*, Notes* | `recordMovementAction` | `Return recorded`            |
| Dispose expired  | Batches to dispose (medicine only), Notes                  | `disposeExpiredAction` | `Disposed {n} {unit} of expired stock`     |

- `*` marks required fields
- `INSUFFICIENT_STOCK` shows its `fields.quantity` message (`Only N available.`) under Quantity
- Quantity inputs use `inputMode="numeric"`, so phones show a number pad

### Medicine detail page additions

- Header: `Dispense` and `Dispose expired`, next to `Receive stock`, with `inventory:write`. `Dispose expired` is disabled with no expired stock.
- Batch row menu: `Receive more`, `Count`, `Damaged`, `Lost`, `Returned`, and `Dispose` for an expired batch with stock

---

## Implementation

### Dependencies

- `@zxing/browser` and its peer `@zxing/library`. Install in the root `package.json`, then in `apps/app`.

### Files

All paths are relative to `apps/app/`.

| File                                              | Change                                                                                  |
| ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `src/lib/barcode.ts`                              | Add `BARCODE_PATTERN` and `parseBarcode(code)` returning `{ kind: 'medicine' \| 'batch', code }` or `null` |
| `src/lib/validations/barcode.ts`                  | New. `barcodeSchema`: trims, uppercases, matches the pattern                             |
| `src/lib/medicines.ts`                            | Add `findByBarcode(code)`                                                                |
| `src/types/scan.ts`                               | New. `ScanResult` union: `{ kind: 'medicine', medicine: MedicineDetail }` or `{ kind: 'batch', batch: MedicineBatch, medicine: MedicineDetail }` |
| `src/actions/scan.ts`                             | New. `lookupBarcode`                                                                     |
| `src/actions/inventory.ts`                        | New. `dispenseAction`, `recordMovementAction`, `disposeExpiredAction`                    |
| `src/stores/scan-store.ts`                        | New. `zustand` store                                                                     |
| `src/app/(app)/scan/page.tsx`                     | New. Server component that checks permissions and renders the client scanner             |
| `src/components/scan/CameraScanner.tsx`           | New. `'use client'`. Camera, decoding, camera picker, errors                             |
| `src/components/scan/BarcodeInput.tsx`            | New. `'use client'`                                                                      |
| `src/components/scan/ScanResultPanel.tsx`         | New. `'use client'`                                                                      |
| `src/components/movements/*.tsx`                  | New. `DispenseDialog`, `CountDialog`, `LossDialog` (damaged and lost), `ReturnDialog`, `DisposeExpiredDialog`, `ReceiveMoreDialog` |
| `src/components/medicines/BatchTable.tsx`, medicine detail page | Add the buttons and menu items above                                      |
| `src/lib/navigation.ts`                           | Enable Scan                                                                              |

`findByBarcode` returns the full `MedicineDetail` in both cases, so the result panel can show stock and expired totals without a second call.

Movements are passed `medicineId` and `batchId` from the lookup result, and the server re-checks that the batch belongs to the medicine, as the lib already does.

---

## Testing

Unit and component tests (Jest, no database). Mock `@zxing/browser` and `navigator.mediaDevices`.

- `parseBarcode` and `barcodeSchema`: valid `MED-` and `BAT-`, lowercase and padded input, wrong prefix, wrong length, excluded Crockford letters
- `findByBarcode`: medicine, batch with its medicine, deleted medicine, unknown code
- `lookupBarcode`: permission, invalid format, not found
- Each inventory action: permission, validation, lib call, revalidated paths, `INSUFFICIENT_STOCK` fields passed through
- `CountDialog`: difference shown, matching count message
- `DisposeExpiredDialog`: batch mode sends one ID; medicine mode lists only expired batches with stock
- `ScanResultPanel`: medicine and batch results, actions hidden without `inventory:write`, `Dispose expired` only for expired batches
- `CameraScanner`: start, decode pauses and stores the result, each error message, stops on unmount
- `BarcodeInput`: Enter submits, input is normalized

Manual checks, on a phone over HTTPS and on a laptop at `localhost`:

- [ ] Printing a label from feature 12 and scanning it with a phone opens the batch result
- [ ] Scanning the medicine barcode shows the medicine and Dispense
- [ ] Dispensing more than the usable stock shows `Only N available.`
- [ ] Dispensing takes from the earliest-expiring usable batch first and skips expired ones
- [ ] Count, damaged, lost and both return directions each change the batch quantity as expected
- [ ] Disposing an expired batch sets it to 0, and it leaves the dashboard's "Needs attention" list
- [ ] Typing a code and pressing Enter works, and so does a USB scanner
- [ ] Denying camera access shows the message and the typed input still works
- [ ] A `collaborator` can look up codes but sees no actions, and a crafted action call returns `FORBIDDEN`
- [ ] Leaving `/scan` turns the camera off

## Acceptance Criteria

- All goals are met and all manual checks pass
- The camera never starts without the user pressing `Start camera`
- Every movement goes through the existing lib functions, so the FEFO, locking and ledger rules are unchanged
- `npm` lint, test and build pass
