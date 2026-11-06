# 06 — Settings API

## Overview

Add REST endpoints in `apps/app` to read and update the single `settings` row. There is no create or delete, because the row is seeded by the first migration and a `CHECK` keeps it at `id = 1`.

This feature is API only, and it needs no schema change or migration.

## Goals

- `GET /api/settings` returns the settings
- `PATCH /api/settings` updates any editable field and records who changed it
- Invalid values are rejected, including those the database doesn't check
- Both endpoints require `settings:manage`
- Lint, test and build pass, and `prisma migrate status` reports in sync

## Out of Scope

- Create or delete on `settings`
- Auditing settings changes in `audit_logs`
- Using the SMS and worker settings, which @context/features/07-notifications.spec.md and @context/features/08-sms-worker-api.spec.md do
- UI screens

---

## Current database

Checked on the local database through the Postgres MCP on 2026-11-06.

| Column                       | Current value                | Database check                 | Allowed by this API              |
| ---------------------------- | ---------------------------- | ------------------------------ | -------------------------------- |
| `facility_name`              | `InventraMed`                | None                           | Trimmed, 1–100 characters        |
| `timezone`                   | `Asia/Manila`                | None                           | A valid IANA timezone            |
| `near_expiry_threshold_days` | `30`                         | `> 0`                          | Integer, 1–3650                  |
| `daily_notification_time`    | `08:00`                      | `HH:mm` format                 | `HH:mm`, 00:00–23:59             |
| `sms_enabled`                | `true`                       | None                           | Boolean                          |
| `sms_max_attempts`           | `3`                          | `> 0`                          | Integer, 1–20                    |
| `sms_retry_delay_minutes`    | `15`                         | **None**                       | Integer, 1–1440                  |
| `sms_claim_timeout_minutes`  | `10`                         | **None**                       | Integer, 1–1440                  |
| `sms_batch_size`             | `10`                         | **None**                       | Integer, 1–100                   |
| `sms_max_items`              | `10`                         | `> 0`                          | Integer, 1–100                   |
| `worker_poll_interval_secs`  | `300`                        | **None**                       | Integer, 10–86400                |
| `sms_template`               | See @context/database-schema.md | None                        | 1–1000 characters, known placeholders only |

These aren't editable: `id`, `worker_last_seen_at`, `updated_by`, `updated_at`.

### Facts that affect this feature

- Zod is the only protection for the columns marked **None**. For example, an `sms_batch_size` of 0 would silently stop all SMS, and a negative retry delay would retry immediately.
- `settings` has no audit trigger, so `updated_by` only records the last editor.
- `src/lib/medicines.ts` reads `timezone` and `near_expiry_threshold_days` on every batch response, so a change applies immediately.

---

## Decisions

| Topic               | Decision                                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Permission          | `settings:manage` for both read and update, the only settings permission. Only `admin` holds it today.                                            |
| Transaction         | One `prisma.setting.update`, with `updatedById` set to the caller. No `withActor`, because there is no audit trigger.                             |
| Timezone validation | `new Intl.DateTimeFormat('en-US', { timeZone })` in a `try/catch`, the same API `getLocalToday` uses, so an accepted value can't break it later.   |
| Template validation | Rejects any `{placeholder}` other than `{facility}`, `{date}`, `{expired}`, `{near_expiry}` and `{items}`, so a typo can't reach an SMS.           |
| Response            | Includes `workerLastSeenAt`, so the UI can warn when the Pi worker is offline.                                                                    |

---

## API

### `GET /api/settings`

Returns:

```ts
interface Settings {
  facilityName: string;
  timezone: string;
  nearExpiryThresholdDays: number;
  dailyNotificationTime: string;
  smsEnabled: boolean;
  smsMaxAttempts: number;
  smsRetryDelayMinutes: number;
  smsClaimTimeoutMinutes: number;
  smsBatchSize: number;
  smsMaxItems: number;
  workerPollIntervalSecs: number;
  smsTemplate: string;
  workerLastSeenAt: string | null;
  updatedBy: { id: string; username: string } | null;
  updatedAt: string;
}
```

### `PATCH /api/settings`

Accepts any editable field from the table above, with at least one field. The schema is strict, so `workerLastSeenAt`, `updatedBy`, `id` and any other field return `400`. Returns the updated `Settings`.

### Errors

| Status | Code               | When                                     |
| ------ | ------------------ | ---------------------------------------- |
| `400`  | `INVALID_JSON`     | The body isn't valid JSON                |
| `400`  | `VALIDATION_ERROR` | A field fails validation, or the body is empty |
| `401`  | `UNAUTHENTICATED`  | No valid session                         |
| `403`  | `FORBIDDEN`        | The caller lacks `settings:manage`       |

---

## Known limitations

- **Changing `timezone`** changes which date counts as "today". A move can skip a date or re-run on a date that already has a digest, and `notifications.notification_date` is unique, so a re-run does nothing.
- **Changing `near_expiry_threshold_days`** or `daily_notification_time` applies from the next digest. It doesn't rewrite today's.
- **Turning off `sms_enabled`** is handled in @context/features/08-sms-worker-api.spec.md.

---

## Implementation

### Files

All paths are relative to `apps/app/`.

| File                                    | Change                                       |
| --------------------------------------- | -------------------------------------------- |
| `src/app/api/settings/route.ts`         | New. `GET`, `PATCH`                          |
| `src/lib/settings.ts`                   | New. `getSettings`, `updateSettings`, with `import 'server-only'` |
| `src/lib/validations/settings.ts`       | New. `updateSettingsSchema`                  |
| `src/types/settings.ts`                 | New. Response type                           |
| `specs/lib/validations/settings.spec.ts`, `specs/lib/settings.spec.ts`, `specs/api/settings/routes.spec.ts` | New. Tests |

### Dependencies

None.

---

## Testing

Unit and route tests (Jest, no database):

- Schema: limits for each number, `HH:mm` boundaries (`23:59`, `24:00`), valid and invalid timezones, unknown placeholders rejected, known ones accepted, empty body and unknown fields rejected
- Data layer: sets `updatedById`, and never writes `workerLastSeenAt`
- Routes: `401`, `403`, `400`, and the response format

Manual checks against a local database (record results in the PR):

- [ ] `prisma migrate status` reports up to date
- [ ] `GET /api/settings` as `admin` returns the seeded values
- [ ] `PATCH` changes only the fields sent, and sets `updated_by` and `updated_at`
- [ ] Changing `near_expiry_threshold_days` changes a batch's status on the next medicine read
- [ ] `sms_batch_size: 0`, `timezone: "Mars/Base"` and `{bogus}` in the template each return `400`
- [ ] `staff` and `collaborator` get `403`, and no session gets `401`
- [ ] The number of `settings` rows stays at 1

## Acceptance Criteria

- Both endpoints behave as documented, and all manual checks pass
- No endpoint can create or delete a `settings` row
- `npm` lint, test and build pass
