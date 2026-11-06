# 04 — Employee Read, Update and Delete API

## Overview

Finish employee management in `apps/app`. @context/features/03-employees.spec.md added create (`POST /api/employees`). This feature adds read, update and soft delete:

- `GET /api/employees` lists employees with their logins
- `GET /api/employees/:id` reads one
- `PATCH /api/employees/:id` edits the employee and their login in one transaction
- `DELETE /api/employees/:id` soft-deletes the employee and blocks their login

This feature is API only, and it needs no schema change or migration.

## Goals

- All four endpoints work as documented, and require a logged-in user with both `employee:manage` and `user:manage`
- A list or detail response never contains `passwordHash`
- Updates to `employees` and `users` commit together or not at all
- Deactivating or deleting an employee blocks their login on the next request and cancels their `PENDING` SMS messages
- The API can't leave the system with no active admin
- Lint, test and build pass, and `prisma migrate status` reports in sync

## Out of Scope

- Create. It already exists.
- Password change or reset, and sending `password` to `PATCH`
- Restoring a soft-deleted employee
- Unlocking an account locked by the login limit. Locks expire after the cooldown.
- Writes to `roles` and `role_permissions`
- Audit logging for `employees` and `users`
- UI screens

---

## Current state

Checked on the local database through the Postgres MCP on 2026-11-06. Column details are in @context/features/03-employees.spec.md.

### What references these tables

| From                                  | To          | On delete  |
| ------------------------------------- | ----------- | ---------- |
| `users.employee_id`                   | `employees` | `RESTRICT` |
| `sms_messages.employee_id`            | `employees` | `RESTRICT` |
| `inventory_transactions.performed_by` | `users`     | `RESTRICT` |
| `medicines.created_by`                | `users`     | `SET NULL` |
| `settings.updated_by`                 | `users`     | `SET NULL` |
| `notification_reads.user_id`          | `users`     | `CASCADE`  |

### Facts that affect this feature

- Hard delete can't work long term. Once a user has moved stock, `inventory_transactions` blocks deleting them, and that ledger is immutable.
- Active status lives in two places, `employees.is_active` and `users.is_active`. `requirePermission` and login check both, plus `employees.deleted_at`.
- The email and username unique indexes aren't partial, so soft-deleted rows still hold their values.
- The database allows an employee without a user, even though the API never creates one.
- `requirePermission` reads status and role from the database on every request, so deactivation and role changes apply on the next request.
- `POST /api/employees` is the only employee route today, in `src/app/api/employees/route.ts`.

---

## Decisions

| Topic                     | Decision                                                                                                                                                  |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Permissions               | Every endpoint requires both `employee:manage` and `user:manage`, the same as create, because each one reads or writes both tables. There is no separate read permission. |
| Delete                    | Soft delete only. Sets `employees.deleted_at`, and sets both `is_active` flags to `false`.                                                                 |
| After delete              | The employee returns `404` everywhere and is missing from the list. There is no restore.                                                                  |
| Deleted email and username | Stay reserved, so reusing them returns `409`. Freeing them would need partial unique indexes and a migration.                                              |
| `isActive` in `PATCH`     | One field that sets both `employees.is_active` and `users.is_active`, because every employee has exactly one account.                                      |
| `isActive` in responses   | Both values are returned, in `isActive` and `user.isActive`. They should always match, but the database doesn't enforce it.                                 |
| Employees without a user  | Not returned, and `404` on every `:id` route. Query from `users`, so `employee` and `user` are always both present and no null case exists.                 |
| Changing your own account | You can edit your own details and username, but not your own role or active status, and you can't delete yourself. Returns `409 EMPLOYEE_SELF_CHANGE`.      |
| Last admin                | An update or delete that would leave no active admin returns `409 LAST_ADMIN`. An admin is a user whose role holds `*`.                                     |
| Concurrency               | Admin-affecting changes take one advisory lock. Otherwise two admins deactivating each other at the same moment could both succeed.                        |
| SMS on deactivate         | `PENDING` messages become `CANCELLED`, as @context/database-schema.md requires. A message already `SENDING` isn't recalled. Reactivating doesn't queue anything. |
| SMS on number change      | `PENDING` messages keep their snapshot `phone_number`, as @context/database-schema.md documents.                                                            |
| Changing a username       | Allowed. The session shows the old `username` until the user logs in again, but access isn't affected, because `requirePermission` uses the ID.             |
| Auditing                  | Not needed, the same as create, so no `withActor`.                                                                                                         |
| Response shape            | Same as create, plus `user.roleId`, so an edit form can preselect the role. `POST /api/employees` gains this field too, which is non-breaking.              |

---

## API

All routes use the existing session cookie and the response format from `src/lib/api-response.ts`.

### Data shape

```ts
interface EmployeeWithUser {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  email: string | null;
  contactNumber: string | null;
  position: string | null;
  receivesSmsAlerts: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    username: string;
    roleId: string; // new
    role: string; // role name
    isActive: boolean;
    createdAt: string;
  };
}
```

### `GET /api/employees`

| Query      | Rules                                                                                                     |
| ---------- | --------------------------------------------------------------------------------------------------------- |
| `search`   | Optional, trimmed, up to 200 characters. Case-insensitive partial match on first, middle and last name, email, and username |
| `page`     | Optional integer, at least 1. Default `1`                                                                 |
| `pageSize` | Optional integer from 1 to 100. Default `20`                                                              |

Returns `{ items: EmployeeWithUser[], total, page, pageSize }`, sorted by `lastName`, then `firstName`, then user `id`. Excludes soft-deleted employees and includes inactive ones.

### `GET /api/employees/:id`

`:id` is `employees.id`. Returns `EmployeeWithUser`.

### `PATCH /api/employees/:id`

Accepts any of these, with at least one field:

| Field               | Rules                                                     | Can be `null` | Saved to                                   |
| ------------------- | --------------------------------------------------------- | ------------- | ------------------------------------------ |
| `firstName`         | Same as create                                            | No            | `employees.first_name`                     |
| `middleName`        | Same as create. Blank becomes `null`                      | Yes           | `employees.middle_name`                    |
| `lastName`          | Same as create                                            | No            | `employees.last_name`                      |
| `email`             | Same as create, lowercased. Blank becomes `null`          | Yes           | `employees.email`                          |
| `contactNumber`     | Same as create, `^\+639\d{9}$`. Blank becomes `null`      | Yes           | `employees.contact_number`                 |
| `position`          | Same as create. Blank becomes `null`                      | Yes           | `employees.position`                       |
| `receivesSmsAlerts` | Boolean, with no default                                  | No            | `employees.receives_sms_alerts`            |
| `username`          | Same as create, `^[a-z0-9._-]{3,100}$`                    | No            | `users.username`                           |
| `roleId`            | UUID of an existing role                                  | No            | `users.role_id`                            |
| `isActive`          | Boolean                                                   | No            | `employees.is_active` and `users.is_active` |

An absent field stays unchanged. The schema is strict, so any other field returns `400`, including `password`, `passwordHash`, `employeeId`, `failedLoginAttempts` and `deletedAt`.

Returns the updated `EmployeeWithUser`.

### `DELETE /api/employees/:id`

Soft-deletes the employee. Returns `200` with `{ id }`. A second delete returns `404`.

### Errors

| Status | Code                   | When                                                                                                |
| ------ | ---------------------- | --------------------------------------------------------------------------------------------------- |
| `400`  | `INVALID_JSON`         | The `PATCH` body isn't valid JSON                                                                   |
| `400`  | `VALIDATION_ERROR`     | A body, query or path value fails validation, `roleId` doesn't match a role, or the result would have `receivesSmsAlerts` on with no `contactNumber` |
| `401`  | `UNAUTHENTICATED`      | No valid session, or the caller is inactive                                                         |
| `403`  | `FORBIDDEN`            | The caller lacks `employee:manage` or `user:manage`                                                 |
| `404`  | `NOT_FOUND`            | The employee doesn't exist, is soft-deleted, or has no user                                         |
| `409`  | `EMPLOYEE_DUPLICATE`   | The email or username belongs to another employee                                                   |
| `409`  | `EMPLOYEE_SELF_CHANGE` | The caller tries to change their own role or deactivate or delete themselves                        |
| `409`  | `LAST_ADMIN`           | The change would leave no active admin                                                              |
| `500`  | `INTERNAL_ERROR`       | Anything unexpected. Log the details and return a generic message                                   |

---

## Implementation

### Reads

Query from `prisma.user`, not `prisma.employee`. `User.employee` is required in the Prisma schema, while `Employee.user` is optional, so this avoids a null case.

```ts
const where: Prisma.UserWhereInput = {
  employee: { deletedAt: null },
  ...(pattern && {
    OR: [
      { username: { contains: pattern, mode: 'insensitive' } },
      { employee: { firstName: { contains: pattern, mode: 'insensitive' } } },
      { employee: { middleName: { contains: pattern, mode: 'insensitive' } } },
      { employee: { lastName: { contains: pattern, mode: 'insensitive' } } },
      { employee: { email: { contains: pattern, mode: 'insensitive' } } },
    ],
  }),
};
```

- Run `findMany` and `count` in one `prisma.$transaction([...])`, like `listMedicines`
- Sort with `[{ employee: { lastName: 'asc' } }, { employee: { firstName: 'asc' } }, { id: 'asc' }]`
- Use an explicit `select` that leaves out `passwordHash`
- Find one with `findFirst({ where: { employeeId: id, employee: { deletedAt: null } } })`
- Escape `search` with `escapeLikePattern`, as `listMedicines` does

### Update flow

`updateEmployee(actorId, id, input)`, in one `prisma.$transaction`:

1. If `input.isActive === false` or `input.roleId` is present, take the admin lock:

   ```ts
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('employee-admin-guard', 0))`;
   ```

2. Lock the employee with `SELECT id FROM employees WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, then load them with their user and role permissions. Return `404` if either is missing.
3. If the target's user is the caller, return `409 EMPLOYEE_SELF_CHANGE` when `isActive` is `false` or `roleId` differs from the current role.
4. If the role is changing, check that the new role exists. Return `400` with `fields.roleId` if it doesn't.
5. Run the [last admin check](#last-admin-check) if the change deactivates the target or moves them to a role without `*`.
6. Check that any changed `email` and `username` are free, excluding this employee. Return `409 EMPLOYEE_DUPLICATE` with `fields`.
7. Merge the input over the current values. If `receivesSmsAlerts` would be `true` with no `contactNumber`, return `400` with `fields.contactNumber`. This covers clearing the number while alerts are on, which the schema can't see.
8. Update `employees`, and `users` for `username`, `roleId` and `isActive`. Setting `isActive` writes both rows.
9. If alerts went from on to off, or `isActive` is `false`, [cancel their pending SMS](#cancelling-sms).

Wrap the whole `$transaction` call in a `try/catch` that turns Prisma `P2002` into `409 EMPLOYEE_DUPLICATE`, like `createEmployee`.

### Delete flow

`softDeleteEmployee(actorId, id)`, in one `prisma.$transaction`:

1. Take the admin lock
2. Lock and load the employee, as in the update flow, and return `404` if missing
3. Return `409 EMPLOYEE_SELF_CHANGE` if the target's user is the caller
4. Run the last admin check
5. Set `employees.deleted_at`, `employees.is_active = false` and `users.is_active = false`
6. Cancel their pending SMS

Setting `is_active` as well means the daily digest, which selects active employees, needs no extra `deleted_at` check.

### Last admin check

Runs only when the target is currently an active admin:

```ts
const others = await tx.user.count({
  where: {
    id: { not: targetUserId },
    isActive: true,
    employee: { isActive: true, deletedAt: null },
    role: { permissions: { some: { permission: '*' } } },
  },
});
```

If `others` is `0`, return `409 LAST_ADMIN`. The advisory lock makes this safe: if two admins deactivate each other at once, the second transaction waits, sees the first change, and is rejected.

### Cancelling SMS

```ts
await tx.smsMessage.updateMany({
  where: { employeeId: id, status: 'PENDING' },
  data: { status: 'CANCELLED' },
});
```

### Validation

In `src/lib/validations/employee.ts`:

- Share one set of field schemas between create and update, so the rules can't drift
- `updateEmployeeSchema` is a strict object with every field optional, plus `isActive`. `receivesSmsAlerts` must not have a default here, or every `PATCH` would turn alerts off.
- Its `superRefine` rejects `receivesSmsAlerts: true` sent with a blank or `null` `contactNumber`. Other combinations depend on stored values, so step 7 of the update flow checks them.
- `employeeListQuerySchema` matches `medicineListQuerySchema`

Shared helpers to move:

| Helper                                        | From                      | To                       |
| --------------------------------------------- | ------------------------- | ------------------------ |
| `idSchema`, `hasAtLeastOneField`, `AT_LEAST_ONE_FIELD` | `validations/medicine.ts` | `validations/common.ts`  |
| `escapeLikePattern`                           | `lib/medicines.ts`        | New `lib/search.ts`      |

`validations/medicine.ts` keeps re-exporting `idSchema`, so the medicine routes and specs don't change.

### Route handlers

Same shape as `src/app/api/medicines/[id]/route.ts`. `PATCH` and `DELETE` pass `user.id` from `requirePermission` as the actor.

```ts
type Context = RouteContext<'/api/employees/[id]'>;

export async function PATCH(request: NextRequest, ctx: Context) {
  try {
    const user = await requirePermission('employee:manage', 'user:manage');
    const id = parseInput(idSchema, (await ctx.params).id);
    const input = parseInput(updateEmployeeSchema, await parseJsonBody(request));
    return apiSuccess(await updateEmployee(user.id, id, input));
  } catch (error) {
    return apiFailure(error);
  }
}
```

### Files

All paths are relative to `apps/app/`.

| File                                     | Change                                                                      |
| ---------------------------------------- | --------------------------------------------------------------------------- |
| `src/app/api/employees/route.ts`         | Adds `GET`                                                                  |
| `src/app/api/employees/[id]/route.ts`    | New. `GET`, `PATCH`, `DELETE`                                               |
| `src/lib/employees.ts`                   | Adds `listEmployees`, `getEmployee`, `updateEmployee`, `softDeleteEmployee`, and `user.roleId` in the response |
| `src/lib/search.ts`                      | New. `escapeLikePattern`, moved from `lib/medicines.ts`                     |
| `src/lib/medicines.ts`                   | Imports `escapeLikePattern`                                                 |
| `src/lib/validations/employee.ts`        | Adds `updateEmployeeSchema`, `employeeListQuerySchema`, shared field schemas |
| `src/lib/validations/common.ts`          | Adds the helpers moved from `validations/medicine.ts`                       |
| `src/lib/validations/medicine.ts`        | Imports them and re-exports `idSchema`                                      |
| `src/lib/api-response.ts`                | Adds `EMPLOYEE_SELF_CHANGE` and `LAST_ADMIN` to `ApiErrorCode`              |
| `src/types/employee.ts`                  | Adds `roleId` to `EmployeeUser`, and a new `EmployeeList` type              |
| `specs/lib/validations/employee.spec.ts` | Adds schema tests                                                           |
| `specs/lib/employees.spec.ts`            | Adds `roleId` to the create expectations                                    |
| `specs/lib/employees-rud.spec.ts`        | New. Data layer tests for read, update and delete                           |
| `specs/api/employees/routes.spec.ts`     | Adds `GET` list tests                                                       |
| `specs/api/employees/id-routes.spec.ts`  | New. Route tests for `:id`                                                  |

### Dependencies

None.

---

## Known limitations

- **Renaming the seeded admin:** `prisma/seed.ts` upserts by username `admin`. If that account is renamed and the seed runs again, it creates a new `admin` account with the default password. This feature doesn't change the seed.
- **Deleted usernames and emails:** they can't be reused, so re-hiring someone with the same email means using a different one, because there is no restore.

---

## Testing

Unit and route tests (Jest, no database):

- Update schema: all fields optional, empty body rejected, `password` and other unknown fields rejected, no default for `receivesSmsAlerts`, `null` rejected for `firstName`, `lastName`, `username`, `roleId` and `isActive`, phone and username rules match create
- List query schema: defaults, limits, and unknown fields rejected
- `listEmployees` and `getEmployee`: exclude soft-deleted rows, never select `passwordHash`, and escape `%` and `_` in `search`
- `updateEmployee`: writes only the fields sent, and `isActive` writes both rows
- `updateEmployee`: `404`, unknown role `400`, taken email or username `409`, own values allowed, `P2002` becomes `409`
- `updateEmployee`: clearing `contactNumber` with alerts on gives `400`, and turning alerts on with a stored number succeeds
- `updateEmployee`: self-deactivation and own role change give `409`, and editing your own name succeeds
- `updateEmployee`: last admin deactivated or moved to another role gives `409`, and succeeds when another active admin exists
- `updateEmployee`: alerts off and deactivation cancel `PENDING` SMS, and other updates don't touch SMS
- `softDeleteEmployee`: sets `deleted_at` and both flags, cancels SMS, self-delete and last admin give `409`, already deleted gives `404`
- Routes: both permissions required, `401`, `403`, `400` for invalid IDs and JSON, and the response format for each status

Manual checks against a local database (record results in the PR):

- [ ] `prisma migrate status` reports up to date
- [ ] The list returns the seeded admin with no `password` or `passwordHash`
- [ ] Search matches name, email and username, ignores case, and treats `%` as a literal character
- [ ] Paging returns the right `total`, and inactive employees appear
- [ ] `GET /api/employees/:id` returns the employee, and an unknown or invalid ID returns `404` or `400`
- [ ] `staff` and `collaborator` get `403` on all four endpoints, and no session gets `401`
- [ ] `PATCH` updates employee and user fields together, and a failed `PATCH` changes neither
- [ ] Changing a role changes that user's access on their next request
- [ ] Changing a username lets them log in with the new one and not the old one
- [ ] Deactivating a logged-in user returns `401` on their next request and blocks login, and reactivating restores login
- [ ] Sending `password` to `PATCH` returns `400`
- [ ] A taken email or username returns `409`, and saving your own values succeeds
- [ ] Turning alerts off and deactivating each cancel `PENDING` SMS, with a seeded `sms_messages` row
- [ ] An admin can't change their own role, deactivate themselves or delete themselves
- [ ] The only admin can't be removed by any route, and a second admin can be
- [ ] Two admins deactivating each other at the same moment leaves one active admin
- [ ] A deleted employee returns `404`, is missing from the list, can't log in, and still holds their email and username
- [ ] An employee who has moved stock can be soft-deleted, and their inventory transactions remain
- [ ] `POST /api/employees` still works and returns `user.roleId`
- [ ] Medicine routes still pass after the helper moves

## Acceptance Criteria

- All four endpoints behave as documented, and all manual checks pass
- No response contains password data
- A failed update or delete leaves both tables unchanged
- The API can't leave the system with no active admin
- No endpoint writes to `roles` or `role_permissions`
- No migration is added
- `npm` lint, test and build pass
