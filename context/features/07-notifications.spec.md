# 07 — Daily Digest and In-App Notifications

## Overview

Generate the daily expiry digest and show it in the app. This covers `notifications`, `notification_items` and `notification_reads`, and queues `sms_messages` rows for the worker. Sending them is @context/features/08-sms-worker-api.spec.md.

These tables are generated data, so there is no general CRUD. Users can only read digests and mark them as read.

This feature is API only, and it needs no schema change or migration.

## Goals

- `generateDailyNotification()` creates at most one digest per day, and is safe to call concurrently
- A failure partway through leaves no partial digest
- Users can list digests, read one with its items, and mark it as read
- Read state is per user
- One SMS per active recipient is queued per digest, and a stale digest is never queued for sending
- Lint, test and build pass, and `prisma migrate status` reports in sync

## Out of Scope

- Worker endpoints and sending SMS
- Create, update or delete endpoints for notifications
- Marking a digest as unread
- Pushing notifications to open browsers
- UI screens

---

## Current database

Checked on the local database through the Postgres MCP on 2026-11-06. All these tables are empty.

- `notifications.notification_date` is unique, which is what makes generation safe to run concurrently
- `notification_items` is unique on `(notification_id, batch_id)`
- `notification_reads` has the primary key `(notification_id, user_id)`
- `sms_messages` is unique on `(notification_id, employee_id)`
- None of these tables have triggers, so generation needs no `withActor`

---

## Changes to the documented flow

Implementing @context/database-schema.md as written would leave two problems, so this feature changes it and updates that file.

| Problem                                                                                                                                                       | Change                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Step 2 commits the `notifications` row on its own. A crash before step 3 would leave today empty forever, because later calls see the row and stop.           | All steps run in one `prisma.$transaction`. A concurrent caller waits on the unique index, then finds the row. |
| Step 4 stops when there are no items, before step 5 cancels older messages. Once everything is disposed of, yesterday's pending retries would still be sent. | Cancel older messages before the "no items" stop.                              |

---

## Decisions

| Topic                | Decision                                                                                                                                     |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Permission           | `notification:read` for all three endpoints. All seeded roles hold it.                                                                        |
| When it runs         | At the start of `GET /api/notifications` and each worker claim. No separate cron, as documented.                                              |
| A read that writes   | `GET /api/notifications` may insert a digest. This is intentional, so the in-app digest appears when the worker is offline.                   |
| Empty digests        | The row is kept to record that today ran, and is hidden from every endpoint.                                                                  |
| Marking as read      | `POST` with an upsert, so repeating it is harmless and keeps the first `read_at`.                                                             |
| Read state reach     | Marking a digest as read affects only that digest and that user.                                                                              |
| Deleted medicines    | Excluded from the digest. They can't hold stock, but the query checks anyway.                                                                 |

---

## API

### `GET /api/notifications`

Runs generation first. `page` defaults to `1`, and `pageSize` defaults to `20`, up to 100. Returns newest first, with empty digests hidden:

```ts
interface NotificationList {
  items: NotificationSummary[];
  total: number;
  unreadCount: number; // for the bell
  page: number;
  pageSize: number;
}

interface NotificationSummary {
  id: string;
  notificationDate: string; // YYYY-MM-DD
  expiredCount: number;
  nearExpiryCount: number;
  isRead: boolean; // for the caller
  createdAt: string;
}
```

### `GET /api/notifications/:id`

Returns `NotificationSummary` plus `items`, expired first, then by soonest expiry. Values are snapshots from generation time:

```ts
interface NotificationItem {
  id: string;
  batchId: string;
  medicineId: string;
  medicineName: string;
  strength: string | null;
  batchNumber: string;
  status: 'NEAR_EXPIRY' | 'EXPIRED';
  quantity: number;
  expirationDate: string;
  daysToExpiry: number; // negative = days since expiry
}
```

`medicineName`, `strength` and `batchNumber` are live, because they aren't snapshotted. An empty digest returns `404`.

### `POST /api/notifications/:id/read`

Takes no body. Returns `200` with `{ id, readAt }`. An unknown or empty digest returns `404`.

### Errors

| Status | Code               | When                                     |
| ------ | ------------------ | ---------------------------------------- |
| `400`  | `VALIDATION_ERROR` | A query or path value fails validation   |
| `401`  | `UNAUTHENTICATED`  | No valid session                         |
| `403`  | `FORBIDDEN`        | The caller lacks `notification:read`     |
| `404`  | `NOT_FOUND`        | The digest doesn't exist or is empty     |

---

## Implementation

### `generateDailyNotification()`

1. Read `settings`. Work out `today` and the current local `HH:mm` in `settings.timezone`. If it's before `daily_notification_time`, stop, without opening a transaction.
2. Open `prisma.$transaction`.
3. `INSERT INTO notifications (notification_date) VALUES ($today) ON CONFLICT DO NOTHING`. If no row was inserted, stop.
4. Cancel older messages: set `CANCELLED` on `sms_messages` for earlier digests that are `PENDING`, or `SENDING` past `sms_claim_timeout_minutes`.
5. Insert `notification_items` for every batch of a non-deleted medicine where `quantity > 0` and `expiration_date - today <= near_expiry_threshold_days`, snapshotting `status`, `quantity`, `expiration_date` and `days_to_expiry`. Set `expired_count` and `near_expiry_count`.
6. If there are no items, stop. The transaction still commits.
7. If `settings.sms_enabled`, insert one `sms_messages` row per employee who is active, not deleted, and has `receives_sms_alerts = true`, snapshotting `phone_number` and the rendered `body`.

Add a cheap check before step 2: if today's row already exists, return. This runs on every worker poll and list request.

### SMS body

`renderSmsBody(template, values)` and `formatSmsItems(items, maxItems)` are pure functions.

- Replace placeholders in a single regex pass with a replacer function. Repeated `.replace()` calls would substitute inside inserted text, such as a medicine named `{items}`, and a string replacement would interpret `$` in a name.
- `{date}` is the local date, as `YYYY-MM-DD`
- `{items}` lists up to `sms_max_items` lines, expired first, then soonest expiry, such as `Paracetamol 500mg B#A123 exp 2026-11-02 (3d)`. An expired item shows negative days, such as `(-2d)`.
- If there are more items, it ends with `+N more, check InventraMed`

### Files

All paths are relative to `apps/app/`.

| File                                            | Change                                               |
| ----------------------------------------------- | ---------------------------------------------------- |
| `src/app/api/notifications/route.ts`            | New. `GET` list                                      |
| `src/app/api/notifications/[id]/route.ts`       | New. `GET` one                                       |
| `src/app/api/notifications/[id]/read/route.ts`  | New. `POST`                                          |
| `src/lib/notifications.ts`                      | New. Generation and reads, with `import 'server-only'` |
| `src/lib/sms-body.ts`                           | New. Pure rendering functions                        |
| `src/lib/expiry.ts`                             | Adds `getLocalTime(timezone, now)`, returning `HH:mm` |
| `src/lib/validations/notification.ts`           | New. List query schema                               |
| `src/types/notification.ts`                     | New. Response types                                  |
| `specs/lib/sms-body.spec.ts`, `specs/lib/notifications.spec.ts`, `specs/lib/expiry.spec.ts`, `specs/api/notifications/*.spec.ts` | New or extended tests |
| `../../context/database-schema.md`              | Updates the generation steps, per [Changes to the documented flow](#changes-to-the-documented-flow) |

### Dependencies

None.

---

## Testing

Unit and route tests (Jest, no database):

- `getLocalTime`: returns Manila time when UTC is on the previous day
- `formatSmsItems`: order, `sms_max_items`, the `+N more` line, negative days
- `renderSmsBody`: all placeholders, a medicine name containing `{items}` or `$&` stays literal
- `generateDailyNotification`, with Prisma mocked: stops before the daily time, stops when the row exists, cancels older messages even with no items, skips SMS when disabled
- Routes: `401`, `403`, `400`, `404`, and the response format

Manual checks (use a throwaway database, because stock data can't be removed):

- [ ] `prisma migrate status` reports up to date
- [ ] Before `daily_notification_time`, no digest is created
- [ ] After it, one digest appears with the right items, counts and snapshots
- [ ] 10 concurrent `GET /api/notifications` requests create one digest and one set of SMS rows
- [ ] A batch at 0 stock is excluded, and one on the threshold is included
- [ ] A day with no items creates a hidden row, returns `404`, and cancels older pending SMS
- [ ] Yesterday's `PENDING` messages become `CANCELLED` when today's digest is generated
- [ ] One SMS row is queued per active recipient, and inactive, deleted or opted-out employees get none
- [ ] `sms_enabled: false` queues no SMS but still creates the digest
- [ ] Two users have separate read state, and `unreadCount` updates for one only
- [ ] Marking as read twice succeeds and keeps the first `read_at`

## Acceptance Criteria

- All endpoints behave as documented, and all manual checks pass
- At most one digest exists per day, with no partial digests
- No endpoint can edit or delete a notification
- @context/database-schema.md matches the implemented flow
- `npm` lint, test and build pass
