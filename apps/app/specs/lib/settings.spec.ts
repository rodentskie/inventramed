/** @jest-environment node */
import { prisma } from '../../src/lib/prisma';
import { getSettings, updateSettings } from '../../src/lib/settings';

jest.mock('@/lib/prisma', () => ({
  prisma: {
    setting: { findUniqueOrThrow: jest.fn(), update: jest.fn() },
  },
}));

const ACTOR_ID = 'actor-user';
const AT = new Date('2026-11-06T02:00:00.000Z');

const row = {
  facilityName: 'InventraMed',
  timezone: 'Asia/Manila',
  nearExpiryThresholdDays: 30,
  dailyNotificationTime: '08:00',
  smsEnabled: true,
  smsMaxAttempts: 3,
  smsRetryDelayMinutes: 15,
  smsClaimTimeoutMinutes: 10,
  smsBatchSize: 10,
  smsMaxItems: 10,
  workerPollIntervalSecs: 300,
  smsTemplate: '{facility} {items}',
  workerLastSeenAt: null as Date | null,
  updatedAt: AT,
  updatedBy: null as { id: string; username: string } | null,
};

const findMock = prisma.setting.findUniqueOrThrow as jest.Mock;
const updateMock = prisma.setting.update as jest.Mock;

describe('settings', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('getSettings', () => {
    it('reads the single row and formats its dates', async () => {
      findMock.mockResolvedValue({
        ...row,
        workerLastSeenAt: AT,
        updatedBy: { id: ACTOR_ID, username: 'admin' },
      });

      await expect(getSettings()).resolves.toEqual({
        ...row,
        workerLastSeenAt: AT.toISOString(),
        updatedAt: AT.toISOString(),
        updatedBy: { id: ACTOR_ID, username: 'admin' },
      });
      expect(findMock.mock.calls[0][0].where).toEqual({ id: 1 });
    });

    it('returns null when the worker and editor are unknown', async () => {
      findMock.mockResolvedValue(row);

      await expect(getSettings()).resolves.toMatchObject({
        workerLastSeenAt: null,
        updatedBy: null,
      });
    });

    it('never selects the id or the password hash', async () => {
      findMock.mockResolvedValue(row);

      await getSettings();

      const { select } = findMock.mock.calls[0][0];
      expect(select).not.toHaveProperty('id');
      expect(select.updatedBy.select).toEqual({ id: true, username: true });
    });
  });

  describe('updateSettings', () => {
    it('writes only the given fields and sets updatedById', async () => {
      updateMock.mockResolvedValue({ ...row, smsBatchSize: 5 });

      await expect(
        updateSettings(ACTOR_ID, { smsBatchSize: 5 }),
      ).resolves.toMatchObject({ smsBatchSize: 5 });

      const { where, data } = updateMock.mock.calls[0][0];
      expect(where).toEqual({ id: 1 });
      expect(data).toEqual({ smsBatchSize: 5, updatedById: ACTOR_ID });
    });

    it('never writes workerLastSeenAt', async () => {
      updateMock.mockResolvedValue(row);

      await updateSettings(ACTOR_ID, { smsEnabled: false });

      expect(updateMock.mock.calls[0][0].data).not.toHaveProperty(
        'workerLastSeenAt',
      );
    });
  });
});
