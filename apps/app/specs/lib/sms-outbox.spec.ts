/** @jest-environment node */
import { ApiError } from '../../src/lib/api-response';
import { generateDailyNotification } from '../../src/lib/notifications';
import { prisma } from '../../src/lib/prisma';
import { getSettings } from '../../src/lib/settings';
import {
  claimSmsMessages,
  recordSmsResult,
  recordWorkerHeartbeat,
} from '../../src/lib/sms-outbox';

jest.mock('@/lib/settings', () => ({ getSettings: jest.fn() }));
jest.mock('@/lib/notifications', () => ({
  generateDailyNotification: jest.fn(),
}));
jest.mock('@/lib/prisma', () => {
  const tx = {
    $queryRaw: jest.fn(),
    smsAttempt: { create: jest.fn() },
    smsMessage: { update: jest.fn() },
  };
  return {
    prisma: {
      tx,
      $transaction: jest.fn(),
      $executeRaw: jest.fn(),
      $queryRaw: jest.fn(),
      setting: { update: jest.fn() },
    },
  };
});

const mockedPrisma = prisma as unknown as {
  tx: {
    $queryRaw: jest.Mock;
    smsAttempt: { create: jest.Mock };
    smsMessage: { update: jest.Mock };
  };
  $transaction: jest.Mock;
  $executeRaw: jest.Mock;
  $queryRaw: jest.Mock;
  setting: { update: jest.Mock };
};
const { tx } = mockedPrisma;
const settingsMock = getSettings as jest.Mock;
const generateMock = generateDailyNotification as jest.Mock;

const ID = '3f2b7c1e-8a4d-4e6f-9b1a-2c3d4e5f6a7b';
const NOW = new Date('2026-11-05T01:00:00.000Z');

const settings = {
  smsEnabled: true,
  smsMaxAttempts: 3,
  smsRetryDelayMinutes: 15,
  smsClaimTimeoutMinutes: 10,
  smsBatchSize: 5,
  workerPollIntervalSecs: 300,
};

const sqlOf = (mock: jest.Mock, call = 0) =>
  (mock.mock.calls[call][0] as string[]).join('?').replace(/\s+/g, ' ');

describe('sms outbox', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    settingsMock.mockResolvedValue(settings);
    mockedPrisma.$queryRaw.mockResolvedValue([]);
    mockedPrisma.$transaction.mockImplementation((fn) => fn(tx));
  });

  describe('recordWorkerHeartbeat', () => {
    it('updates only worker_last_seen_at, so updated_at is unchanged', async () => {
      await recordWorkerHeartbeat();

      expect(sqlOf(mockedPrisma.$executeRaw)).toBe(
        'UPDATE settings SET worker_last_seen_at = now() WHERE id = 1',
      );
      expect(mockedPrisma.setting.update).not.toHaveBeenCalled();
    });
  });

  describe('claimSmsMessages', () => {
    it('generates the digest, gives up on exhausted claims, then claims', async () => {
      const order: string[] = [];
      generateMock.mockImplementation(async () => order.push('generate'));
      mockedPrisma.$executeRaw.mockImplementation(async () =>
        order.push('fail'),
      );
      mockedPrisma.$queryRaw.mockImplementation(async () => {
        order.push('claim');
        return [];
      });

      await claimSmsMessages();

      expect(order).toEqual(['generate', 'fail', 'claim']);
    });

    it('maps the claimed rows and returns the poll interval', async () => {
      mockedPrisma.$queryRaw.mockResolvedValue([
        { id: ID, phone_number: '+639171234567', body: 'Alert', attempts: 2 },
      ]);

      await expect(claimSmsMessages()).resolves.toEqual({
        pollIntervalSecs: 300,
        messages: [
          { id: ID, phoneNumber: '+639171234567', body: 'Alert', attempt: 2 },
        ],
      });
    });

    it('fails timed-out messages that used all their attempts', async () => {
      await claimSmsMessages();

      expect(sqlOf(mockedPrisma.$executeRaw)).toContain("status = 'FAILED'");
      expect(mockedPrisma.$executeRaw.mock.calls[0].slice(1)).toEqual([10, 3]);
    });

    it('limits the claim to the latest digest and the batch size', async () => {
      await claimSmsMessages();

      const sql = sqlOf(mockedPrisma.$queryRaw);
      expect(sql).toContain(
        'notification_id = (SELECT id FROM notifications ORDER BY notification_date DESC LIMIT 1)',
      );
      expect(sql).toContain('FOR UPDATE SKIP LOCKED');
      expect(mockedPrisma.$queryRaw.mock.calls[0].slice(1)).toEqual([10, 5]);
    });

    it('still generates the digest but claims nothing when SMS is disabled', async () => {
      settingsMock.mockResolvedValue({ ...settings, smsEnabled: false });

      await expect(claimSmsMessages()).resolves.toEqual({
        pollIntervalSecs: 300,
        messages: [],
      });
      expect(generateMock).toHaveBeenCalled();
      expect(mockedPrisma.$executeRaw).not.toHaveBeenCalled();
      expect(mockedPrisma.$queryRaw).not.toHaveBeenCalled();
    });
  });

  describe('recordSmsResult', () => {
    const lock = (status: string, attempts: number) =>
      tx.$queryRaw.mockResolvedValue([{ id: ID, status, attempts }]);

    it('sets SENT and sent_at on success', async () => {
      lock('SENDING', 1);

      await expect(
        recordSmsResult(
          ID,
          { attempt: 1, success: true, modemResponse: '+CMGS: 42' },
          NOW,
        ),
      ).resolves.toEqual({ id: ID, status: 'SENT', applied: true });

      expect(tx.smsAttempt.create).toHaveBeenCalledWith({
        data: {
          smsMessageId: ID,
          attemptNo: 1,
          result: 'SENT',
          error: undefined,
          modemResponse: '+CMGS: 42',
        },
      });
      expect(tx.smsMessage.update).toHaveBeenCalledWith({
        where: { id: ID },
        data: { status: 'SENT', sentAt: NOW },
      });
    });

    it('returns to PENDING with a backoff while attempts remain', async () => {
      lock('SENDING', 2);

      await expect(
        recordSmsResult(
          ID,
          { attempt: 2, success: false, error: 'No signal' },
          NOW,
        ),
      ).resolves.toEqual({ id: ID, status: 'PENDING', applied: true });

      expect(tx.smsAttempt.create.mock.calls[0][0].data).toMatchObject({
        attemptNo: 2,
        result: 'FAILED',
        error: 'No signal',
      });
      expect(tx.smsMessage.update).toHaveBeenCalledWith({
        where: { id: ID },
        data: {
          status: 'PENDING',
          lastError: 'No signal',
          nextAttemptAt: new Date('2026-11-05T01:15:00.000Z'),
        },
      });
    });

    it('sets FAILED on a failure that uses the last attempt', async () => {
      lock('SENDING', 3);

      await expect(
        recordSmsResult(
          ID,
          { attempt: 3, success: false, error: 'No signal' },
          NOW,
        ),
      ).resolves.toEqual({ id: ID, status: 'FAILED', applied: true });

      expect(tx.smsMessage.update).toHaveBeenCalledWith({
        where: { id: ID },
        data: { status: 'FAILED', lastError: 'No signal' },
      });
    });

    it.each([
      ['PENDING', 2],
      ['FAILED', 3],
    ])(
      'clears the earlier error when a failure sets %s without one',
      async (status, attempt) => {
        lock('SENDING', attempt);

        await recordSmsResult(ID, { attempt, success: false }, NOW);

        expect(tx.smsMessage.update.mock.calls[0][0].data).toMatchObject({
          status,
          lastError: null,
        });
      },
    );

    it.each([
      ['a repeated result', 'SENT', 1],
      ['a result after a failure requeued it', 'PENDING', 1],
      ['a result for a cancelled message', 'CANCELLED', 1],
      ['a late result after a re-claim', 'SENDING', 2],
    ])('ignores %s', async (_name, status, attempts) => {
      lock(status, attempts);

      await expect(
        recordSmsResult(ID, { attempt: 1, success: true }, NOW),
      ).resolves.toEqual({ id: ID, status, applied: false });

      expect(tx.smsAttempt.create).not.toHaveBeenCalled();
      expect(tx.smsMessage.update).not.toHaveBeenCalled();
    });

    it('locks the row and throws 404 when the message does not exist', async () => {
      tx.$queryRaw.mockResolvedValue([]);

      const error = await recordSmsResult(
        ID,
        { attempt: 1, success: true },
        NOW,
      ).catch((e: unknown) => e);

      expect(sqlOf(tx.$queryRaw)).toContain('FOR UPDATE');
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ status: 404, code: 'NOT_FOUND' });
    });
  });
});
