# 14 — Employees and User Accounts

## Overview

Add the screens to manage employees and their logins: list and search, create an employee with an account, edit details, role and SMS alerts, activate or deactivate, and delete.

Every employee has exactly one user account, and the API already creates, edits and deletes both rows together. This feature puts a UI on that API's lib functions, so admins no longer need API calls to add staff or choose who receives SMS alerts.

It needs no schema change, migration or new API route.

## Goals

- `/employees` lists employees with search, paging, role, status and SMS alerts
- An admin can create an employee with a username, password and role
- An admin can edit an employee's details, contact number, SMS alerts, username and role
- An admin can deactivate, reactivate and delete an employee
- The server's self-change and last-admin rules show as clear messages
- One "Employees" nav item replaces "Employees" and "Users & roles"
- Lint, test and build pass

## Out of Scope

- Changing or resetting a password. The API has no endpoint for it. This is a gap: a forgotten password currently needs a database change, so it should be the next feature after this list.
- Creating, editing or deleting roles and permissions. Roles stay seeded and read-only.
- Restoring a deleted employee
- A "my profile" page for non-admins
- Bulk import

---

## Current state

Checked in the code on 2026-11-08.

### Already in place

| Area          | Where                                  | Behavior                                                                          |
| ------------- | -------------------------------------- | --------------------------------------------------------------------------------- |
| List          | `listEmployees({ search, page, pageSize })` | Non-deleted employees with their user and role name                         |
| Detail        | `getEmployee(id)`                      | One employee with user                                                            |
| Create        | `createEmployee(input)`                | Employee and user in one transaction, bcrypt cost 12. `EMPLOYEE_DUPLICATE` with fields |
| Update        | `updateEmployee(actorId, id, input)`   | Both tables in one transaction. `isActive` sets both flags. Turning alerts off or deactivating cancels `PENDING` SMS |
| Delete        | `softDeleteEmployee(actorId, id)`      | Soft delete, cancels SMS. Email and username stay reserved                        |
| Protections   | `src/lib/employees.ts`                 | `EMPLOYEE_SELF_CHANGE` (own role, deactivate or delete self) and `LAST_ADMIN`     |
| Roles         | `listRoles()`                          | Role IDs, names and descriptions                                                  |
| Permissions   | API routes                             | Every employee operation needs both `employee:manage` and `user:manage`           |
| Validation    | `src/lib/validations/employee.ts`      | Philippine mobile numbers (`+639XXXXXXXXX`), lowercase usernames, 8 characters to 72 bytes for passwords, SMS alerts need a number |
| Plumbing      | Features 12 and 13                     | `runAction`, `requirePageUser`, `parseListQuery`, `SearchInput`, `ListPagination`, dialogs |

### Facts that affect this feature

- `NavItem.permission` holds one permission, but this page needs two
- The API needs both permissions for every call, so splitting "Employees" and "Users & roles" into two pages would give two pages with the same access

---

## Decisions

| Topic                 | Decision                                                                                                                         |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| One page              | `/employees` covers both employees and their accounts. The "Users & roles" nav item is removed.                                      |
| Nav permissions       | `NavItem.permission` becomes `permissions: Permission[]`, all required. Dashboard has `[]`.                                         |
| Page permission       | `requirePageUser` accepts several permissions, all required, matching `requirePermission`                                          |
| Create and edit       | A full page each (`/employees/new`, `/employees/[id]`), not dialogs, because the form has 11 fields in three groups                 |
| Edit                  | Sends only changed fields. The username and role are editable; the password isn't.                                                  |
| Status changes        | `Deactivate`, `Activate` and `Delete` are separate buttons with a confirmation each. Deactivate and activate call `updateEmployee` with `isActive`. |
| Self                  | On your own record, the role field, Deactivate and Delete are disabled with the hint `You can't change your own role or status.` The server still enforces it. |
| SMS alerts            | A switch. With no contact number it's disabled, with the hint `Add a contact number to turn on SMS alerts.` Saving it off notes that pending texts are cancelled. |
| Contact number input  | Placeholder `+639171234567`. Accepts `09171234567` and converts it to `+639171234567` before validating, since that's how numbers are usually written locally. |
| Inactive employees    | Listed with an `Inactive` tag. A `Show inactive` switch in the URL (`?status=all`) controls it; active only by default.             |
| Password field        | `PasswordInput` from feature 10, with `autoComplete="new-password"`, shown only on create                                         |

---

## UI

### `/employees`

Requires `employee:manage` and `user:manage`.

```
 Employees                                               [ New employee ]
 ─────────────────────────────────────────────────────────────────────
 [ Search by name, email or username…   ]    [ ] Show inactive

 Name                 Username     Role           Contact          SMS   Status
 Rodney Lingganay     rodentskie   Admin          +639171234567    On    Active
 Ana Cruz             anacruz      Staff          —                Off   Inactive
                                         ‹ 1 2 › · 1–20 of 24
```

- The name links to `/employees/[id]`
- Role names are capitalized
- Empty states: `No employees match "{search}"`
- Page title: `Employees | InventraMed`

`listEmployees` has no status filter yet, so it gets an optional `status: 'active' | 'all'`, defaulting to `active`, added to `employeeListQuerySchema`. The API route accepts it too, which is backward compatible.

### `/employees/new` and `/employees/[id]`

```
 New employee
 ─────────────────────────────────────────────────────────────────────
 Personal details
   First name*      Middle name      Last name*
   Position         Email

 Contact and alerts
   Contact number   [ +639171234567 ]
   [ ] Receive SMS expiry alerts

 Account
   Username*        Role* [ Staff ▾ ]
   Password*        (create only)

                                              [ Cancel ] [ Create employee ]
```

- Role options come from `listRoles()`, with each role's description as help text
- The edit page adds a header with the status and the `Deactivate` / `Activate` and `Delete` buttons
- Field errors come from the action's `fields`, including `EMPLOYEE_DUPLICATE` on `email` and `username`
- `EMPLOYEE_SELF_CHANGE` and `LAST_ADMIN` show as an error toast with the server's message
- On create success: toast `Employee created`, go to `/employees/[id]`
- On save success: toast `Changes saved`
- On delete success: toast `Employee deleted`, go to `/employees`
- Confirmations:
  - Deactivate: `{name} won't be able to sign in, and their pending SMS alerts are cancelled.`
  - Delete: `This can't be undone. Their email and username stay reserved.`

---

## Implementation

### Files

All paths are relative to `apps/app/`.

| File                                            | Change                                                                       |
| ----------------------------------------------- | ---------------------------------------------------------------------------- |
| `src/types/dashboard.ts`, `src/lib/navigation.ts` | `permissions: Permission[]`; remove "Users & roles"; enable Employees with `['employee:manage', 'user:manage']` |
| `src/components/layout/SidebarNav.tsx`          | Drop the `users` icon                                                        |
| `src/lib/auth.ts`                               | `requirePageUser(...permissions)`                                            |
| `src/lib/validations/employee.ts`               | Add `status` to `employeeListQuerySchema`; add `normalizeContactNumber`      |
| `src/lib/employees.ts`                          | `listEmployees` filters by `status`                                          |
| `src/actions/employees.ts`                      | New. `createEmployeeAction`, `updateEmployeeAction`, `setEmployeeActiveAction`, `deleteEmployeeAction` |
| `src/app/(app)/employees/page.tsx`              | New. List                                                                    |
| `src/app/(app)/employees/new/page.tsx`          | New                                                                          |
| `src/app/(app)/employees/[id]/page.tsx`         | New                                                                          |
| `src/components/employees/EmployeeTable.tsx`    | New                                                                          |
| `src/components/employees/EmployeeForm.tsx`     | New. `'use client'`. Create and edit                                         |
| `src/components/employees/EmployeeStatusActions.tsx` | New. `'use client'`. Deactivate, activate, delete                       |
| `src/components/common/StatusSwitch.tsx`        | New. `'use client'`. `?status=all` switch                                    |

Each action requires both permissions and passes the current user's ID as the actor, so the self-change and last-admin rules apply. Actions revalidate `/employees` and `/employees/[id]`.

### Chakra snippets

```bash
npx @chakra-ui/cli snippet add switch --outdir libs/components/src/ui
npx @chakra-ui/cli snippet add native-select --outdir libs/components/src/ui
```

---

## Testing

Unit and component tests (Jest, no database).

- `getVisibleNav` with `permissions` arrays: an item needing two permissions is hidden with only one
- `requirePageUser` with several permissions
- `normalizeContactNumber`: `09…`, `+639…`, spaces and dashes, other input left for Zod to reject
- `listEmployees` and the schema: `status` default and `all`
- Each action: both permissions required, actor ID passed, field errors passed through, revalidation
- `EmployeeForm`: create shows the password, edit hides it, only changed fields are sent, SMS switch disabled without a number, self record disables the role
- `EmployeeStatusActions`: confirmations, self record disables them, `LAST_ADMIN` toast
- Pages: permission redirect, `notFound()` for a deleted employee

Manual checks:

- [ ] `admin` creates a `staff` employee, who can then sign in
- [ ] A duplicate username or email shows the error on that field
- [ ] `09171234567` is saved as `+639171234567`
- [ ] Turning on SMS alerts without a number isn't possible, and with a number it saves
- [ ] Deactivating an employee signs them out on their next page load
- [ ] Reactivating lets them sign in again
- [ ] The admin can't change their own role, deactivate or delete themselves
- [ ] Changing the only admin's role to staff is refused with the last-admin message
- [ ] Deleting removes the employee from the list, and their username can't be reused
- [ ] `staff` and `collaborator` don't see the nav item, and `/employees` redirects them to `/`

## Acceptance Criteria

- All goals are met and all manual checks pass
- No path in the UI can lock out the last admin
- `npm` lint, test and build pass
