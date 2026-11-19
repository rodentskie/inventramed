# 18 — SMS Worker and Consumer

## Overview

Adapt the two Go apps brought over from another project, `apps/worker` and `apps/consumer`, and the shared libraries `libs/go/mq` and `libs/go/gsm`, so InventraMed can send its daily expiry SMS through RabbitMQ.

```
┌───────────────────────── Server (local network) ─────────────────────────┐
│                                                                          │
│  Next.js app ◄──HTTP── worker/retry ──publish──► RabbitMQ  [sms.send]    │
│  (apps/app)  ◄──HTTP── worker/success ◄─consume── RabbitMQ [sms.success] │
│                                                                          │
└──────────────────────────────────────────────▲───────────────┬───────────┘
                                               │ publish       │ consume
                                     ┌─────────┴───────────────▼─────────┐
                                     │ Raspberry Pi 3 Model B            │
                                     │  consumer ──AT commands──► GSM    │
                                     └───────────────────────────────────┘
```

- **worker/retry** runs on the server. On each tick it calls `POST /api/worker/sms/claim` and publishes every claimed message to `sms.send`.
- **consumer** runs on the Pi. It sends each message from `sms.send` through the USB GSM module, then publishes the result to `sms.success`.
- **worker/success** runs on the server. It consumes `sms.success` and calls `POST /api/worker/sms/:id/result`.

The worker never touches the database. The Next.js app keeps every rule from @context/features/08-sms-worker-api.spec.md: daily digest generation, claiming, retry backoff, `FAILED` after `sms_max_attempts`, the stale-result guard and the heartbeat. The Pi and the server are on the same local network, so the Pi connects to RabbitMQ directly.

Each digest goes out as **one single-part SMS**. There is no PDU or multipart mode. The default `sms_max_items` drops from 10 to 1, so a typical digest fits in 160 GSM-7 characters.

## Goals

- A digest queued in `sms_messages` reaches each recipient as one SMS, and its result is recorded in `sms_attempts`
- The Go apps hold no copy of the SMS business rules, and call only the two existing worker endpoints
- A message never sits in RabbitMQ past its claim timeout, so a re-claim can't stack copies
- Attempts aren't used up while the Pi consumer is offline
- A modem that is briefly busy or erroring doesn't turn a message into a failed attempt
- A dropped RabbitMQ connection makes the process exit so systemd restarts it, instead of leaving it running idle
- A body that can't go out as one GSM-7 SMS is reported as a failed attempt with a clear error, without reaching the modem
- `go vet` and `go test` pass for all four Go projects, and the app's lint, test and build pass

## Out of Scope

- PDU mode, multipart (concatenated) SMS and UCS-2 bodies
- Reconnecting to RabbitMQ in-process. The process exits, and systemd restarts it.
- Dead-letter queues and a RabbitMQ admin UI beyond the management plugin already in the image
- Delivery reports (`+CDS`) from the network
- Running the Go apps in Docker. The worker runs as binaries, and the consumer runs on the Pi under systemd.
- Monitoring screens for the SMS outbox

---

## Current state

Checked in the code on 2026-11-19.

### Go apps as imported

| Piece                     | Behavior today                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------- |
| `worker/cmd/retry`        | gorm reads `messages WHERE status = 'failed'` and `settings.retry_limit`, republishes, and bumps `retry_count` or sets `exhausted` |
| `worker/cmd/success`      | Consumes `{id, status}` and writes `messages.status` through gorm. Nacks with requeue on any error. |
| `consumer`                | Consumes `{id, to, body}`, sends through the GSM pool, and publishes `{id, status: "sent" \| "failed"}` |
| `libs/go/mq`              | Publisher and consumer on the default exchange. No prefetch, TTL, consumer count or close notification. |
| `libs/go/gsm`             | SIM800C in text mode (`AT+CMGF=1`, `AT+CSCS="GSM"`). `SendSMS` returns only an error.              |
| Nx                        | `@nx-go/nx-go` infers `build`, `serve`, `test` and `lint`. `worker` adds `dev.retry` and `dev.success`. |

All four projects build, vet and test cleanly under `go.work`.

### App side already in place

| Area           | Where                                     | Behavior                                                                                   |
| -------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| Claim          | `POST /api/worker/sms/claim`              | Runs `generateDailyNotification()`, fails exhausted timed-out claims, and claims up to `sms_batch_size` from the latest digest. Returns `{ pollIntervalSecs, messages: [{ id, phoneNumber, body, attempt }] }`. |
| Result         | `POST /api/worker/sms/:id/result`         | Takes `{ attempt, success, error?, modemResponse? }`. Returns `{ id, status, applied }`, with `applied: false` for a stale or repeated result. |
| Auth           | `requireWorkerToken`                      | `Authorization: Bearer $WORKER_API_TOKEN`, 401 otherwise                                   |
| Heartbeat      | `recordWorkerHeartbeat()`                 | Both endpoints set `settings.worker_last_seen_at`                                           |
| SMS preview    | `src/lib/sms-preview.ts`, settings form   | Counts GSM-7 and UCS-2 characters and parts for the template                               |
| `sms_max_items`| init migration                            | `DEFAULT 10`, `CHECK (sms_max_items > 0)`                                                    |

### Facts that affect this feature

- With the default template and 1 item, the sample digest is about 135 GSM-7 characters. With 2 items it's about 180, which needs two parts.
- In text mode, a body over 160 characters is rejected or cut off by the module, and characters outside GSM-7 are garbled
- `\x1A` (Ctrl-Z) ends the body and `\x1B` (ESC) cancels the send in text mode
- A claim sets `SENDING`. After `sms_claim_timeout_minutes` (default 10), the next claim takes the message again. A copy still in RabbitMQ from the earlier claim would then be sent as well.
- After any send error, `Module.Status` stays `error` until the next 30-second health check, so `Pool.Send` fails right away for every message in that window
- With no prefetch limit, RabbitMQ pushes the whole queue to the consumer at once
- When the AMQP connection drops, the deliveries channel closes, the handler goroutine ends and the process keeps running doing nothing
- RabbitMQ's `guest` user can only connect from localhost, so the Pi needs its own user

---

## Decisions

| Topic                    | Decision                                                                                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data access              | The worker calls the two worker endpoints over HTTP. gorm, the repository and `DATABASE_URL` are removed.                                                     |
| Single SMS               | One part only. Default `sms_max_items` becomes 1. The consumer refuses a body that isn't single-part GSM-7.                                                    |
| `sms_max_items` default  | New migration: `ALTER COLUMN sms_max_items SET DEFAULT 1`, and `UPDATE settings SET sms_max_items = 1 WHERE id = 1 AND sms_max_items = 10`, so an admin's own value is kept. `schema.prisma` default changes to match. |
| Claim timeout to worker  | Add `claimTimeoutSecs` to the claim response (`SmsClaim`). Additive, so it doesn't break anything. The worker uses it for the message TTL.                    |
| Message TTL              | Each `sms.send` message gets `Expiration = max(claimTimeoutSecs − 60, 30)` seconds. The margin leaves time for the send and the report before a re-claim.      |
| Consumer offline         | Before claiming, the worker checks the `sms.send` consumer count with a passive declare. At 0 it skips the claim, so no attempts are used and the heartbeat stops, which makes the app's worker-offline warning mean "the Pi is down". |
| Digest while Pi is down  | It's still generated when anyone loads notifications in the app. The SMS for that day waits in `PENDING` until the Pi is back.                                 |
| Poll interval            | The worker waits `pollIntervalSecs` from the last claim response. `WORKER_POLL_INTERVAL` (default `30s`) is used before the first claim and while claims are skipped. |
| Overlapping ticks        | Keep the `TryLock` guard in the retry service                                                                                                                    |
| Queue payloads           | camelCase JSON, matching the API. `sms.send`: `{ id, phoneNumber, body, attempt }`. `sms.success`: `{ id, attempt, success, error?, modemResponse? }`.           |
| Result errors            | `success` acks after a 2xx (including `applied: false`). It drops 400 and 404 with an error log (`Nack`, no requeue). It requeues everything else (401, 5xx, network errors) after a 5-second delay, so a wrong token or an outage doesn't lose results. |
| No modem available       | The consumer waits 5 seconds and Nacks with requeue. It doesn't report a failure, so no attempt is used.                                                         |
| Body check               | Before sending, the consumer reports `success: false` with `error: "body is not a single GSM-7 SMS (N chars)"` or `"body contains control characters"`. The server's normal retry then moves it to `FAILED`. |
| Prefetch                 | `Qos(1)` on both consumers                                                                                                                                        |
| Modem response           | `gsm.Device.SendSMS` returns `(string, error)`. The string is the `+CMGS: <ref>` line, sent as `modemResponse`.                                                 |
| Connection loss          | `libs/go/mq` exposes a close-notification channel. Each `main` exits with status 1 when the connection or channel closes, and systemd restarts it.            |
| Shutdown                 | On SIGINT or SIGTERM, stop taking deliveries, wait for the in-flight message to finish (up to 60 seconds), then close                                           |
| HTTP client              | `net/http` with a 30-second timeout and a bearer token. Base URL from `APP_URL`.                                                                                 |
| Pi build                 | `rasp.build` target: `GOOS=linux GOARCH=arm GOARM=7`, output in `dist/consumer`                                                                                    |
| RabbitMQ user            | `compose.yml` sets `RABBITMQ_DEFAULT_USER` and `RABBITMQ_DEFAULT_PASS`, and both apps use them in `RABBITMQ_URL`                                                 |

---

## Changes

### `libs/go/mq`

- `Publisher.Publish(ctx, body, opts ...PublishOption)` with `WithExpiration(time.Duration)`. It sets `amqp.Publishing.Expiration` in milliseconds.
- `Publisher.ConsumerCount(queue string) (int, error)` using `QueueDeclarePassive`
- `Consumer` calls `channel.Qos(prefetch, 0, false)`. `NewConsumer(url, queue, prefetch int)`.
- `Publisher.Closed()` and `Consumer.Closed()` return a channel that receives when the connection or channel closes (`NotifyClose`)
- Queue names stay `sms.send` and `sms.success`

### `libs/go/gsm`

- `SendSMS(number, message string) (string, error)`. It returns the `+CMGS:` line, or an empty string.
- `GSM7Length(body string) (chars int, valid bool)` mirrors `sms-preview.ts`: basic table counts 1, extended table counts 2, and any other character makes it invalid. `SINGLE_SMS_LIMIT = 160`.
- `SendSMS` waits for the final `OK` after `+CMGS:` and matches error lines whole, so an echoed body can't end the wait early
- `HasControlChars(body string) bool` is true for `\x1A` or `\x1B`

### `apps/consumer`

- `domain.MessageEvent{ ID, PhoneNumber, Body, Attempt }` and `domain.SendResult{ ID, Attempt, Success, Error, ModemResponse }`
- `Pool.Send` returns the modem response and a sentinel `ErrNoIdleModule`. The service requeues on `ErrNoIdleModule` instead of reporting a failure.
- The service checks the body before sending (Body check above)
- `main` listens on `Closed()` and the signal channel, and waits for the handler before closing
- `project.json` gets a `rasp.build` target. The README uses `TASK=rasp.build APP=consumer npm run task` and the `npm` commands this repo uses.
- `.env.example`: `RABBITMQ_URL=amqp://inventramed:<password>@<server-ip>:5672/`, `GSM_PORTS=/dev/ttyUSB0`

### `apps/worker`

- Remove `internal/repository`, gorm, the gorm postgres driver, `google/uuid`, `DATABASE_URL`, and the old `Message`/`Settings` domain types
- Add `internal/api`: a client with `Claim(ctx) (Claim, error)` and `Result(ctx, id, SendResult) (ResultResponse, error)`. A non-2xx response returns an `*api.Error` with the status code.
- `retry` service: check the consumer count, claim, then publish each message with the TTL. If a publish fails, log it and continue. That message's claim times out and it's claimed again later.
- `retry` main: a timer reset to the interval from each claim, instead of a fixed ticker
- `success` service: decode, call `Result`, then ack, drop or requeue as described under Result errors
- `.env.example`: `APP_URL=http://localhost:3000`, `WORKER_API_TOKEN=`, `RABBITMQ_URL=amqp://inventramed:<password>@localhost:5672/`, `WORKER_POLL_INTERVAL=30s`

### `apps/app`

- `SmsClaim` gets `claimTimeoutSecs` (`settings.smsClaimTimeoutMinutes * 60`), filled in `claimSmsMessages()` on both return paths
- Migration `sms_max_items_default_1` and the `schema.prisma` default, as described in Decisions
- The settings form's `smsMaxItems` help text says that more than 1 item usually needs more than one SMS, which the GSM module can't send

### Repository

- `compose.yml`: RabbitMQ credentials from `RABBITMQ_DEFAULT_USER` and `RABBITMQ_DEFAULT_PASS`, with defaults for local development
- `README.md`: a Go section covering the worker and consumer env, `dev.retry` and `dev.success`, the consumer `rasp.build`, and systemd units for the three processes
- `context/project-overview.md` and `context/database-schema.md`: replace "the Pi polls the server over HTTP" with the worker → RabbitMQ → consumer flow, and close the Long SMS open question with the single-SMS decision

---

## Tests

### Go

| Package                    | Cases                                                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `libs/go/gsm`              | `GSM7Length`: extended characters count 2, `ñ` valid, an emoji invalid. `HasControlChars`. `+CMGS` parsing.        |
| `worker/internal/api`      | Sends the bearer token, decodes claim and result, maps a non-2xx response to `*api.Error` (`httptest.Server`)      |
| `worker/service/retry`     | Skips the claim with 0 consumers; publishes each message with the TTL; uses the minimum TTL; one failed publish doesn't stop the rest; overlapping runs skip |
| `worker/service/success`   | Acks on 2xx and on `applied: false`; drops on 400/404; requeues on 401, 5xx and network errors; drops bad JSON        |
| `consumer/service/message` | Reports success with the modem ref; reports failure with the error; requeues on `ErrNoIdleModule`; rejects a long or non-GSM body without sending; passes `attempt` through |

The service tests use interfaces for the pool, publisher and API client, so no RabbitMQ, modem or server is needed.

### App

- `claimSmsMessages()` returns `claimTimeoutSecs`, including when SMS is disabled
- `prisma migrate status` is in sync after the new migration

### Manual

1. `docker compose up -d`, the app, `dev.retry`, `dev.success`, and the consumer with a GSM module
2. Create a near-expiry batch and an SMS recipient, then wait for the claim. The SMS arrives, the message is `SENT`, and `sms_attempts.modem_response` holds the `+CMGS` ref.
3. Stop the consumer. The worker logs skipped claims, the message stays `PENDING`, and the settings page shows the worker as offline.
4. Pull the SIM. The attempt is `FAILED` with the modem error, and the message goes back to `PENDING` with a backoff.
5. Stop RabbitMQ. All three processes exit with status 1.

---

## Open questions

- **Pi OS architecture:** `rasp.build` assumes 32-bit DietPi (`GOARCH=arm GOARM=7`). Switch to `GOARCH=arm64` if the Pi runs the 64-bit image.
