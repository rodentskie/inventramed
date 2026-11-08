# 15 — Notifications Pages

## Overview

Add the in-app notification screens: a list of daily expiry digests with their read state, and a digest page listing every near-expiry and expired batch it found. Opening a digest marks it read for that user.

The header bell from feature 11 links here instead of to the dashboard, and the dashboard's "Latest alert" opens the digest.

It needs no schema change, migration or new API route.

## Goals

- `/notifications` lists digests newest first, with counts, and unread ones highlighted
- `/notifications/[id]` shows the digest's batches, expired first, each linking to its medicine
- Opening a digest marks it read for the current user only
- `Mark all as read` clears the unread state
- The bell links to `/notifications`, and its dot clears once the latest digest is read
- A Notifications nav item is added
- Lint, test and build pass

## Out of Scope

- SMS delivery status per recipient. That belongs on a future SMS log page for admins.
- Real-time updates or push notifications. Digests are daily, so a page load is current enough.
- Marking a digest unread again
- Deleting digests
- Acting on a batch from the digest page. Each row links to the medicine, where feature 13's actions are.

---

## Current state

Checked in the code on 2026-11-08.

### Already in place

| Area           | Where                                       | Behavior                                                                      |
| -------------- | ------------------------------------------- | ----------------------------------------------------------------------------- |
| List           | `listNotifications(userId, { page, pageSize })` | Runs `generateDailyNotification()` first. Hides empty digests. Returns `unreadCount` |
| Detail         | `getNotification(userId, id)`               | Items with medicine name, strength, batch number, status, snapshot quantity, expiry and days, ordered by days to expiry |
| Mark read      | `markNotificationRead(userId, id)`          | Idempotent; keeps the first `readAt`                                          |
| Latest digest  | `getLatestDigest(userId)` in `src/lib/dashboard.ts` | Cached per request; drives the bell                                   |
| Plumbing       | Features 11–13                              | `requirePageUser`, `runAction`, `parseListQuery`, `ListPagination`            |

### Facts that affect this feature

- Item quantity, expiry and days are snapshots from when the digest was made. The batch may have been disposed of since.
- A digest only exists for days where something was near expiry or expired, so days can be missing from the list.

---

## Decisions

| Topic                 | Decision                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Marking read          | A client component on the digest page calls `markNotificationReadAction` once on mount, then refreshes the router so the bell updates. A server component render doesn't write. |
| Mark all as read      | New `markAllNotificationsRead(userId)` that inserts reads for every non-empty digest with `createMany({ skipDuplicates: true })` |
| Snapshot vs live      | The digest page shows the snapshot, labelled `As of {date}`. Each row shows the batch's current quantity next to it when they differ, e.g. `20 pc (now 0)`, from one extra query. |
| Item ordering         | Expired first, then by days to expiry, as `getNotification` returns them                                                        |
| Bell                  | Links to `/notifications`. `aria-label` stays `Notifications` or `Notifications, unread`.                                        |
| Dashboard link        | The "Latest alert" row links to `/notifications/[id]`                                                                            |
| Nav                   | `Notifications` with `LuBell`, right after Dashboard in the ungrouped section, needing `notification:read`                      |

---

## UI

### `/notifications`

Requires `notification:read`.

```
 Notifications                                         [ Mark all as read ]
 ─────────────────────────────────────────────────────────────────────
 ● Daily digest for 2026-11-08      2 expired · 7 near expiry      Unread
   Daily digest for 2026-11-07      2 expired · 6 near expiry
   Daily digest for 2026-11-05      1 expired · 4 near expiry
                                         ‹ 1 2 › · 1–20 of 31
```

- Each row links to its digest. Unread rows have a teal dot and `semibold` text.
- `Mark all as read` is disabled when `unreadCount` is 0
- Empty state: `No alerts yet` / `A digest appears here on days a batch is near expiry or expired.`
- Page title: `Notifications | InventraMed`

### `/notifications/[id]`

Requires `notification:read`.

```
 Daily digest for 2026-11-08
 ─────────────────────────────────────────────────────────────────────
 2 expired · 7 near expiry · As of 2026-11-08 08:00

 Medicine             Batch    Expires      Status            Qty
 Amoxicillin 500 mg   A123     2026-11-01   ● Expired 7d ago  20 cap (now 0)
 Paracetamol 500 mg   P778     2026-11-12   ● 4d left         150 pc
```

- The medicine name links to `/medicines/[medicineId]`, if the user has `medicine:read`
- Status uses `Status` and `formatDaysToExpiry`, as on the dashboard
- `As of` uses the digest's `createdAt` in the settings timezone
- A missing or empty digest shows the not-found page
- Page title: `Digest {date} | InventraMed`

---

## Implementation

### Files

All paths are relative to `apps/app/`.

| File                                                | Change                                                                      |
| --------------------------------------------------- | --------------------------------------------------------------------------- |
| `src/lib/notifications.ts`                          | Add `markAllNotificationsRead(userId)` and `getCurrentBatchQuantities(batchIds)` |
| `src/actions/notifications.ts`                      | New. `markNotificationReadAction(id)`, `markAllNotificationsReadAction()`, both requiring `notification:read` and revalidating `/notifications` and the layout |
| `src/app/(app)/notifications/page.tsx`              | New                                                                         |
| `src/app/(app)/notifications/[id]/page.tsx`         | New                                                                         |
| `src/components/notifications/DigestList.tsx`       | New                                                                         |
| `src/components/notifications/DigestItemsTable.tsx` | New                                                                         |
| `src/components/notifications/MarkAsRead.tsx`       | New. `'use client'`. Runs once on mount, renders nothing                    |
| `src/components/notifications/MarkAllReadButton.tsx` | New. `'use client'`                                                       |
| `src/components/layout/AppHeader.tsx`               | Bell links to `/notifications`                                              |
| `src/components/dashboard/LatestAlert.tsx`          | Row links to the digest                                                     |
| `src/lib/navigation.ts`, `SidebarNav.tsx`           | Add the Notifications item and its icon                                     |

`revalidatePath('/', 'layout')` after marking read, so the bell's dot is recomputed on the next render.

---

## Testing

- `markAllNotificationsRead`: inserts only for non-empty digests, skips existing reads
- `getCurrentBatchQuantities`: maps IDs to quantities
- Actions: permission, `NOT_FOUND` for an empty or missing digest, revalidation
- `MarkAsRead`: calls the action once, refreshes on success, stays silent on failure
- `DigestList`: unread styling, links, empty state, button disabled with nothing unread
- `DigestItemsTable`: `(now N)` only when the quantity changed, medicine links only with `medicine:read`
- Pages: permission redirect, `notFound()`
- Header and dashboard links point to the new pages

Manual checks:

- [ ] After the daily time passes with near-expiry stock, the bell shows a dot and the list shows today's digest as unread
- [ ] Opening it marks it read, and the bell's dot clears after navigating
- [ ] Another user still sees it as unread
- [ ] `Mark all as read` clears every unread digest
- [ ] Disposing a batch shows `(now 0)` on older digests that listed it
- [ ] A role without `notification:read` has no bell or nav item, and the URL redirects to `/`

## Acceptance Criteria

- All goals are met and all manual checks pass
- Read state is per user and is never written by a GET render
- `npm` lint, test and build pass
