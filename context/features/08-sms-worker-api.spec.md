# 08 — SMS Worker API

## Overview

Add the two endpoints the Raspberry Pi worker uses to claim queued messages from `sms_messages` and report results to `sms_attempts`. They use a bearer token, not a user session.

These tables are an outbox and a delivery log, so there is no general CRUD.

This feature is API only, and it needs no schema change or migration. It requires @context/features/07-notifications.spec.md, because a claim runs `generateDailyNotification()`.

## Goals

- `POST /api/worker/sms/claim` atomically claims a batch, and two workers can never claim the same message
- `POST /api/worker/sms/:id/result` records every attempt and moves the message to the right status
- Only messages from the latest digest are ever sent
- A worker that dies mid-send can't leave a message stuck
- A repeated or late result can't corrupt a message
- Each worker call updates `settings.worker_last_seen_at`, without changing `settings.updated_at`
- Lint, test and build pass, and `prisma migrate status` reports in sync

## Out of Scope

- The Pi worker app, its GSM code, and PDU or multipart SMS
- Admin screens or endpoints for monitoring SMS delivery
- Multiple worker tokens or token rotation

---

## Current database

Checked on the local database through the Postgres MCP on 2026-11-06. Both tables are empty.

- `sms_messages` has an index on `(status, next_attempt_at)` for the claim query, and is unique on `(notification_id, employee_id)`
- `sms_attempts` is unique on `(sms_message_id, attempt_no)`, so reporting the same attempt twice would fail without a check
- `settings.updated_at` uses Prisma's `@updatedAt`, so a normal `prisma.setting.update` would make each heartbeat look like an admin edit
- Neither table has triggers

---

## Changes to the documented flow

Implementing @context/database-schema.md as written would leave these problems, so this feature changes it and updates that file.

| Problem                                                                                                                                                       | Change                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| A message claimed before a new digest can return to `PENDING` on failure, or on claim timeout, and then send a stale list.                                     | A claim only selects messages from the latest digest.                                                   |
| A claim timeout requeues the message and adds to `attempts`, but only `/result` can set `FAILED`. A worker that keeps dying would retry that message forever. | A claim first sets `FAILED` on `SENDING` messages past the timeout that have used all their attempts.   |
| A repeated or late result would insert a duplicate `sms_attempts` row and fail, or overwrite a newer claim.                                                    | The result body includes `attempt`, the value from the claim. A result that doesn't match is ignored.   |
| The worker has no way to read `worker_poll_interval_secs`.                                                                                                     | The claim response includes `pollIntervalSecs`.                                                         |
| `UPDATE … WHERE id IN (SELECT … LIMIT n FOR UPDATE SKIP LOCKED)` isn't guaranteed to stop at `n`, because PostgreSQL can re-run the subquery.                  | Select the rows in a CTE, then join to it.                                                              |

---

## Decisions

| Topic                  | Decision                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Authentication         | `Authorization: Bearer <WORKER_API_TOKEN>`. Doesn't use `requirePermission`, because the worker isn't a user.                                     |
| Token comparison       | SHA-256 both values, then `crypto.timingSafeEqual`, so timing doesn't reveal the token and differing lengths don't throw.                          |
| Missing token          | If `WORKER_API_TOKEN` isn't set, log an error and reject every call, so the API can't be left open by accident.                                    |
| `sms_enabled: false`   | A claim returns no messages, and `PENDING` messages wait. The next digest supersedes them. This stops sending immediately when an admin turns SMS off. |
| Heartbeat              | Updated with raw SQL on both endpoints, so `updated_at` and `updated_by` still describe the last admin edit.                                       |
| Delivery               | At-least-once, as documented. A worker that dies after sending but before reporting may send that message twice.                                   |

---

## API

Both routes use the response format from `src/lib/api-response.ts`.

### `POST /api/worker/sms/claim`

Takes no body. Returns `200`:

```json
{
  "success": true,
  "data": {
    "pollIntervalSecs": 300,
    "messages": [
      {
        "id": "<sms_messages.id>",
        "phoneNumber": "+639171234567",
        "body": "InventraMed expiry alert 2026-11-06: ...",
        "attempt": 1
      }
    ]
  }
}
```

### `POST /api/worker/sms/:id/result`

```json
{ "attempt": 1, "success": true, "modemResponse": "+CMGS: 42" }
```

| Field           | Rules                                     |
| --------------- | ----------------------------------------- |
| `attempt`       | Required integer, at least 1, from the claim |
| `success`       | Required boolean                          |
| `error`         | Optional, up to 500 characters            |
| `modemResponse` | Optional, up to 1000 characters           |

Returns `200` with `{ id, status, applied }`. `applied` is `false` when the result is ignored because the message isn't `SENDING`, or `attempt` doesn't match `sms_messages.attempts`. That's still a `200`, so the worker doesn't retry it.

### Errors

| Status | Code               | When                                                 |
| ------ | ------------------ | ---------------------------------------------------- |
| `400`  | `INVALID_JSON`     | The body isn't valid JSON                            |
| `400`  | `VALIDATION_ERROR` | A body or path value fails validation                |
| `401`  | `UNAUTHENTICATED`  | The token is missing, wrong, or not configured       |
| `404`  | `NOT_FOUND`        | The message doesn't exist                            |

---

## Implementation

### Claim flow

1. Check the token
2. Update the heartbeat: `UPDATE settings SET worker_last_seen_at = now() WHERE id = 1`
3. Run `generateDailyNotification()`
4. Read `settings`. If `sms_enabled` is `false`, return no messages.
5. Give up on messages that have used all their attempts:

   ```sql
   UPDATE sms_messages
      SET status = 'FAILED', last_error = 'Claim timed out', updated_at = now()
    WHERE status = 'SENDING'
      AND claimed_at < now() - make_interval(mins => $timeout)
      AND attempts >= $maxAttempts;
   ```

6. Claim:

   ```sql
   WITH picked AS (
     SELECT id FROM sms_messages
      WHERE notification_id = (SELECT id FROM notifications ORDER BY notification_date DESC LIMIT 1)
        AND ((status = 'PENDING' AND next_attempt_at <= now())
          OR (status = 'SENDING' AND claimed_at < now() - make_interval(mins => $timeout)))
      ORDER BY created_at
      LIMIT $batchSize
      FOR UPDATE SKIP LOCKED
   )
   UPDATE sms_messages m
      SET status = 'SENDING', claimed_at = now(), attempts = m.attempts + 1, updated_at = now()
     FROM picked
    WHERE m.id = picked.id
   RETURNING m.id, m.phone_number, m.body, m.attempts;
   ```

### Result flow

In one `prisma.$transaction`:

1. Lock the message with `SELECT … FOR UPDATE`, and return `404` if it's missing
2. If it isn't `SENDING`, or `attempts` differs from `attempt`, return `applied: false`
3. Insert `sms_attempts` with `attempt_no = attempt`
4. On success, set `SENT` and `sent_at`
5. On failure with `attempts >= sms_max_attempts`, set `FAILED` and `last_error`
6. On other failures, set `PENDING`, `last_error`, and `next_attempt_at = now + sms_retry_delay_minutes`

Update the heartbeat before step 1, outside the transaction.

### Files

All paths are relative to `apps/app/`.

| File                                           | Change                                                  |
| ---------------------------------------------- | ------------------------------------------------------- |
| `.env.example`                                 | Adds `WORKER_API_TOKEN`, generated with `openssl rand -base64 32` |
| `src/app/api/worker/sms/claim/route.ts`        | New. `POST`                                             |
| `src/app/api/worker/sms/[id]/result/route.ts`  | New. `POST`                                             |
| `src/lib/worker-auth.ts`                       | New. `requireWorkerToken(request)`                      |
| `src/lib/sms-outbox.ts`                        | New. `claimSmsMessages`, `recordSmsResult`, with `import 'server-only'` |
| `src/lib/validations/sms.ts`                   | New. Result schema                                      |
| `src/types/sms.ts`                             | New. Response types                                     |
| `specs/lib/worker-auth.spec.ts`, `specs/lib/sms-outbox.spec.ts`, `specs/api/worker/*.spec.ts` | New. Tests |
| `README.md`                                    | Mentions setting `WORKER_API_TOKEN` in the environment file step |
| `../../context/database-schema.md`             | Updates the worker flow, per [Changes to the documented flow](#changes-to-the-documented-flow) |

### Dependencies

None.

---

## Testing

Unit and route tests (Jest, no database):

- `requireWorkerToken`: correct, wrong, wrong length, missing header, not `Bearer`, and token not configured
- Result schema: required fields, length limits, unknown fields rejected
- `recordSmsResult`, with Prisma mocked: each status outcome, and `applied: false` for a repeated or late result
- Routes: `401`, `400`, `404`, and the response format

Manual checks against a throwaway database, using curl as the worker:

- [ ] `prisma migrate status` reports up to date
- [ ] Without a token, or with a wrong one, both routes return `401`, and a user session cookie doesn't work
- [ ] With `WORKER_API_TOKEN` unset, every call returns `401`
- [ ] A claim returns at most `sms_batch_size` messages, sets `SENDING` and adds 1 to `attempts`
- [ ] 5 concurrent claims never return the same message twice
- [ ] A successful result sets `SENT` and writes one attempt row
- [ ] A failed result returns to `PENDING` with a backoff, and the message isn't claimed before `next_attempt_at`
- [ ] After `sms_max_attempts` failures, the message is `FAILED`
- [ ] Repeating a result returns `applied: false`, with no second attempt row
- [ ] A late result after a re-claim returns `applied: false` and leaves the new claim alone
- [ ] A claim past the timeout is claimed again, and becomes `FAILED` once attempts run out
- [ ] A message from an older digest is never claimed
- [ ] `sms_enabled: false` returns no messages and leaves `PENDING` alone
- [ ] Each call updates `worker_last_seen_at`, and `settings.updated_at` doesn't change

## Acceptance Criteria

- Both endpoints behave as documented, and all manual checks pass
- No route is reachable without the token
- No real `WORKER_API_TOKEN` is committed
- @context/database-schema.md matches the implemented flow
- `npm` lint, test and build pass
