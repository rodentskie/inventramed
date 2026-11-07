import 'server-only';
import type { Prisma } from '@/generated/prisma/client';
import { notFound } from '@/lib/api-response';
import { generateDailyNotification } from '@/lib/notifications';
import { prisma } from '@/lib/prisma';
import { getSettings } from '@/lib/settings';
import type { SmsResultInput } from '@/lib/validations/sms';
import type { Settings } from '@/types/settings';
import type {
  ClaimedSmsMessage,
  SmsClaim,
  SmsResult,
  SmsStatus,
} from '@/types/sms';

const MS_PER_MINUTE = 60_000;

interface ClaimedRow {
  id: string;
  phone_number: string;
  body: string;
  attempts: number;
}

interface LockedRow {
  id: string;
  status: SmsStatus;
  attempts: number;
}

/** Raw SQL, because `@updatedAt` would make each heartbeat look like an admin edit. */
export async function recordWorkerHeartbeat(): Promise<void> {
  await prisma.$executeRaw`UPDATE settings SET worker_last_seen_at = now() WHERE id = 1`;
}

/** Only `/result` could otherwise set `FAILED`, so a worker that keeps dying would retry forever. */
async function failExhaustedClaims(settings: Settings): Promise<void> {
  await prisma.$executeRaw`
    UPDATE sms_messages
       SET status = 'FAILED', last_error = 'Claim timed out', updated_at = now()
     WHERE status = 'SENDING'
       AND claimed_at < now() - make_interval(mins => ${settings.smsClaimTimeoutMinutes})
       AND attempts >= ${settings.smsMaxAttempts}`;
}

/**
 * The CTE keeps the claim to the batch size, because PostgreSQL can re-run an
 * `IN (SELECT ... LIMIT n)` subquery. Older digests are skipped, since a message
 * that failed before a newer digest would otherwise send a stale list.
 */
async function claimBatch(settings: Settings): Promise<ClaimedSmsMessage[]> {
  const rows = await prisma.$queryRaw<ClaimedRow[]>`
    WITH picked AS (
      SELECT id FROM sms_messages
       WHERE notification_id = (SELECT id FROM notifications ORDER BY notification_date DESC LIMIT 1)
         AND ((status = 'PENDING' AND next_attempt_at <= now())
           OR (status = 'SENDING' AND claimed_at < now() - make_interval(mins => ${settings.smsClaimTimeoutMinutes})))
       ORDER BY created_at
       LIMIT ${settings.smsBatchSize}
       FOR UPDATE SKIP LOCKED
    )
    UPDATE sms_messages m
       SET status = 'SENDING', claimed_at = now(), attempts = m.attempts + 1, updated_at = now()
      FROM picked
     WHERE m.id = picked.id
    RETURNING m.id, m.phone_number, m.body, m.attempts`;

  return rows.map((row) => ({
    id: row.id,
    phoneNumber: row.phone_number,
    body: row.body,
    attempt: row.attempts,
  }));
}

export async function claimSmsMessages(): Promise<SmsClaim> {
  await generateDailyNotification();

  const settings = await getSettings();
  const pollIntervalSecs = settings.workerPollIntervalSecs;
  if (!settings.smsEnabled) {
    return { pollIntervalSecs, messages: [] };
  }

  await failExhaustedClaims(settings);
  return { pollIntervalSecs, messages: await claimBatch(settings) };
}

function nextState(
  input: SmsResultInput,
  attempts: number,
  settings: Settings,
  now: Date,
): Prisma.SmsMessageUpdateInput & { status: SmsStatus } {
  if (input.success) {
    return { status: 'SENT', sentAt: now };
  }
  // Prisma skips `undefined`, which would leave the error from an earlier attempt.
  const lastError = input.error ?? null;
  if (attempts >= settings.smsMaxAttempts) {
    return { status: 'FAILED', lastError };
  }
  return {
    status: 'PENDING',
    lastError,
    nextAttemptAt: new Date(
      now.getTime() + settings.smsRetryDelayMinutes * MS_PER_MINUTE,
    ),
  };
}

/**
 * The lock serializes results for a message, so matching `attempt` against the
 * row is enough to ignore a repeated result or one from an earlier claim.
 */
export async function recordSmsResult(
  id: string,
  input: SmsResultInput,
  now: Date = new Date(),
): Promise<SmsResult> {
  const settings = await getSettings();

  return prisma.$transaction(async (tx) => {
    const [message] = await tx.$queryRaw<LockedRow[]>`
      SELECT id, status, attempts FROM sms_messages WHERE id = ${id}::uuid FOR UPDATE`;
    if (!message) {
      throw notFound();
    }
    if (message.status !== 'SENDING' || message.attempts !== input.attempt) {
      return { id, status: message.status, applied: false };
    }

    await tx.smsAttempt.create({
      data: {
        smsMessageId: id,
        attemptNo: input.attempt,
        result: input.success ? 'SENT' : 'FAILED',
        error: input.error,
        modemResponse: input.modemResponse,
      },
    });

    const data = nextState(input, message.attempts, settings, now);
    await tx.smsMessage.update({ where: { id }, data });
    return { id, status: data.status, applied: true };
  });
}
