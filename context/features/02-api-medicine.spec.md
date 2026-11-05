# 02 — Authentication and Medicine API

## Overview

Add username and password login with **NextAuth**, then add REST API routes in `apps/app` to manage **medicines** and their **batches**: create, read, update, and soft-delete medicines, receive stock into batches, and edit batch details.

This feature is API only. It also adds a migration that audits medicine changes. It has no custom UI.

## Goals

- Login, logout and session endpoints from NextAuth, using the Credentials provider only
- A `requirePermission` helper that checks the session and the user's current role on every request
- A login attempt limit with a timed cooldown, and a "try again after n minutes" response
- CRUD endpoints for `medicines`, with soft delete
- Create, read and update endpoints for `medicine_batches`, where creating a batch also records received stock
- Generated `MED-…` and `BAT-…` barcodes
- Computed total stock and per-batch expiry status in responses
- The rules the database doesn't enforce, implemented in the API (see [Business rules](#business-rules))
- Every medicine and batch write recorded in `audit_logs` with the acting user
- Permission checks on every route
- Lint, test and build pass, and `prisma migrate status` reports in sync

## Out of Scope

- Google, GitHub or any other OAuth or email login
- User management, registration, and password change or reset
- A custom login page (NextAuth's built-in page is used for now)
- UI screens, barcode image rendering, scanning and barcode lookup
- Dispensing, count corrections, damaged/lost stock and expired disposal
- Reading inventory transactions and audit logs through the API
- Restoring a soft-deleted medicine
- Notifications and the SMS worker

---

## Decisions

| Topic                                  | Decision                                                                                                                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Deleting a medicine that has stock     | Blocked until total stock is 0. Deleted medicines also reject batch reads, batch writes and new stock.                                                                         |
| Duplicate medicines                    | Rejected with `409`. Checked in the app, not by a database constraint.                                                                                                         |
| Auditing medicine changes              | Yes. A new migration adds an audit trigger on `medicines`, which extends the "inventory movement only" scope in @context/database-schema.md.                                   |
| Deleting a batch                       | No endpoint. Every batch has a `RECEIVED` entry from the moment it's created, and the ledger's `ON DELETE RESTRICT` and immutability triggers mean it can never be hard-deleted. |
| Auth library                           | `next-auth` v4 (`^4.24.15`), the current stable release. It supports Next.js 16. v5 is still in beta.                                                                           |
| Login methods                          | Credentials provider only, using `users.username` and `users.password_hash`.                                                                                                    |
| Session storage                        | Encrypted JWT in an HTTP-only cookie, because the Credentials provider requires JWT sessions. No database adapter or session tables.                                            |
| Session length                         | 8 hours, instead of the 30-day default, because staff may share workstations.                                                                                                  |
| Permissions and active status          | Read from the database on every request, not stored in the JWT, so role changes and deactivations take effect immediately.                                                     |
| Login attempt limit                    | New `users.failed_login_attempts` and `users.last_login_attempt_at` columns. The counter goes up on every try and resets to 0 on success. At `LOGIN_MAX_ATTEMPTS`, the account locks for `LOGIN_COOLDOWN_MINUTES`. |
| Default admin password                 | Stays hardcoded in `prisma/seed.ts`. This feature doesn't change it.                                                                                                            |
| Unlocking an account                   | Locks expire after the cooldown. There is no admin reset endpoint.                                                                                                              |

---

## Authentication

### Endpoints

NextAuth provides these through one catch-all route, `src/app/api/auth/[...nextauth]/route.ts`. They use NextAuth's own response formats, not the [response format](#response-format) below.

| Endpoint                                | Purpose                                                                 |
| --------------------------------------- | ----------------------------------------------------------------------- |
| `GET /api/auth/csrf`                    | Returns `{ csrfToken }` and sets the CSRF cookie                        |
| `POST /api/auth/callback/credentials`   | Logs in                                                                 |
| `GET /api/auth/session`                 | Returns the current session, or `{}` when logged out                    |
| `POST /api/auth/signout`                | Logs out                                                                |
| `GET /api/auth/signin`                  | NextAuth's built-in login page                                          |

### Logging in

Send `application/x-www-form-urlencoded` with the CSRF cookie:

| Field         | Value                                  |
| ------------- | -------------------------------------- |
| `username`    | The user's username                    |
| `password`    | The user's password                    |
| `csrfToken`   | The value from `GET /api/auth/csrf`    |
| `json`        | `true`, to get JSON instead of a redirect |

- **Success:** `200` with `{ url }`, and the session cookie is set
- **Failure:** `401` with `{ url }`, where `url` contains `error=CredentialsSignin`. No session cookie is set.
- **Locked account:** `401` with `{ url }`, where the `error` value in `url` is the message, such as `Try again after 12 minutes`. No session cookie is set. `signIn('credentials', { redirect: false, … })` returns this text as `result.error`.

**Current limitation:** NextAuth's built-in pages show "Server error" for any message they don't recognize. The lockout message only displays once a custom login page calls `signIn` with `redirect: false`.

Browser clients should use `signIn('credentials', …)` and `signOut()` from `next-auth/react`, which handle the CSRF token.

Logging out takes `csrfToken` and `json=true` in the same format, and clears the session cookie.

### Session

`GET /api/auth/session` returns:

```json
{
  "user": { "id": "<users.id>", "username": "admin" },
  "expires": "2026-11-05T16:00:00.000Z"
}
```

The JWT and session hold only `id` and `username`. Never add the password hash, role or permissions to them.

### Credential checks

`authorizeCredentials(credentials)` runs in this order:

1. Validate with Zod: `username` is 1–100 characters and `password` is 1–200 characters. If invalid, return `null`.
2. Find the user by exact `username`, with their employee
3. If the user exists, count this try with one atomic update, which only succeeds if the user is under the limit or the cooldown has passed:

   ```ts
   const counted = await prisma.$executeRaw`
     UPDATE users
        SET failed_login_attempts = CASE
              WHEN failed_login_attempts >= ${maxAttempts} THEN 1
              ELSE failed_login_attempts + 1
            END,
            last_login_attempt_at = now(),
            updated_at = now()
      WHERE id = ${user.id}::uuid
        AND (failed_login_attempts < ${maxAttempts}
             OR last_login_attempt_at <= now() - make_interval(mins => ${cooldownMinutes}))`;
   ```

   `counted === 0` means the account is locked. Re-read `last_login_attempt_at`, work out the minutes left, and throw the lockout message without checking the password.
4. Run bcrypt `compare` against the user's hash. If the user doesn't exist, compare against a fixed dummy hash, so response time doesn't reveal which usernames exist.
5. Return `null` if the password is wrong, or if the user or employee is inactive, or the employee is soft-deleted
6. Set `failed_login_attempts` to 0 and update `last_login_at`
7. Return `{ id, name: username }`

Every failure other than a locked account gives the same `CredentialsSignin` response. **The lockout message is the only error `authorize` may throw:** NextAuth copies a thrown error's message into the redirect URL. Catch unexpected errors, log them on the server and return `null`.

### Login attempt limit

- Counting happens before the password check, so parallel requests can't get more guesses than the limit allows
- With `LOGIN_MAX_ATTEMPTS=5`, a user gets 5 tries. If none succeed, later tries are rejected even with the correct password until the cooldown has passed.
- The cooldown runs from `last_login_attempt_at`. Rejected tries during a lockout don't update it, so retrying doesn't extend the lockout.
- After the cooldown, the next try counts as attempt 1, so the user gets a full set of tries again
- The message is `Try again after n minutes`, rounding up so it never says 0, with `Try again after 1 minute` for the singular. `getLockoutMinutesRemaining(lastAttemptAt, cooldownMinutes, now)` is a pure function so it can be tested without a database.
- Unknown usernames have no row to count, and never see the lockout message
- Locking blocks new logins only. Sessions that are already active keep working until they expire.
- If `LOGIN_MAX_ATTEMPTS` or `LOGIN_COOLDOWN_MINUTES` is missing or isn't a positive integer, log an error and reject every login, so the limit can't be switched off by accident

### `requirePermission`

The medicine routes use this helper from `src/lib/auth.ts`:

```ts
requirePermission(...required: Permission[]): Promise<AuthenticatedUser>
```

It gets the session with `getServerSession(authOptions)`, then loads the user's active flags and role permissions in one query.

- Returns `{ id: string }` when the caller holds **all** required permissions, using `hasPermission()`
- Throws `ApiError` `401` when there is no valid session, the user is missing or inactive, or the employee is inactive or soft-deleted
- Throws `ApiError` `403` when a permission is missing

The returned `id` is the value passed to `withActor` and stored in `performed_by` and `created_by`. There must be no anonymous or hardcoded-user fallback.

### Environment variables

Add to `.env.example`:

| Variable          | Purpose                                                                         |
| ----------------- | ------------------------------------------------------------------------------- |
| `NEXTAUTH_URL`    | The app's base URL. `http://localhost:3000` locally.                            |
| `NEXTAUTH_SECRET` | Encrypts session JWTs. Generate with `openssl rand -base64 32`. Never commit a real value. |
| `LOGIN_MAX_ATTEMPTS` | Login tries allowed before an account locks. `5` in `.env.example`.          |
| `LOGIN_COOLDOWN_MINUTES` | Minutes an account stays locked. `15` in `.env.example`.                 |

---

## Files

All paths are relative to `apps/app/`.

| File                                                     | Purpose                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------- |
| `.env.example`                                           | `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `LOGIN_MAX_ATTEMPTS` and `LOGIN_COOLDOWN_MINUTES` |
| `prisma/schema.prisma`                                   | `failedLoginAttempts` and `lastLoginAttemptAt` on `User`      |
| `prisma/migrations/<ts>_add_user_login_attempt_tracking/migration.sql` | Adds `users.failed_login_attempts` and `users.last_login_attempt_at` |
| `prisma/migrations/<ts>_audit_medicines/migration.sql`   | Audit trigger on `medicines`                                  |
| `src/app/api/auth/[...nextauth]/route.ts`                | NextAuth `GET` and `POST` handlers                            |
| `src/lib/auth-options.ts`                                | `authOptions` and `authorizeCredentials`                      |
| `src/lib/auth.ts`                                        | `requirePermission`                                           |
| `src/types/next-auth.d.ts`                               | Adds `id` and `username` to the NextAuth session and JWT types |
| `src/app/api/medicines/route.ts`                         | `GET` list, `POST` create                                     |
| `src/app/api/medicines/[id]/route.ts`                    | `GET` detail, `PATCH` update, `DELETE` soft delete            |
| `src/app/api/medicines/[id]/batches/route.ts`            | `POST` receive stock                                          |
| `src/app/api/medicines/[id]/batches/[batchId]/route.ts`  | `GET` detail, `PATCH` update                                  |
| `src/lib/medicines.ts`                                   | Server-only database logic for medicines and batches          |
| `src/lib/validations/medicine.ts`                        | Zod schemas                                                   |
| `src/lib/api-response.ts`                                | Response helpers, `ApiError`, and error-to-response mapping   |
| `src/lib/barcode.ts`                                     | `generateMedicineBarcode()`, `generateBatchBarcode()`         |
| `src/lib/expiry.ts`                                      | `getLocalToday(timezone)`, `getExpiryStatus(...)`             |
| `src/types/medicine.ts`                                  | API response types                                            |
| `specs/lib/*.spec.ts`, `specs/api/medicines/*.spec.ts`   | Unit and route tests                                          |

Route handlers stay thin: check permission, validate input, call `src/lib/medicines.ts`, and return a response.

---

## Dependencies

- `next-auth@^4.24.15`, installed in the root `package.json` and added to `apps/app/package.json`
- `bcrypt` and `zod` are already installed. Next.js already treats `bcrypt` as an external server package, so no config change is needed.

---

## Medicine API

### Permissions

| Endpoint                                     | Required permission                 |
| -------------------------------------------- | ----------------------------------- |
| `GET /api/medicines`                         | `medicine:read`                     |
| `POST /api/medicines`                        | `medicine:write`                    |
| `GET /api/medicines/:id`                     | `medicine:read`                     |
| `PATCH /api/medicines/:id`                   | `medicine:write`                    |
| `DELETE /api/medicines/:id`                  | `medicine:write`                    |
| `POST /api/medicines/:id/batches`            | `medicine:write`, `inventory:write` |
| `GET /api/medicines/:id/batches/:batchId`    | `medicine:read`                     |
| `PATCH /api/medicines/:id/batches/:batchId`  | `medicine:write`                    |

Receiving stock needs both permissions because it creates a batch and moves inventory. With the seeded roles, `admin` and `staff` can use every endpoint, and `collaborator` can only read.

### Response format

Success:

```json
{ "success": true, "data": {} }
```

Failure:

```json
{
  "success": false,
  "error": {
    "code": "MEDICINE_DUPLICATE",
    "message": "A medicine with this name, strength and dosage form already exists."
  }
}
```

Validation failures also include `error.fields`, which maps each field to its messages.

### Errors

| Status | Code                  | When                                                             |
| ------ | --------------------- | ---------------------------------------------------------------- |
| `400`  | `INVALID_JSON`        | The request body isn't valid JSON                                |
| `400`  | `VALIDATION_ERROR`    | A body, query or path value fails validation, including non-UUID IDs |
| `401`  | `UNAUTHENTICATED`     | No valid session                                                 |
| `403`  | `FORBIDDEN`           | A required permission is missing                                 |
| `404`  | `NOT_FOUND`           | The medicine doesn't exist or is soft-deleted, or the batch doesn't exist or belongs to another medicine |
| `409`  | `MEDICINE_DUPLICATE`  | Another active medicine has the same name, strength and dosage form |
| `409`  | `MEDICINE_HAS_STOCK`  | Deleting a medicine whose total stock is above 0                 |
| `409`  | `BATCH_DUPLICATE`     | A batch edit collides with another batch's number and expiry     |
| `500`  | `INTERNAL_ERROR`      | Anything unexpected. Log the details and return a generic message. |

### Data shapes

```ts
interface Medicine {
  id: string;
  name: string;
  genericName: string | null;
  strength: string | null;
  dosageForm: string | null;
  unit: string;
  barcode: string;
  totalStock: number; // SUM of batch quantities, including expired batches
  createdAt: string;
  updatedAt: string;
}

interface MedicineBatch {
  id: string;
  medicineId: string;
  batchNumber: string;
  barcode: string;
  expirationDate: string; // YYYY-MM-DD
  quantity: number;
  status: 'SAFE' | 'NEAR_EXPIRY' | 'EXPIRED'; // computed at read time
  daysToExpiry: number; // negative = days since expiry
  receivedAt: string;
  createdAt: string;
  updatedAt: string;
}
```

### Medicines

#### `GET /api/medicines`

| Query      | Rules                                                              |
| ---------- | ------------------------------------------------------------------ |
| `search`   | Optional. Case-insensitive partial match on `name` and `genericName` |
| `page`     | Optional integer, at least 1. Default `1`                          |
| `pageSize` | Optional integer from 1 to 100. Default `20`                       |

Returns `{ items: Medicine[], total, page, pageSize }`, sorted by `name`, then `id`. Excludes soft-deleted medicines.

Get `totalStock` with one `groupBy` over the page's medicine IDs, not one query per medicine.

#### `POST /api/medicines`

```json
{
  "name": "Paracetamol",
  "genericName": "Acetaminophen",
  "strength": "500 mg",
  "dosageForm": "tablet",
  "unit": "pc"
}
```

- `name` is required
- `unit` is optional and defaults to `pc`
- The other fields are optional

Returns `201` with the `Medicine`, where `totalStock` is 0.

#### `GET /api/medicines/:id`

Returns `Medicine & { batches: MedicineBatch[] }`, with batches in FEFO order (`expirationDate`, `receivedAt`, `id`). Includes batches with 0 quantity.

#### `PATCH /api/medicines/:id`

Accepts any of `name`, `genericName`, `strength`, `dosageForm` and `unit`, with at least one field. `genericName`, `strength` and `dosageForm` can be set to `null`. `name` and `unit` can't.

Returns the updated `Medicine`.

#### `DELETE /api/medicines/:id`

Sets `deleted_at`. Returns `200` with `{ id }`. Fails with `409 MEDICINE_HAS_STOCK` if total stock is above 0.

### Batches

#### `POST /api/medicines/:id/batches`

Receives stock:

```json
{
  "batchNumber": "A123",
  "expirationDate": "2027-06-30",
  "quantity": 100,
  "notes": "Delivery #55"
}
```

- `batchNumber`, `expirationDate` and `quantity` are required
- `notes` is optional and is stored on the inventory transaction
- A past `expirationDate` is allowed, so existing expired stock can be recorded and then alerted on

If the medicine already has a batch with the same number and expiry, the stock is added to it and the response is `200`. Otherwise a new batch is created and the response is `201`. Both return the `MedicineBatch`.

#### `GET /api/medicines/:id/batches/:batchId`

Returns the `MedicineBatch`.

#### `PATCH /api/medicines/:id/batches/:batchId`

Accepts `batchNumber` and `expirationDate`, with at least one field. Returns the updated `MedicineBatch`.

Stock can't be changed here. Stock corrections belong to the inventory movement feature.

---

## Validation

Define these in `src/lib/validations/medicine.ts`:

- All object schemas are `.strict()`, so sending `quantity`, `barcode`, `medicineId`, `deletedAt` or any other unknown field to a create or update route returns `400`
- Text fields are trimmed
- Optional text fields that are blank are stored as `null`, so duplicate checks never have to compare `''` with `null`
- Maximum lengths: `name`, `genericName` 200; `strength`, `dosageForm`, `batchNumber` 100; `unit` 20; `notes` 500
- `quantity` is an integer from 1 to 1,000,000
- `expirationDate` uses `z.iso.date()`
- Path IDs use `z.uuid()`

---

## Business rules

### Barcodes

- Generated on the server, never accepted from the client, and never changed
- Format: the prefix plus 12 random uppercase base32 characters from `crypto.randomBytes`, such as `MED-7K2M9QX4T1AB`
- Soft-deleted medicines keep their barcode, and values aren't reused

### Duplicate medicines

Two active medicines are duplicates when `name`, `strength` and `dosageForm` all match, ignoring case and surrounding whitespace. Two `null` values count as a match.

- `POST` and `PATCH` both check. `PATCH` compares the merged values and excludes the medicine being edited.
- Soft-deleted medicines don't count, so a deleted medicine can be added again.
- A check alone can race, so take a lock inside the transaction before checking. The key is the lowercased name, strength and dosage form:

  ```ts
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}::text, 0))`;
  ```

  On `PATCH`, take the lock only if one of these three fields changes.

### Soft delete

In one `withActor` transaction:

1. Lock the medicine row with `SELECT … FOR UPDATE`, and return `404` if it's missing or already deleted
2. Sum its batch quantities, and return `409 MEDICINE_HAS_STOCK` if the total is above 0
3. Set `deleted_at`

Since a medicine can't be deleted with stock, the daily digest won't alert on deleted medicines.

**Current limitation:** this feature has no way to remove stock, so a medicine that has received stock can't be deleted until the inventory movement feature ships.

### Receiving stock

In one `withActor` transaction:

1. Lock the medicine row with `SELECT … FOR UPDATE`, and return `404` if it's missing or deleted. This also serializes concurrent receives, so two requests can't both create the same batch.
2. Find the batch by `medicineId`, `batchNumber` and `expirationDate`
3. If none exists, create one with a generated barcode and let `quantity` default to 0
4. Insert an `inventory_transactions` row with `IN`, `RECEIVED`, the quantity, `performed_by` and `notes`
5. Insert one `inventory_entries` row. The trigger updates the batch quantity.
6. Re-read the batch for the response

Never set `quantity` directly. Later inventory features must also take this medicine lock and reject deleted medicines, so stock can't arrive during a delete.

### Immutable batch fields

`medicine_id`, `barcode`, `quantity` and `received_at` can't be changed through the API. The database doesn't enforce this, so the strict `PATCH` schema and the update query must both cover only `batchNumber` and `expirationDate`.

### Expiry status

Follow @context/database-schema.md, using `settings.timezone` and `settings.near_expiry_threshold_days`:

- `expiration_date < today`: `EXPIRED`
- `expiration_date - today <= threshold`: `NEAR_EXPIRY`
- Otherwise: `SAFE`

`getExpiryStatus` is a pure function so it can be tested without a database. Keep `@db.Date` values as `YYYY-MM-DD` in UTC when converting them, so dates don't shift by a day under UTC+8.

### Writes and auditing

Every medicine and batch write goes through `withActor`, including soft deletes. Prisma `P2002` errors become `409` where listed above, and any other database error becomes `500`.

---

## Implementation Steps

### 1. Authentication

Add the columns to `User` in `prisma/schema.prisma`:

```prisma
failedLoginAttempts Int       @default(0) @map("failed_login_attempts")
lastLoginAttemptAt  DateTime? @map("last_login_attempt_at") @db.Timestamptz
```

Apply them:

```bash
TASK=prisma:migrate APP=app npm run task -- --name add_user_login_attempt_tracking
```

Install `next-auth`, add the environment variables, and create the route:

```ts
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth-options';

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
```

In `src/lib/auth-options.ts`:

- `providers`: one `CredentialsProvider` that calls `authorizeCredentials`
- `session`: `{ strategy: 'jwt', maxAge: 8 * 60 * 60 }`
- `callbacks.jwt`: copy `username` onto the token at sign-in
- `callbacks.session`: set `session.user.id` from `token.sub` and `session.user.username` from the token

Keep `authOptions` out of `route.ts`, because Next.js route files may only export route handlers and route config. Then add `requirePermission` and the type declarations.

### 2. Audit migration

Run:

```bash
TASK=prisma:migrate:create APP=app npm run task -- --name audit_medicines
```

Add to the generated `migration.sql`, then apply it with `prisma:migrate`:

```sql
CREATE TRIGGER medicines_audit AFTER INSERT OR UPDATE OR DELETE ON medicines
  FOR EACH ROW EXECUTE FUNCTION write_audit_log();
```

The schema doesn't change. A soft delete is logged as `updated`, with `deleted_at` set in `changes.after`.

### 3. Update docs

- @context/database-schema.md: add `failedLoginAttempts` and `lastLoginAttemptAt` to the `User` model, add `medicines` to the Audit Trail table and raw SQL, and change the "only to inventory movement" wording
- `src/lib/with-actor.ts`: update the comment so it says medicine writes must use `withActor` too
- `README.md`: mention setting `NEXTAUTH_SECRET` in the environment file step

### 4. Shared helpers

Add `barcode.ts`, `expiry.ts`, `api-response.ts`, the Zod schemas and the response types.

### 5. Data layer

Add `src/lib/medicines.ts` following [Business rules](#business-rules), with `import 'server-only'`.

### 6. Route handlers

Add the routes, using the Next.js 16 async params:

```ts
export async function GET(request: NextRequest, ctx: RouteContext<'/api/medicines/[id]'>) {
  const { id } = await ctx.params;
}
```

Read the route handler docs in `node_modules/next/dist/docs/` before writing them.

---

## Testing

Unit and route tests (Jest, no database):

- `authorizeCredentials`, with Prisma mocked: valid login resets the counter, wrong password keeps the increment, locked account with the correct password throws the lockout message without comparing the hash, unknown username (the dummy hash is still compared), inactive user, inactive employee, soft-deleted employee, invalid input, missing or invalid `LOGIN_MAX_ATTEMPTS` or `LOGIN_COOLDOWN_MINUTES`, and a database error returning `null` without throwing
- `getLockoutMinutesRemaining`: full cooldown left, part of a minute rounds up, exactly 1 minute left
- `requirePermission`, with the session and Prisma mocked: no session, inactive user, inactive employee, missing permission, one of two required permissions missing, wildcard permissions, and success
- `getExpiryStatus`: expired yesterday, expires today, exactly on the threshold, one day past the threshold
- `getLocalToday`: returns the Manila date when UTC is still on the previous day
- Barcode generators: correct prefix and format
- Zod schemas: trims text, turns blanks into `null`, rejects unknown fields, empty `PATCH` bodies, invalid dates, and quantities of 0 or above the limit
- Routes, with the data layer and `requirePermission` mocked: `401`, `403`, `400` for invalid IDs and JSON, and the response format for each status

Manual checks against a local database (record results in the PR):

- [ ] `prisma migrate status` reports up to date
- [ ] Logging in with the seeded admin sets an HTTP-only session cookie and updates `last_login_at`
- [ ] A wrong password and an unknown username give the same `401` response
- [ ] Each wrong password adds 1 to `failed_login_attempts` and updates `last_login_attempt_at`, and a successful login resets the counter to 0
- [ ] After `LOGIN_MAX_ATTEMPTS` wrong tries, the correct password gets `401` with `Try again after n minutes`, and the counter doesn't go above the limit
- [ ] Rejected tries during a lockout don't change `last_login_attempt_at`, and the minutes in the message count down
- [ ] Parallel wrong tries don't push the counter above the limit
- [ ] After the cooldown, the correct password logs in and resets the counter to 0
- [ ] After the cooldown, a wrong password sets the counter to 1 and returns the normal `CredentialsSignin` failure
- [ ] An unknown username never gets the lockout message, however many tries are made
- [ ] Logging in without a valid CSRF token doesn't create a session
- [ ] `GET /api/auth/session` returns only `id`, `username` and `expires`
- [ ] Logging out clears the session, and medicine routes then return `401`
- [ ] Medicine routes return `401` without a session cookie and with a tampered one
- [ ] Deactivating a logged-in user makes their next request return `401`
- [ ] Changing a logged-in user's role changes their access on the next request
- [ ] Only the Credentials provider appears on `GET /api/auth/signin`
- [ ] Creating a medicine returns a `MED-…` barcode, and `audit_logs` has a `created` row with `actor_id` set
- [ ] Editing a medicine writes an `updated` audit row with before and after values
- [ ] Creating a duplicate returns `409`, including with different letter case and when both have `null` strength
- [ ] Editing a medicine into a duplicate returns `409`, and saving it with its own values succeeds
- [ ] Two concurrent identical creates produce one medicine and one `409`
- [ ] A deleted medicine's name can be used again
- [ ] Receiving stock creates a `BAT-…` batch, one transaction and one entry, and the quantity matches
- [ ] Receiving the same batch number and expiry again returns `200` and adds to the same batch
- [ ] The same batch number with a different expiry creates a new batch
- [ ] Editing a batch into another batch's number and expiry returns `409`
- [ ] Sending `quantity`, `barcode` or `medicineId` in `PATCH` returns `400`
- [ ] Deleting a medicine with stock returns `409`
- [ ] Deleting a medicine at 0 stock succeeds, after removing stock with a direct `OUT` transaction in SQL
- [ ] A deleted medicine returns `404` on read, update, delete and receive, and is missing from the list
- [ ] A batch requested under the wrong medicine returns `404`
- [ ] `collaborator` can read but gets `403` on every write
- [ ] `totalStock` and batch `status` are correct for safe, near-expiry and expired batches

## Acceptance Criteria

- Users can log in and out with a username and password, and no other login method exists
- A locked-out user gets the "try again after n minutes" response and can log in again after the cooldown
- Every endpoint behaves as documented, and all manual checks pass
- Every medicine and batch write has an `audit_logs` row with `actor_id` set
- No medicine route is reachable without authentication and the required permission
- No real `NEXTAUTH_SECRET` or `.env` file is committed
- @context/database-schema.md reflects the new audit trigger
- `npm` lint, test and build pass
