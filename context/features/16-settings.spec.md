# 16 — Settings Page

## Overview

Add a settings page where an admin edits the single `settings` row: the facility name, timezone, near-expiry threshold and daily digest time, the SMS template, and the Raspberry Pi worker's retry and polling options. It also shows the worker's last check-in.

The layout follows the design reference most closely of any page: grouped form sections under headings, each field with muted help text.

It needs no schema change, migration or new API route.

## Goals

- `/settings` shows every editable setting, grouped into General, Expiry alerts, SMS and Worker
- Saving sends only changed fields and shows field errors from the server
- The SMS template has a live preview with sample items and a character count
- The worker's last check-in and online state are shown, read-only
- The Settings nav item is enabled
- Lint, test and build pass

## Out of Scope

- Sending a test SMS. It would need a new outbox path and worker support.
- A settings change history. `settings` has no audit trigger; only `updatedBy` and `updatedAt` are kept.
- Per-user preferences, such as notification opt-outs
- Resetting to defaults

---

## Current state

Checked in the code on 2026-11-08.

### Already in place

| Area        | Where                                 | Behavior                                                                      |
| ----------- | ------------------------------------- | ----------------------------------------------------------------------------- |
| Read        | `getSettings()`                       | Every field, plus `workerLastSeenAt`, `updatedBy` and `updatedAt`              |
| Update      | `updateSettings(actorId, input)`      | Sets `updatedBy`. `workerLastSeenAt` isn't writable.                           |
| Validation  | `src/lib/validations/settings.ts`     | Strict schema with limits, `HH:mm` times, IANA timezones only, known template placeholders |
| SMS body    | `src/lib/sms-body.ts`                 | `renderSmsBody` and `formatSmsItems`, with no server-only imports, so they run in the browser |
| Worker      | `getWorkerStatus()` in `src/lib/dashboard.ts` | `{ smsEnabled, lastSeenAt, online }`                                   |
| Plumbing    | Earlier features                      | `requirePageUser`, `runAction`, `switch` and `native-select` snippets         |

### Facts that affect this feature

| Field                     | Limits                       | Effect of a change                                                     |
| ------------------------- | ---------------------------- | ---------------------------------------------------------------------- |
| `timezone`                | IANA name                    | Moves "today" for expiry math and the digest                           |
| `nearExpiryThresholdDays` | 1–3650                       | Live statuses change at once; existing digests keep their snapshot    |
| `dailyNotificationTime`   | `HH:mm`                      | Takes effect from the next day without a digest                        |
| `smsEnabled`              | boolean                      | Off: the worker claims nothing, and `PENDING` messages wait            |
| `smsMaxItems`             | 1–100                        | Fewer items keeps an SMS under 160 characters on modules without multipart support |
| `smsTemplate`             | 1–1000 characters, known placeholders only | Applies to digests made after the change                 |
| Worker fields             | See the schema               | Picked up by the worker on its next claim                              |

---

## Decisions

| Topic               | Decision                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| One form            | A single form with one Save button at the bottom, so related changes save together. Sections are headings, not separate forms.     |
| Changed fields only | The client compares with the loaded values and sends only differences. Save is disabled when nothing changed.                    |
| Timezone            | A searchable select of `Intl.supportedValuesOf('timeZone')`, which only lists IANA names                                         |
| Time                | `<input type="time">`, which already gives `HH:mm`                                                                                |
| Template preview    | Rendered in the browser with `renderSmsBody` and `formatSmsItems` on three fixed sample items, updating as the user types. Shows the character count and `1 SMS` or `{n} SMS parts`, using 160 / 153 characters per part. |
| Placeholder help    | Clickable chips for `{facility}`, `{date}`, `{expired}`, `{near_expiry}` and `{items}` that insert at the cursor                  |
| Explaining effects  | Each field's help text says when the change applies, from the table above                                                        |
| Last edit           | `Last changed by {username}, {relative time}` under the title                                                                    |
| Unsaved changes     | A `beforeunload` prompt while the form has unsaved changes. In-app navigation isn't intercepted.                                  |

---

## UI

### `/settings`

Requires `settings:manage`.

```
 Settings
 ─────────────────────────────────────────────────────────────────────
 Last changed by admin, 2 d ago

 General
   Facility name        [ InventraMed            ]
                        Used as the sender label in SMS alerts.
   Timezone             [ Asia/Manila          ▾ ]
                        Defines "today" for expiry dates and the daily digest.

 Expiry alerts
   Near-expiry threshold [ 30 ] days
                        Batches expiring within this many days are near expiry.
   Daily digest time    [ 08:00 ]
                        The digest is created at or after this local time.

 SMS
   [x] Send SMS alerts
   Template             [ {facility} expiry alert {date}: …            ]
                        {facility} {date} {expired} {near_expiry} {items}
   Items per SMS        [ 10 ]
   Preview              InventraMed expiry alert 2026-11-08: 1 expired, 2 near expiry.
                        Amoxicillin 500 mg B#A123 exp 2026-11-01 (-7d)
                        …
                        142 characters · 1 SMS

 Worker
   Status               ● Online · last seen 3 min ago
   Poll interval        [ 300 ] seconds
   Messages per claim   [ 10 ]
   Max attempts         [ 3 ]
   Retry delay          [ 15 ] minutes
   Claim timeout        [ 10 ] minutes

                                                        [ Save changes ]
```

- Section headings and help text match the reference: `semibold` label, `fg.muted` help under the input
- Inputs are a fixed width (`md`), not full width, like the reference
- Worker status uses `Status`: green online, red offline, grey `SMS is off`
- Success toast: `Settings saved`. Field errors appear under each field.
- Page title: `Settings | InventraMed`

---

## Implementation

### Files

All paths are relative to `apps/app/`.

| File                                          | Change                                                                       |
| --------------------------------------------- | ---------------------------------------------------------------------------- |
| `src/actions/settings.ts`                     | New. `updateSettingsAction(input)`, requiring `settings:manage`, revalidating `/settings` and `/` |
| `src/app/(app)/settings/page.tsx`             | New. Loads settings and worker status                                        |
| `src/components/settings/SettingsForm.tsx`    | New. `'use client'`. The form, diffing and submit                            |
| `src/components/settings/SmsTemplateField.tsx` | New. `'use client'`. Textarea, chips and preview                            |
| `src/components/settings/TimezoneSelect.tsx`  | New. `'use client'`                                                          |
| `src/lib/sms-preview.ts`                      | New. Sample items and `countSmsParts(text)`                                  |
| `src/lib/settings-diff.ts`                    | New. `diffSettings(initial, current)` returning only changed editable fields |
| `src/lib/navigation.ts`                       | Enable Settings                                                              |

`countSmsParts` treats the text as GSM-7, at 160 characters for one part and 153 per part after that. Characters outside GSM-7 force UCS-2, at 70 and 67, and the preview says so.

### Chakra snippets

```bash
npx @chakra-ui/cli snippet add combobox --outdir libs/components/src/ui
```

`Textarea` and `NumberInput` come from `@chakra-ui/react`.

---

## Testing

- `diffSettings`: no change, one change, numbers from inputs compared as numbers, read-only fields never included
- `countSmsParts`: 0, 160, 161, 306, 307 characters, and a non-GSM character switching to UCS-2 limits
- The action: permission, field errors passed through, revalidation
- `SettingsForm`: Save disabled with no changes, sends only changed fields, field errors shown, `beforeunload` registered only while dirty
- `SmsTemplateField`: chip inserts at the cursor, preview updates, unknown placeholder shown as an error by the server response
- Page: permission redirect, last-changed line, worker status states

Manual checks:

- [ ] Changing the threshold changes batch statuses on the medicine pages and dashboard at once
- [ ] An unknown placeholder like `{name}` is rejected with the server's message
- [ ] The preview's part count matches what the worker sends for the same digest
- [ ] Turning SMS off stops the worker claiming messages, and the dashboard says SMS is off
- [ ] The worker picks up a new poll interval on its next claim
- [ ] A UTC offset can't be chosen as a timezone
- [ ] `staff` and `collaborator` don't see the nav item, and `/settings` redirects them to `/`

## Acceptance Criteria

- All goals are met and all manual checks pass
- Only changed fields are sent, and `workerLastSeenAt` is never written from the UI
- `npm` lint, test and build pass
