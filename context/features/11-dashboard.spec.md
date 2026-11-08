# 11 — Dashboard and App Shell

## Overview

Replace the placeholder at `/` with the first real screen after login: an app shell (top header and left sidebar) and a dashboard that shows inventory and expiry status at a glance.

The layout uses GitHub's settings page as its design reference (`context/screenshots/dashboard.png`). The shell built here is reused by every later screen (medicines, inventory, employees, settings, audit logs).

It needs no schema change, migration or new API route. The dashboard is a server component that reads with Prisma directly.

## Goals

- A shared, protected app shell with a top header, a context header and a left sidebar
- `/` shows the dashboard: stock and expiry counts, batches that need attention, the latest digest, and recent stock movement
- Each section and nav item appears only when the user's role grants the permission it needs
- The shell works from phone width up. Below `lg`, the sidebar moves into a drawer opened from the header.
- Dark mode is the default, and the color mode button stays available in the header
- Lint, test and build pass

## Out of Scope

- The medicines, inventory, employees, users, settings, audit log and notification screens. The sidebar lists them, but they are later features.
- Global search (the "Type / to search" box in the reference)
- A notifications dropdown or page. The bell only shows the unread state and links to the dashboard's alerts section.
- Barcode scanning, and any write action (receive, dispense, dispose) from the dashboard
- Charts and trends over time
- Live updates. The dashboard is current as of page load.
- Profile pictures. The avatar shows the employee's initials.
- A custom Chakra theme. This feature keeps `defaultSystem`.

---

## Current state

Checked in the code on 2026-11-08.

### Already in place

| Area              | Where                              | Behavior                                                                          |
| ----------------- | ---------------------------------- | --------------------------------------------------------------------------------- |
| Page auth         | `src/lib/auth.ts`                  | `getActiveUser()` returns `{ id, username }` or `null`; no permissions            |
| API auth          | `src/lib/auth.ts`                  | `requirePermission()` reads the role's permissions from the database              |
| Permission check  | `src/lib/permissions.ts`           | `hasPermission(granted, required)` handles `resource:*` and `*`                   |
| Expiry math       | `src/lib/expiry.ts`, `src/lib/medicines.ts` | `getLocalToday`, `addDays`, `getDaysToExpiry`, `getExpiryStatus`, `getExpiryContext` |
| Digest            | `src/lib/notifications.ts`         | `listNotifications(userId, { page, pageSize })` generates today's digest first and returns `unreadCount` |
| Transactions      | `src/lib/inventory.ts`             | `listTransactions()` returns transactions without the medicine name               |
| Settings          | `src/lib/settings.ts`              | `getSettings()` includes `workerLastSeenAt` and `workerPollIntervalSecs`          |
| Chakra snippets   | `libs/components/src/ui`           | `alert`, `color-mode`, `password-input`, `toaster`, `provider`, `emotion-registry` |
| Sign-out          | `src/components/auth/SignOutButton.tsx` | Calls `signOut({ callbackUrl: '/login' })`                                   |

### Missing or placeholder

- `src/app/page.tsx` shows `Signed in as {username}` and a sign-out button
- No layout is shared between protected pages
- Pages can't check permissions. `getActiveUser()` doesn't return them, and `requirePermission()` throws `ApiError`.

---

## Design reference

From `context/screenshots/dashboard.png` (GitHub settings, dark mode):

| Element            | In the reference                                                       | In InventraMed                                                         |
| ------------------ | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Top header         | Full width, darker than the page, bottom border. Menu button, logo, page title on the left; search, actions, inbox, avatar on the right | Same bar. Menu button (below `lg` only), app name, current page title on the left; color mode, notification bell, user menu on the right |
| Context header     | Avatar, `Full Name (username)`, muted subtitle `Your personal account` | Initials avatar, `First Last (username)`, muted subtitle with the role name, e.g. `Admin` |
| Sidebar            | ~300px column, icon + label items, grouped under small muted headings, separators between groups | Same. Groups and items listed below.                                   |
| Active nav item    | Subtle filled background, rounded, with a 4px accent bar on its left edge | Same, with the teal accent used by the login button                    |
| Main content       | Large page title, a full-width divider under it, then content         | `Dashboard` title and divider, then the sections below                 |
| Right column       | A narrow side column next to the form (profile picture)                | Not used on the dashboard; the content uses the full main width        |
| Spacing and type   | Generous whitespace, small muted helper text, thin borders, no shadows | Chakra semantic tokens only: `bg`, `bg.subtle`, `bg.muted`, `border`, `fg`, `fg.muted` |

Content is centered with a max width (about `7xl`), like the reference. No inline styles and no hard-coded colors.

---

## Decisions

| Topic                    | Decision                                                                                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared shell             | A route group `src/app/(app)/` with a `layout.tsx` that checks the session and renders the shell. `/` moves to `src/app/(app)/page.tsx`. Later screens go in the same group. |
| Session check            | The layout and the page each call `getCurrentUser()`. It's wrapped in React `cache()`, so one request reads the database once.                                    |
| Permissions in pages     | New `getCurrentUser()` returns the user with the role's permission strings. Sections are filtered with the existing `hasPermission()`. API routes keep `requirePermission()`. |
| Missing permission       | A section the user can't see is not rendered at all, not shown empty or locked                                                                                   |
| Nav items for later screens | Shown, but disabled with a muted `Soon` tag, so the sidebar shows the app's structure without linking to 404s. Each later feature enables its own item.        |
| Nav config               | One constant (`src/lib/navigation.ts`) lists groups, items, icons, `href`, required permission and `enabled`. The sidebar and the drawer both render it.          |
| Active item              | Matched on `usePathname()` in a small client component. The rest of the shell stays server-rendered.                                                            |
| Expiry counts            | Computed per batch at read time with the same rules as `getExpiryStatus` and `settings.timezone`, so the counts always match the inventory screens               |
| Digest generation        | The alerts section calls `listNotifications()`, which already runs `generateDailyNotification()`, so loading the dashboard creates today's digest when it's due   |
| Worker status            | Shown only with `settings:manage`. Offline when `workerLastSeenAt` is null or older than 3 × `workerPollIntervalSecs`.                                           |
| Data loading             | One server function per section, run in parallel with `Promise.all`. No API route and no `zustand` store, since nothing on the page is client state.             |
| Icons                    | `react-icons/lu` (Lucide), already installed. Outline icons match the reference.                                                                                 |

---

## UI

### Shell

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [≡] ✚ InventraMed  Dashboard                          [◐] [🔔•] [RL ▾]      │  header
└──────────────────────────────────────────────────────────────────────────────┘

      (RL)  Rodney Lingganay (rodentskie)                                         context header
            Admin

      ┃ ▣ Dashboard            │  Dashboard
                               │  ──────────────────────────────────────────
        Inventory              │
        ◫ Medicines      Soon  │  (dashboard sections)
        ⇄ Transactions   Soon  │
        ⌖ Scan           Soon  │
      ─────────────────────    │
        People                 │
        ☺ Employees      Soon  │
        ⚿ Users & roles  Soon  │
      ─────────────────────    │
        System                 │
        ⚙ Settings       Soon  │
        ☰ Audit logs     Soon  │
```

`[≡]` only appears below `lg` and opens the sidebar in a `Drawer` from the left. The drawer closes when an item is chosen.

#### Navigation

| Group     | Item           | Icon (`react-icons/lu`) | `href`                    | Permission        | Enabled |
| --------- | -------------- | ----------------------- | ------------------------- | ----------------- | ------- |
| —         | Dashboard      | `LuLayoutDashboard`     | `/`                       | none              | yes     |
| Inventory | Medicines      | `LuPill`                | `/medicines`              | `medicine:read`   | no      |
| Inventory | Transactions   | `LuArrowLeftRight`      | `/inventory/transactions` | `inventory:read`  | no      |
| Inventory | Scan           | `LuScanBarcode`         | `/scan`                   | `medicine:read`   | no      |
| People    | Employees      | `LuUsers`               | `/employees`              | `employee:manage` | no      |
| People    | Users & roles  | `LuKeyRound`            | `/users`                  | `user:manage`     | no      |
| System    | Settings       | `LuSettings`            | `/settings`               | `settings:manage` | no      |
| System    | Audit logs     | `LuScrollText`          | `/audit-logs`             | `audit:read`      | no      |

A group with no visible items is hidden, including its heading and separator. With the seeded roles, a `collaborator` sees Dashboard, Medicines, Transactions and Scan.

#### Header

- Left: the menu button (below `lg`), a pill icon and `InventraMed` linking to `/`, then the current page title in `fg` weight `semibold`
- Right:
  - `ColorModeButton`
  - Bell (`LuBell`) with a small teal dot when the latest digest is unread. Shown only with `notification:read`. Links to `/#alerts`. `aria-label` is `Notifications` or `Notifications, unread`.
  - User menu: initials avatar that opens a `Menu` with the name and username (non-interactive), then `Sign out`

### Dashboard (`/`)

Page title `Dashboard`, divider, then the sections in this order. Each section has a small `semibold` heading and, where useful, one line of `fg.muted` helper text, like the field labels in the reference.

```
 Dashboard
 ───────────────────────────────────────────────────────────────────────

 ┌─ Worker offline ─────────────────────────────────────────────────────┐   settings:manage, only when offline
 │ SMS worker last seen 2 hours ago. SMS alerts are not being sent.     │
 └──────────────────────────────────────────────────────────────────────┘

 Overview                                                                     medicine:read
 ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐
 │ Medicines  │ │ Units in   │ │ Near expiry│ │ Expired    │
 │ 128        │ │ stock 4,512│ │ 7 batches  │ │ 2 batches  │
 └────────────┘ └────────────┘ └────────────┘ └────────────┘
 Near expiry means expiring within 30 days.

 Needs attention                                                              medicine:read
 Medicine            Batch     Expires      Status          Qty
 Amoxicillin 500 mg  B#A123    2026-11-01   Expired 7d ago  20 caps
 Paracetamol 500 mg  B#P778    2026-11-12   Near · 4d       150 pc
 …

 Latest alert  (id="alerts")                                                  notification:read
 Daily digest for 2026-11-08 · 2 expired, 7 near expiry      [Unread]

 Recent activity                                                              inventory:read
 Received  +100  Paracetamol 500 mg   by admin   10 min ago
 Dispensed  −20  Amoxicillin 500 mg   by staff1  1 h ago
 …
```

#### Worker status

`Alert` snippet, `status="warning"`, shown only to `settings:manage` and only when offline. `Never seen` when `workerLastSeenAt` is null, otherwise `Last seen {relative time}`. If `smsEnabled` is false, this alert is hidden and the text `SMS alerts are turned off.` shows instead as `fg.muted` helper text.

#### Overview

Four `Stat` cards in a `SimpleGrid` (`columns={{ base: 2, md: 4 }}`), bordered, no shadow:

| Card          | Value                                                         | Accent           |
| ------------- | ------------------------------------------------------------- | ---------------- |
| Medicines     | Non-deleted medicines                                         | none             |
| Units in stock | `SUM(quantity)` over batches of non-deleted medicines        | none             |
| Near expiry   | Batches with `quantity > 0` and `0 <= days to expiry <= threshold` | orange       |
| Expired       | Batches with `quantity > 0` and `days to expiry < 0`          | red              |

Numbers use `toLocaleString('en-PH')`. Helper text under the grid: `Near expiry means expiring within {threshold} days.`

#### Needs attention

Batches of non-deleted medicines with `quantity > 0` and `expiration_date <= today + threshold`, expired first, then soonest expiry: `ORDER BY expiration_date, received_at, id`. Shows at most 10 rows. If there are more, the footer reads `Showing 10 of {N} batches.`

| Column   | Content                                                                       |
| -------- | ----------------------------------------------------------------------------- |
| Medicine | Name and strength, e.g. `Paracetamol 500 mg`                                  |
| Batch    | `batchNumber`                                                                 |
| Expires  | `expirationDate` as `YYYY-MM-DD`                                              |
| Status   | `Status` snippet: red `Expired {n}d ago` / `Expires today` (orange) / orange `{n}d left` |
| Qty      | `quantity` and `unit`                                                         |

Chakra `Table` (`size="sm"`, `variant="outline"`). Below `md`, it scrolls horizontally inside its own container, so the page never scrolls sideways.

Empty state (`EmptyState` snippet): `All stock is safe` / `No batch is expired or expiring within {threshold} days.`

#### Latest alert

The latest non-empty digest from `listNotifications(user.id, { page: 1, pageSize: 1 })`. One bordered row: `Daily digest for {date}`, the counts, and a teal `Unread` tag when unread. It isn't clickable and doesn't mark the digest read; that belongs to the notifications feature.

Empty state: `No alerts yet`.

#### Recent activity

The 5 latest inventory transactions, newest first, each on one line: reason label, signed quantity (`+` for `IN`, `−` for `OUT`) with the unit, medicine name and strength, `by {username}`, and relative time with the exact time in a `Tooltip`.

| Reason             | Label           |
| ------------------ | --------------- |
| `RECEIVED`         | Received        |
| `DISPENSED`        | Dispensed       |
| `COUNT_ADJUSTMENT` | Count adjusted  |
| `RETURNED`         | Returned        |
| `DAMAGED`          | Damaged         |
| `LOST`             | Lost            |
| `EXPIRED_DISPOSAL` | Expired disposal |

Empty state: `No stock movement yet`.

#### No visible sections

A user whose role grants none of the section permissions sees only `Welcome, {first name}.` and `Your role has no dashboard access. Ask an admin for permissions.`

### Page title

`Dashboard | InventraMed`, via the existing `title.template`.

---

## Implementation

### Chakra snippets

From the repository root:

```bash
npx @chakra-ui/cli snippet add avatar --outdir libs/components/src/ui
npx @chakra-ui/cli snippet add menu --outdir libs/components/src/ui
npx @chakra-ui/cli snippet add drawer --outdir libs/components/src/ui
npx @chakra-ui/cli snippet add close-button --outdir libs/components/src/ui
npx @chakra-ui/cli snippet add tooltip --outdir libs/components/src/ui
npx @chakra-ui/cli snippet add stat --outdir libs/components/src/ui
npx @chakra-ui/cli snippet add status --outdir libs/components/src/ui
npx @chakra-ui/cli snippet add empty-state --outdir libs/components/src/ui
npx @chakra-ui/cli snippet add tag --outdir libs/components/src/ui
```

Skip any the CLI reports as already present, and export each from `libs/components/src/index.ts`. `Table`, `SimpleGrid`, `Separator` and `Link` come straight from `@chakra-ui/react`. If a generated snippet fails to compile (TS2590, as `password-input` did), narrow its prop types the same way.

### Files

All paths are relative to `apps/app/` unless they start with `libs/`.

| File                                          | Change                                                                                                   |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `libs/components/src/ui/*.tsx`, `libs/components/src/index.ts` | New snippets above and their exports                                                   |
| `src/app/page.tsx`                            | Removed. Replaced by `src/app/(app)/page.tsx`.                                                            |
| `src/app/(app)/layout.tsx`                    | New. Calls `getCurrentUser()`, redirects to `/login` when null, renders `AppShell`                        |
| `src/app/(app)/page.tsx`                      | New. The dashboard. `metadata.title = 'Dashboard'`. Loads the visible sections in parallel.               |
| `src/components/layout/AppShell.tsx`          | New. Server. Header, context header, sidebar column and main column                                       |
| `src/components/layout/AppHeader.tsx`         | New. Server. Logo, title, color mode, bell, user menu                                                     |
| `src/components/layout/SidebarNav.tsx`        | New. `'use client'`. Renders the filtered nav, marks the active item with `usePathname()`                 |
| `src/components/layout/MobileNav.tsx`         | New. `'use client'`. Menu button and `Drawer` wrapping `SidebarNav`                                       |
| `src/components/layout/UserMenu.tsx`          | New. `'use client'`. Avatar `Menu` with sign-out; reuses `SignOutButton`'s `signOut` call                 |
| `src/components/dashboard/WorkerStatusAlert.tsx` | New                                                                                                    |
| `src/components/dashboard/OverviewStats.tsx`  | New                                                                                                       |
| `src/components/dashboard/AttentionTable.tsx` | New                                                                                                       |
| `src/components/dashboard/LatestAlert.tsx`    | New                                                                                                       |
| `src/components/dashboard/RecentActivity.tsx` | New. Uses a small client `Tooltip` wrapper for the exact time                                             |
| `src/components/auth/SignOutButton.tsx`       | Unused once `UserMenu` signs out. Confirm with the user before deleting it.                               |
| `src/lib/auth.ts`                             | Add `getCurrentUser()`, wrapped in `cache()`. `getActiveUser()` stays for `/login`.                       |
| `src/lib/navigation.ts`                       | New. `NAV_GROUPS` constant and `getVisibleNav(permissions)`                                               |
| `src/lib/dashboard.ts`                        | New. `server-only`. `getOverview()`, `getAttentionBatches()`, `getRecentActivity()`, `getWorkerStatus()`  |
| `src/lib/format.ts`                           | New. `formatRelativeTime(date, now)`, `formatDaysToExpiry(days)`, `REASON_LABELS`                         |
| `src/types/auth.ts`                           | Add `CurrentUser`                                                                                         |
| `src/types/dashboard.ts`                      | New. `DashboardOverview`, `AttentionBatch`, `AttentionList`, `ActivityItem`, `WorkerStatus`, `NavGroup`, `NavItem` |
| `specs/`                                      | New and updated tests, listed below                                                                       |

### `getCurrentUser()`

```ts
interface CurrentUser {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  roleName: string;
  permissions: string[];
}
```

Same active-account rules as `getActiveUser()` (active user, active and non-deleted employee). Returns `null` instead of throwing. Wrapped in React `cache()` so the layout and page share one read per request.

### `src/lib/dashboard.ts`

- `getOverview()`: one raw SQL query with `today` and `threshold` from `getExpiryContext()`, joining `medicine_batches` to non-deleted `medicines`, returning `medicineCount`, `unitsInStock`, `nearExpiryBatches`, `expiredBatches` with `COUNT(*) FILTER (WHERE …)`. Cast counts to `int` so Prisma doesn't return `bigint`. Medicines with no batches still count toward `medicineCount`.
- `getAttentionBatches(limit = 10)`: `findMany` plus `count` in one `$transaction`, with the filter and order above. Maps rows with the existing `getDaysToExpiry` / `getExpiryStatus`, so the status rules live in one place.
- `getRecentActivity(limit = 5)`: `inventoryTransaction.findMany` including `medicine { name, strength, unit }` and `performedBy { username }`. A separate query, so `listTransactions()` and its API response stay unchanged.
- `getWorkerStatus(now)`: from `getSettings()`, returns `{ smsEnabled, lastSeenAt, online }`.

Each function is under 50 lines and takes no user input, so there's nothing to validate with Zod.

### Dependencies

None. `react-icons` is already installed.

---

## Testing

Unit and component tests (Jest, no database). Mock Prisma and `next/navigation`. Wrap components in `ChakraProvider` with `defaultSystem`.

- `getCurrentUser`: no session, missing user, inactive user, inactive or deleted employee, active user with permissions and role name
- `getVisibleNav`: `*` sees everything; each seeded role sees the expected items; empty groups are removed; disabled items carry `enabled: false`
- `formatDaysToExpiry`: negative, zero, positive
- `formatRelativeTime`: seconds, minutes, hours, days
- `getWorkerStatus`: never seen, recent, stale, SMS disabled
- `getAttentionBatches`: maps status and days, reports the total beyond the limit
- `SidebarNav`: marks the active item with `aria-current="page"`, renders disabled items as non-links with `Soon`
- `AttentionTable`, `LatestAlert`, `RecentActivity`: rows and empty states
- `(app)/layout`: redirects to `/login` when `getCurrentUser()` is null
- `(app)/page`: renders only the sections the permissions allow, and the no-access message when none
- Update `specs/index.spec.tsx` for the new location of `/`

Manual checks, run with `APP=app npm run dev` after seeding and adding a few medicines and batches through the API:

- [ ] `admin` sees every section and every nav item
- [ ] A `collaborator` sees Overview, Needs attention, Latest alert and Recent activity, no worker alert, and only the Inventory nav group
- [ ] The overview counts match the medicine API's batch statuses
- [ ] A batch expiring today shows as near expiry, and one that expired yesterday as expired
- [ ] Disposing an expired batch removes it from Needs attention on reload
- [ ] The bell's dot shows when the latest digest is unread, and `/#alerts` scrolls to the section
- [ ] The worker alert appears when the worker hasn't polled for 3 intervals, and disappears after a claim call
- [ ] Below `lg`, the sidebar is hidden, the menu button opens it in a drawer, and choosing an item closes it
- [ ] No horizontal page scroll at phone width; the table scrolls inside its container
- [ ] Both color modes are readable and match the reference's look (borders, muted text, active item bar)
- [ ] Sign out from the user menu returns to `/login`
- [ ] Deactivating a signed-in user sends them to `/login` on the next load

## Acceptance Criteria

- All goals are met and all manual checks pass
- No section or nav item is rendered without its permission
- Expiry counts and statuses use the same rules and timezone as the medicine API
- `npm` lint, test and build pass
