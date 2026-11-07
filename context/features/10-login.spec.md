# 10 — Login UI

## Overview

Add the first real screen in `apps/app`: a login page built with Chakra UI on top of the existing NextAuth credentials provider. Logging in, lockout and sessions already work on the server, so this feature adds the UI and redirects around them.

It needs no schema change, migration or new API route.

## Goals

- `/login` lets a user sign in with a username and password
- Wrong credentials and lockouts show a clear message, without revealing whether a username exists
- `/` requires an active account and redirects to `/login` otherwise
- A signed-in user who opens `/login` goes to `/`
- A user can sign out
- Dark mode is the default, and light mode is available
- Lint, test and build pass

## Out of Scope

- Dashboard, navigation shell, and the inventory, employee and other screens
- Returning to the originally requested page after login. `/` is the only protected page, so login always goes there.
- Password reset, password change, and forcing a change of the seeded admin password
- "Remember me", SSO and MFA
- A CAPTCHA, or any change to the lockout rules
- A custom Chakra theme. This feature uses `defaultSystem`.
- `zustand` stores, because the form's state is local to one component

---

## Current state

Checked in the code on 2026-11-07.

### Already in place

| Area           | Where                                     | Behavior                                                                              |
| -------------- | ----------------------------------------- | ------------------------------------------------------------------------------------- |
| Auth route     | `src/app/api/auth/[...nextauth]/route.ts` | NextAuth v4, credentials provider, JWT session lasting 8 hours                        |
| Login check    | `src/lib/auth-options.ts`                 | Validates credentials, counts attempts, checks the password and the account's status  |
| Lockout        | `src/lib/login-limit.ts`                  | `LOGIN_MAX_ATTEMPTS` (5) and `LOGIN_COOLDOWN_MINUTES` (15) from env                   |
| Chakra         | `libs/components`                         | `Provider`, `EmotionRegistry`, `alert` and `color-mode` snippets                      |
| Seeded account | `prisma/seed.ts`                          | User `admin`                                                                          |

### Missing or placeholder

- `authOptions` has no `pages` setting, so `/api/auth/signin` shows NextAuth's built-in page
- No page checks for a session. `requirePermission` throws an `ApiError`, which suits API routes but not pages.
- `src/app/page.tsx` is the Chakra setup demo
- `src/app/layout.tsx` has the Nx placeholder title, no `lang`, and no default color mode, so the theme follows `next-themes`' default instead of dark

### Facts that affect this feature

`signIn('credentials', { redirect: false })` from `next-auth/react` resolves to `{ error, status, ok, url }`:

| Server outcome                                          | `error`                       |
| ------------------------------------------------------- | ----------------------------- |
| Success                                                 | `null`                        |
| Wrong password, unknown user, inactive account, or invalid login-limit env | `CredentialsSignin` |
| Locked                                                  | `Try again after N minutes`   |

- `signIn` doesn't catch `fetch` or JSON failures, so a network error rejects the promise
- The server counts an attempt **before** checking the password, so a double submit uses up two attempts
- Usernames are lowercase (`USERNAME_PATTERN`), so a phone keyboard that capitalizes the first letter causes a failed login
- A locked message only appears for usernames that exist. That is existing server behavior and this feature doesn't change it.

---

## Decisions

| Topic               | Decision                                                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Submitting          | Client `signIn` from `next-auth/react`, not a Server Action. This is an exception to the coding standard: NextAuth v4 sets the session cookie through its own route. |
| Protecting pages    | A server-side check in each protected page, not `proxy.ts`. It reads the database, so deactivated users are rejected at once. API routes keep `requirePermission`. |
| After login         | Always `/`. With no `callbackUrl` taken from the URL, there is no open-redirect risk.                                                      |
| `/` for now         | A minimal placeholder with the username and a sign-out button, replacing the demo. The dashboard is a later feature.                       |
| Redirect loop       | `/` and `/login` use the same active-user check. If `/login` only checked the JWT, a deactivated user would bounce between the two pages.  |
| Error display       | Field validation appears inline, and sign-in failures appear as a toast, per the coding standards.                                         |
| Lockout message     | Shown only if it matches the expected format. Any other unexpected `error` gets the generic message.                                       |
| `?error=` in the URL | Never read or displayed, so a crafted link can't put text on the login page.                                                              |
| Form library        | None. Two fields don't justify a new dependency.                                                                                           |
| Validation schema   | Moved out of `auth-options.ts`, which is `server-only`, so the form and server share it.                                                   |

---

## UI

### `/login`

A server component that redirects active users to `/`, and otherwise renders `LoginForm`.

Layout follows GitHub's sign-in page: one narrow centered column on a plain background, usable from phone width up.

```
                                        [color mode]

              InventraMed
        Sign in to your account

  ┌────────────────────────────────┐
  │ Username                       │
  │ [                            ] │
  │                                │
  │ Password                       │
  │ [                        (👁) ] │
  │                                │
  │ [           Sign in          ] │
  └────────────────────────────────┘
```

- Use Chakra semantic tokens such as `bg`, `border` and `fg.muted`, so both color modes work. No inline styles and no hard-coded colors.
- `colorPalette="teal"` on the submit button
- Page title: `Sign in | InventraMed`

### Form fields

| Field    | Component        | Attributes                                                                        |
| -------- | ---------------- | --------------------------------------------------------------------------------- |
| Username | `Field`, `Input` | `name="username"`, `autoComplete="username"`, `autoCapitalize="none"`, `spellCheck={false}` |
| Password | `Field`, `PasswordInput` | `name="password"`, `autoComplete="current-password"`                      |

Don't trim either value. The server compares them exactly.

### Submit flow

1. Validate with `loginSchema`. On failure, show the errors inline and don't call the server.
2. Set the button to its loading state, which also blocks a second submit.
3. Call `signIn('credentials', { redirect: false, username, password, callbackUrl: '/' })`.
4. Handle the result:

| Result                               | What the user sees                                          | Form                            |
| ------------------------------------ | ----------------------------------------------------------- | ------------------------------- |
| `ok` and no `error`                  | Goes to `/` with `router.replace('/')` and `router.refresh()` | Stays loading until navigation |
| `CredentialsSignin`                  | Toast: `Incorrect username or password.`                    | Clears the password             |
| Matches `isLockoutMessage`           | Toast: `Too many attempts. Try again after N minutes.`      | Clears the password             |
| Any other `error`, or a rejected promise | Toast: `Something went wrong. Please try again.`        | Keeps the fields                |

Validation messages:

| Rule                  | Message                    |
| --------------------- | -------------------------- |
| Username is empty     | `Enter your username.`     |
| Username over 100     | `Username is too long.`    |
| Password is empty     | `Enter your password.`     |
| Password over 200     | `Password is too long.`    |

### `/`

A server component that redirects to `/login` unless the user is active. Otherwise it shows `Signed in as {username}` and a sign-out button, which calls `signOut({ callbackUrl: '/login' })`.

---

## Implementation

### Chakra snippets

From the repository root:

```bash
npx @chakra-ui/cli snippet add password-input --outdir libs/components/src/ui
npx @chakra-ui/cli snippet add toaster --outdir libs/components/src/ui
```

Export both from `libs/components/src/index.ts`. `Field` and `Input` come straight from `@chakra-ui/react`, so they need no snippet.

The generated `password-input` fails to compile with TS2590, so its `rootProps` is typed as `Omit<InputGroupProps, "children">` instead of `GroupProps`.

### Files

All paths are relative to `apps/app/` unless they start with `libs/`.

| File                                     | Change                                                                                       |
| ---------------------------------------- | -------------------------------------------------------------------------------------------- |
| `libs/components/src/ui/password-input.tsx`, `libs/components/src/ui/toaster.tsx` | New. Generated snippets                 |
| `libs/components/src/index.ts`           | Export the new snippets                                                                      |
| `libs/components/package.json`           | Add a `build` target. The app's project reference needs the lib's declarations in `dist`, and nothing built them. |
| `package.json` (app)                     | `typecheck` also depends on `^build`                                                         |
| `src/app/layout.tsx`                     | Add `lang="en"`, the app's title and description, `defaultTheme="dark"` on `Provider`, and `Toaster` |
| `src/app/login/page.tsx`                 | New. Redirect check, page layout, `ColorModeButton`                                          |
| `src/app/page.tsx`                       | Replace the demo with the protected placeholder                                              |
| `src/components/auth/LoginForm.tsx`      | New. `'use client'`, the form and submit flow                                                |
| `src/components/auth/SignOutButton.tsx`  | New. `'use client'`                                                                          |
| `src/lib/validations/auth.ts`            | New. `loginSchema`, moved from `credentialsSchema`, with the messages above and the same limits |
| `src/lib/auth-options.ts`                | Use `loginSchema`, and add `pages: { signIn: '/login', error: '/login' }`                    |
| `src/lib/auth.ts`                        | Add `getActiveUser()`, which returns `{ id, username }` or `null`                            |
| `src/lib/login-limit.ts`                 | Add `isLockoutMessage(message)`, next to `formatLockoutMessage`                              |
| `specs/`                                 | New and updated tests, listed below                                                          |

`loginSchema` must stay non-strict, because NextAuth also passes `csrfToken`, `callbackUrl` and `json` to `authorize`.

`getActiveUser()` applies the same rules as `requirePermission`: a valid session, and an active user whose employee is active and not deleted. It never throws for a missing or inactive user.

### Dependencies

None. `react-icons`, which `password-input` needs, is already installed.

---

## Testing

Unit and component tests (Jest, no database). Wrap components in `ChakraProvider` with `defaultSystem`, and mock `next-auth/react` and `next/navigation`. jsdom may need a `matchMedia` stub.

- `loginSchema`: accepts valid input and extra NextAuth fields, doesn't trim, enforces each limit and message
- `isLockoutMessage`: accepts both `minute` and `minutes`, rejects other text
- `getActiveUser`: no session, missing user, inactive user, inactive or deleted employee, and active user
- `LoginForm`:
  - empty submit shows inline errors and doesn't call `signIn`
  - success navigates to `/`
  - each row of the result table shows the right toast and the right form state
  - the button is disabled while a request is in flight
- `/login` and `/`: each redirect fires, and `/` shows the username
- `specs/index.spec.tsx`: update it, since `/` is now an async server component

Manual checks, run with `APP=app npm run dev` after seeding:

- [ ] `admin` can sign in and lands on `/`
- [ ] Opening `/` without a session goes to `/login`
- [ ] Opening `/login` with a session goes to `/`
- [ ] `/api/auth/signin` goes to `/login`
- [ ] A wrong password and an unknown username show the same toast
- [ ] The attempt after `LOGIN_MAX_ATTEMPTS` failures shows the lockout toast, even with the right password
- [ ] Login works again after the cooldown
- [ ] Sign-out returns to `/login`, and `/` then redirects to `/login`
- [ ] Deactivating a signed-in user sends them to `/login` on the next load, with no redirect loop
- [ ] `/login?error=anything` shows no message from the URL
- [ ] First visit is dark, and the color mode button switches to light and is remembered
- [ ] Both color modes are readable, and the page has no horizontal scroll at phone width
- [ ] The form works by keyboard alone, and a password manager fills it

## Acceptance Criteria

- All goals are met and all manual checks pass
- The login page never shows server text other than the validated lockout message
- A signed-in but deactivated user can't reach `/`
- `npm` lint, test and build pass
