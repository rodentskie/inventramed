# 03 — Create Employee API

## Overview

Add two REST endpoints in `apps/app`:

- `GET /api/roles` lists the seeded roles, so clients can get a role's UUID
- `POST /api/employees` creates an **employee** and their **user** login together in one Prisma transaction. Either both rows are saved or neither is.

This feature is API only, and it needs no schema change or migration.

## Goals

- `GET /api/roles` returns every role with its ID
- `POST /api/employees` inserts one `employees` row and one `users` row in one transaction
- Both endpoints require a logged-in user with the right permissions
- The new user is assigned one of the seeded roles by `roleId`
- Contact numbers are validated as Philippine mobile numbers with the `+63` country code
- Passwords are stored only as bcrypt hashes and never returned
- New accounts can log in through the existing NextAuth flow
- Lint, test and build pass, and `prisma migrate status` reports in sync

## Out of Scope

- Create, update or delete on `roles` and `role_permissions`. They are seeded by `prisma/seed.ts`, and `GET /api/roles` is the only read.
- Bearer tokens or any other new login method. Authentication stays as the existing NextAuth session cookie.
- Listing, reading, updating, deactivating or deleting employees and users
- Creating a login for an existing employee
- Password change or reset
- Audit logging for `employees` and `users`
- UI screens

---

## Current database

Checked on the local database through the Postgres MCP on 2026-11-06. It matches @context/database-schema.md.

### `employees`

| Column                | Type          | Null | Default             | Notes                     |
| --------------------- | ------------- | ---- | ------------------- | ------------------------- |
| `id`                  | `uuid`        | no   | `gen_random_uuid()` | Primary key               |
| `first_name`          | `text`        | no   |                     |                           |
| `middle_name`         | `text`        | yes  |                     |                           |
| `last_name`           | `text`        | no   |                     |                           |
| `email`               | `text`        | yes  |                     | Unique, case-sensitive    |
| `contact_number`      | `text`        | yes  |                     | Stored as `+639XXXXXXXXX` |
| `position`            | `text`        | yes  |                     |                           |
| `receives_sms_alerts` | `boolean`     | no   | `false`             |                           |
| `is_active`           | `boolean`     | no   | `true`              |                           |
| `created_at`          | `timestamptz` | no   | `CURRENT_TIMESTAMP` |                           |
| `updated_at`          | `timestamptz` | no   |                     | Set by Prisma             |
| `deleted_at`          | `timestamptz` | yes  |                     | Soft delete               |

`employees_sms_requires_contact` is a `CHECK`: `receives_sms_alerts` can only be true when `contact_number` is set.

### `users`

| Column                  | Type          | Null | Default             | Notes                            |
| ----------------------- | ------------- | ---- | ------------------- | -------------------------------- |
| `id`                    | `uuid`        | no   | `gen_random_uuid()` | Primary key                      |
| `employee_id`           | `uuid`        | no   |                     | Unique, FK to `employees`, restrict on delete |
| `username`              | `text`        | no   |                     | Unique, case-sensitive           |
| `password_hash`         | `text`        | no   |                     |                                  |
| `role_id`               | `uuid`        | no   |                     | FK to `roles`, restrict on delete |
| `is_active`             | `boolean`     | no   | `true`              |                                  |
| `last_login_at`         | `timestamptz` | yes  |                     | Set at login                     |
| `failed_login_attempts` | `integer`     | no   | `0`                 | Set at login                     |
| `last_login_attempt_at` | `timestamptz` | yes  |                     | Set at login                     |
| `created_at`            | `timestamptz` | no   | `CURRENT_TIMESTAMP` |                                  |
| `updated_at`            | `timestamptz` | no   |                     | Set by Prisma                    |

### Seeded roles

| Role           | Permissions                                       | Can call these endpoints |
| -------------- | ------------------------------------------------- | ------------------------ |
| `admin`        | `*`                                               | Yes                      |
| `staff`        | `medicine:*`, `inventory:*`, `notification:read`  | No                       |
| `collaborator` | `medicine:read`, `inventory:read`, `notification:read` | No                  |

### Facts that affect this feature

- `employees`, `users`, `roles` and `role_permissions` have **no triggers**, so nothing writes to `audit_logs` for these inserts.
- Neither unique index is case-insensitive or partial. `Admin` and `admin` would be different usernames, and a soft-deleted employee still holds their email.
- The database holds one employee and one user, the seeded admin, with no email set. No existing data needs cleaning up.

---

## Decisions

| Topic                  | Decision                                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Route                  | `POST /api/employees`, because the employee is the main record and the login belongs to it.                                                                    |
| Authentication         | The existing NextAuth session cookie, checked by `requirePermission`. `Authorization: Bearer` isn't accepted: `getServerSession` only reads cookies. See [Authentication](#authentication). |
| Permission             | `POST /api/employees` requires both `employee:manage` and `user:manage`, because the request writes both tables. `GET /api/roles` requires `user:manage`. Only `admin` holds them today. |
| Login required         | Yes. Every employee must have an account, so every request creates both rows and all user fields are required. The database can't enforce this, because the row that owns the foreign key is `users`, so the API is what guarantees it. This replaces the "employee may have no login" rule in @context/database-schema.md. |
| Selecting a role       | By `roleId`. Clients get the UUID from `GET /api/roles`, because role UUIDs differ between environments.                                                        |
| Assigning `admin`      | Allowed. The caller is already an admin, so this grants nothing they don't have.                                                                                |
| Transaction            | `prisma.$transaction` with an interactive callback and two explicit creates.                                                                                    |
| `withActor`            | Not used. It only sets `app.actor_id` for audit triggers, and these tables have none.                                                                           |
| Auditing               | Not needed. @context/database-schema.md limits the audit trail to medicines and inventory, so account creation isn't recorded in `audit_logs`.                   |
| Username format        | Lowercase only, and uppercase is rejected rather than converted. Login matches the username exactly, so silently converting `JDoe` would leave a login that fails as typed. |
| Email case             | Lowercased before saving, so `A@x.com` and `a@x.com` collide on the unique index.                                                                               |
| Contact number format  | Philippine mobile numbers with the country code: `+639` followed by 9 digits, such as `+639171234567`. Local formats such as `09171234567`, landlines and other countries are rejected. Mobile only, because this number receives SMS alerts. It's still valid E.164, so the worker can dial it as-is. |
| Password limits        | 8 characters to 72 bytes. bcrypt ignores everything after 72 bytes, so longer passwords would be silently shortened.                                            |
| bcrypt cost            | 12, the same as `prisma/seed.ts` and the dummy hash in `auth-options.ts`. A different cost would let login response time reveal which usernames exist.          |

---

## API

### Authentication

Both endpoints are protected by `requirePermission`, the same helper the medicine routes use. No new auth code is needed.

NextAuth doesn't use an `Authorization` header here. Logging in sets an encrypted JWT in an HTTP-only session cookie, and `getServerSession` reads that cookie on each request. Browsers send it automatically.

Other clients, such as curl or Postman, must log in first and keep the cookie:

```bash
CSRF=$(curl -s -c cookies.txt http://localhost:3000/api/auth/csrf | jq -r .csrfToken)

curl -s -b cookies.txt -c cookies.txt \
  -X POST http://localhost:3000/api/auth/callback/credentials \
  --data-urlencode "username=<username>" \
  --data-urlencode "password=<password>" \
  --data-urlencode "csrfToken=$CSRF" \
  --data-urlencode "json=true"

curl -s -b cookies.txt http://localhost:3000/api/roles
```

The Pi worker's `WORKER_API_TOKEN` bearer token is separate. It only applies to the `/api/worker/*` routes.

### `GET /api/roles`

Requires `user:manage`. Returns every role, sorted by `name`, with no pagination because the table only holds the seeded roles.

`200`:

```json
{
  "success": true,
  "data": [
    {
      "id": "<roles.id>",
      "name": "staff",
      "description": "Manages medicines and inventory"
    }
  ]
}
```

Returns `401 UNAUTHENTICATED` with no valid session, and `403 FORBIDDEN` without `user:manage`. It doesn't return permissions or `users`.

### `POST /api/employees`

The body is flat. Only the fields below are accepted.

```json
{
  "firstName": "Maria",
  "middleName": "Santos",
  "lastName": "Reyes",
  "email": "maria.reyes@example.com",
  "contactNumber": "+639171234567",
  "position": "Pharmacist",
  "receivesSmsAlerts": true,
  "username": "mreyes",
  "password": "a-strong-password",
  "roleId": "<roles.id>"
}
```

| Field               | Required | Rules                                                                                  | Saved to                  |
| ------------------- | -------- | -------------------------------------------------------------------------------------- | ------------------------- |
| `firstName`         | Yes      | Trimmed, 1–100 characters                                                              | `employees.first_name`    |
| `middleName`        | No       | Trimmed, up to 100 characters. Blank becomes `null`                                    | `employees.middle_name`   |
| `lastName`          | Yes      | Trimmed, 1–100 characters                                                              | `employees.last_name`     |
| `email`             | No       | Trimmed, lowercased, valid email, up to 254 characters. Blank becomes `null`           | `employees.email`         |
| `contactNumber`     | No       | Trimmed, matches `^\+639\d{9}$`. Blank becomes `null`                                  | `employees.contact_number` |
| `position`          | No       | Trimmed, up to 100 characters. Blank becomes `null`                                    | `employees.position`      |
| `receivesSmsAlerts` | No       | Boolean, defaults to `false`. When `true`, `contactNumber` is required                 | `employees.receives_sms_alerts` |
| `username`          | Yes      | Matches `^[a-z0-9._-]{3,100}$`                                                         | `users.username`          |
| `password`          | Yes      | Not trimmed. At least 8 characters, at most 72 UTF-8 bytes, no NUL characters          | `users.password_hash`, as a bcrypt hash |
| `roleId`            | Yes      | UUID of an existing role, from `GET /api/roles`                                        | `users.role_id`           |

The schema is strict, so any other field returns `400`. That includes `isActive`, `passwordHash`, `employeeId`, `failedLoginAttempts` and `deletedAt`. New employees and users always start active.

The `100` limit on `username` and the `72`-byte limit on `password` both fit inside the login schema in `auth-options.ts` (100 and 200 characters), so every account created here can log in.

### Success

`201`:

```json
{
  "success": true,
  "data": {
    "id": "<employees.id>",
    "firstName": "Maria",
    "middleName": "Santos",
    "lastName": "Reyes",
    "email": "maria.reyes@example.com",
    "contactNumber": "+639171234567",
    "position": "Pharmacist",
    "receivesSmsAlerts": true,
    "isActive": true,
    "createdAt": "2026-11-06T02:00:00.000Z",
    "updatedAt": "2026-11-06T02:00:00.000Z",
    "user": {
      "id": "<users.id>",
      "username": "mreyes",
      "role": "staff",
      "isActive": true,
      "createdAt": "2026-11-06T02:00:00.000Z"
    }
  }
}
```

Build the response from an explicit `select` or mapping. It must never contain `password` or `passwordHash`.

### Errors

These use the existing response format in `src/lib/api-response.ts`.

| Status | Code                 | When                                                                                       |
| ------ | -------------------- | ------------------------------------------------------------------------------------------ |
| `400`  | `INVALID_JSON`       | The request body isn't valid JSON                                                          |
| `400`  | `VALIDATION_ERROR`   | A field fails validation, an unknown field is sent, or `roleId` doesn't match a role. `error.fields` names each field |
| `401`  | `UNAUTHENTICATED`    | No valid session, or the caller is inactive                                                |
| `403`  | `FORBIDDEN`          | The caller lacks `employee:manage` or `user:manage`                                        |
| `409`  | `EMPLOYEE_DUPLICATE` | The email or username is already in use                                                    |
| `500`  | `INTERNAL_ERROR`     | Anything unexpected. Log the details and return a generic message                          |

`EMPLOYEE_DUPLICATE` includes `error.fields` naming `email`, `username` or both, except when two requests collide at the same moment (see step 6 below).

---

## Implementation

### Create flow

`createEmployee(input)` in `src/lib/employees.ts`:

1. Hash the password with bcrypt, cost 12, **before** opening the transaction. Hashing is slow, and doing it inside would hold a database connection for no benefit.
2. Open `prisma.$transaction(async (tx) => { … })`.
3. Find the role by `roleId`. If it's missing, throw `400 VALIDATION_ERROR` with `fields.roleId`.
4. Look up `email` (when given) and `username`. If either is taken, throw `409 EMPLOYEE_DUPLICATE` with `fields`. Soft-deleted employees count, because the unique index still includes them.
5. Create the employee with `tx.employee.create`, then the user with `tx.user.create`, using `employeeId: employee.id` and `roleId: role.id`.
6. Wrap the whole `$transaction` call in a `try/catch`. Turn Prisma `P2002` into `409 EMPLOYEE_DUPLICATE` with the message `This email or username is already in use.`

Step 4 gives the specific field errors, and step 6 covers two requests racing past step 4. Step 6 can't name the field: with the `@prisma/adapter-pg` driver adapter, the installed Prisma runtime doesn't set the usual `meta.target`.

```ts
export async function createEmployee(
  input: CreateEmployeeInput,
): Promise<EmployeeWithUser> {
  const { username, password, roleId, ...employee } = input;
  const passwordHash = await hash(password, BCRYPT_SALT_ROUNDS);

  try {
    return await prisma.$transaction(async (tx) => {
      await assertRoleExists(tx, roleId);
      await assertAvailable(tx, employee.email, username);

      const created = await tx.employee.create({
        data: employee,
        select: EMPLOYEE_SELECT,
      });
      const user = await tx.user.create({
        data: { employeeId: created.id, username, passwordHash, roleId },
        select: USER_SELECT,
      });

      return { ...created, user }; // with dates as ISO strings and user.role as the name
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw duplicateEmployee();
    }
    throw error;
  }
}
```

### Route handlers

Same shape as `src/app/api/medicines/route.ts`:

```ts
// src/app/api/employees/route.ts
export async function POST(request: NextRequest) {
  try {
    await requirePermission('employee:manage', 'user:manage');
    const input = parseInput(createEmployeeSchema, await parseJsonBody(request));
    return apiSuccess(await createEmployee(input), 201);
  } catch (error) {
    return apiFailure(error);
  }
}

// src/app/api/roles/route.ts
export async function GET() {
  try {
    await requirePermission('user:manage');
    return apiSuccess(await listRoles());
  } catch (error) {
    return apiFailure(error);
  }
}
```

Don't log the request body, because it contains the password.

### Validation

In `src/lib/validations/employee.ts`:

- Use `z.strictObject`, like the medicine schemas
- Add a `.superRefine` that reports `contactNumber` when `receivesSmsAlerts` is `true` and `contactNumber` is missing or blank. The database `CHECK` is only the backstop.
- Measure the password limit with `Buffer.byteLength(value, 'utf8')`, since `.max()` counts characters

`hasNoNul`, `text`, `requiredText` and `optionalText` are private to `validations/medicine.ts`. Move them to `src/lib/validations/common.ts` and import them from both files, with no change in behavior.

### Files

All paths are relative to `apps/app/`.

| File                                   | Change                                                     |
| -------------------------------------- | ---------------------------------------------------------- |
| `../../context/database-schema.md`     | Every employee has a user, and `contact_number` is a Philippine mobile number |
| `src/app/api/employees/route.ts`       | New. `POST` handler                                        |
| `src/app/api/roles/route.ts`           | New. `GET` handler                                         |
| `src/lib/employees.ts`                 | New. `createEmployee`, with `import 'server-only'`         |
| `src/lib/roles.ts`                     | New. `listRoles`, with `import 'server-only'`              |
| `src/lib/validations/employee.ts`      | New. `createEmployeeSchema` and `CreateEmployeeInput`      |
| `src/lib/validations/common.ts`        | New. Text helpers moved from `validations/medicine.ts`     |
| `src/lib/validations/medicine.ts`      | Imports the text helpers from `common.ts`                  |
| `src/lib/api-response.ts`              | Adds `EMPLOYEE_DUPLICATE` to `ApiErrorCode`                |
| `src/types/employee.ts`                | New. `EmployeeWithUser` response type                      |
| `src/types/role.ts`                    | New. `RoleSummary` response type                           |
| `specs/lib/validations/employee.spec.ts` | New. Schema tests                                        |
| `specs/lib/employees.spec.ts`          | New. Data layer tests with Prisma mocked                   |
| `specs/api/employees/routes.spec.ts`   | New. Route tests                                           |
| `specs/api/roles/routes.spec.ts`       | New. Route tests                                           |

### Dependencies

None. `bcrypt`, `zod` and `@prisma/adapter-pg` are already installed.

---

## Testing

Unit and route tests (Jest, no database):

- Schema: trims text, lowercases email, turns blanks into `null`, and defaults `receivesSmsAlerts` to `false`
- Schema: rejects unknown fields, including `passwordHash` and `isActive`
- Schema: rejects uppercase and too-short usernames, invalid emails, and a non-UUID `roleId`
- Schema: accepts `+639171234567`, and rejects `09171234567`, `639171234567`, `+63917123456` (too short), `+63282345678` (landline) and `+14155552671` (another country)
- Schema: rejects `receivesSmsAlerts: true` with a missing or blank `contactNumber`
- Schema: accepts a 72-byte password, rejects 73 bytes, and counts bytes rather than characters (40 emoji is 160 bytes, so it's rejected)
- `createEmployee`: hashes before opening the transaction, stores the hash rather than the password, and never returns it
- `createEmployee`: a `roleId` with no matching role gives `400` and creates nothing
- `createEmployee`: taken email, taken username and both give `409` with the right `fields`, and create nothing
- `createEmployee`: `P2002` gives `409`, and other errors pass through unchanged
- `POST /api/employees` route: `401`, `403` when either permission is missing, `400` for invalid JSON, `201` with the expected response
- `GET /api/roles` route: `401`, `403` without `user:manage`, `200` with the expected response

Manual checks against a local database (record results in the PR):

- [ ] `prisma migrate status` reports up to date
- [ ] `GET /api/roles` as `admin` returns the three seeded roles, and an `id` from it works as `roleId`
- [ ] A request with `Authorization: Bearer <token>` and no session cookie returns `401`
- [ ] Creating an employee as `admin` returns `201` and adds one `employees` row and one linked `users` row
- [ ] The response has no `password` or `passwordHash`, and `password_hash` starts with `$2b$12$`
- [ ] The new user can log in, and `GET /api/auth/session` returns their ID and username
- [ ] A user created with each role gets that role's access on medicine routes
- [ ] On both endpoints, `staff` and `collaborator` get `403`, and a request with no session gets `401`
- [ ] A taken username returns `409`, and the `employees` row count doesn't change
- [ ] A taken email returns `409`, including with different letter case
- [ ] An email held by a soft-deleted employee returns `409`
- [ ] A valid UUID that isn't a role returns `400` with `fields.roleId`
- [ ] Two concurrent requests with the same username and different emails give one `201` and one `409`, and only one new employee exists. This proves the rollback.
- [ ] `receivesSmsAlerts: true` without `contactNumber` returns `400`
- [ ] No `roles` or `role_permissions` rows change

## Acceptance Criteria

- `GET /api/roles` and `POST /api/employees` behave as documented, and all manual checks pass
- A failed request never leaves an employee without a user
- Plaintext passwords are never stored, returned or logged
- Only callers with both `employee:manage` and `user:manage` can create accounts, and only callers with `user:manage` can list roles
- No endpoint writes to `roles` or `role_permissions`
- No migration is added
- `npm` lint, test and build pass
