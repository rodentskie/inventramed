/** @jest-environment node */
import { ApiError } from '../../src/lib/api-response';
import { fromDateString } from '../../src/lib/expiry';
import {
  generateDailyNotification,
  getNotification,
  listNotifications,
  markNotificationRead,
} from '../../src/lib/notifications';
import { prisma } from '../../src/lib/prisma';
import { getSettings } from '../../src/lib/settings';

jest.mock('@/lib/settings', () => ({ getSettings: jest.fn() }));
jest.mock('@/lib/prisma', () => {
  const tx = {
    notification: { createManyAndReturn: jest.fn(), update: jest.fn() },
    smsMessage: { updateMany: jest.fn(), createMany: jest.fn() },
    medicineBatch: { findMany: jest.fn() },
    notificationItem: { createMany: jest.fn() },
    employee: { findMany: jest.fn() },
  };
  return {
    prisma: {
      tx,
      $transaction: jest.fn(),
      notification: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      notificationRead: { createMany: jest.fn(), findUniqueOrThrow: jest.fn() },
    },
  };
});

const mockedPrisma = prisma as unknown as {
  tx: {
    notification: { createManyAndReturn: jest.Mock; update: jest.Mock };
    smsMessage: { updateMany: jest.Mock; createMany: jest.Mock };
    medicineBatch: { findMany: jest.Mock };
    notificationItem: { createMany: jest.Mock };
    employee: { findMany: jest.Mock };
  };
  $transaction: jest.Mock;
  notification: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
  };
  notificationRead: { createMany: jest.Mock; findUniqueOrThrow: jest.Mock };
};
const { tx } = mockedPrisma;
const settingsMock = getSettings as jest.Mock;

const USER_ID = 'user-1';
const NOTIFICATION_ID = 'notification-1';
// 09:00 on 2026-11-05 in Manila.
const AFTER_DAILY_TIME = new Date('2026-11-05T01:00:00.000Z');
// 07:59 on 2026-11-05 in Manila.
const BEFORE_DAILY_TIME = new Date('2026-11-04T23:59:00.000Z');

const settings = {
  facilityName: 'Clinic',
  timezone: 'Asia/Manila',
  nearExpiryThresholdDays: 30,
  dailyNotificationTime: '08:00',
  smsEnabled: true,
  smsClaimTimeoutMinutes: 10,
  smsMaxItems: 10,
  smsTemplate: '{facility} {date} {expired}/{near_expiry}\n{items}',
};

const batch = (id: string, expirationDate: string) => ({
  id,
  batchNumber: id.toUpperCase(),
  quantity: 5,
  expirationDate: fromDateString(expirationDate),
  medicine: { name: 'Paracetamol', strength: '500mg' },
});

describe('generateDailyNotification', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    settingsMock.mockResolvedValue(settings);
    mockedPrisma.$transaction.mockImplementation(
      (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
    );
    mockedPrisma.notification.findUnique.mockResolvedValue(null);
    tx.notification.createManyAndReturn.mockResolvedValue([
      { id: NOTIFICATION_ID },
    ]);
    tx.medicineBatch.findMany.mockResolvedValue([
      batch('a', '2026-11-03'),
      batch('b', '2026-11-05'),
      batch('c', '2026-12-05'),
    ]);
    tx.employee.findMany.mockResolvedValue([
      { id: 'employee-1', contactNumber: '+639171234567' },
      { id: 'employee-2', contactNumber: '+639171234568' },
    ]);
  });

  it('stops before the daily time without opening a transaction', async () => {
    await generateDailyNotification(BEFORE_DAILY_TIME);

    expect(mockedPrisma.notification.findUnique).not.toHaveBeenCalled();
    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('runs at exactly the daily time', async () => {
    await generateDailyNotification(new Date('2026-11-05T00:00:00.000Z'));

    expect(mockedPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('stops without a transaction when the row already exists', async () => {
    mockedPrisma.notification.findUnique.mockResolvedValue({
      id: NOTIFICATION_ID,
    });

    await generateDailyNotification(AFTER_DAILY_TIME);

    expect(mockedPrisma.notification.findUnique).toHaveBeenCalledWith({
      where: { notificationDate: fromDateString('2026-11-05') },
      select: { id: true },
    });
    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('writes nothing more when a concurrent caller inserted the row', async () => {
    tx.notification.createManyAndReturn.mockResolvedValue([]);

    await generateDailyNotification(AFTER_DAILY_TIME);

    expect(tx.notification.createManyAndReturn).toHaveBeenCalledWith({
      data: [{ notificationDate: fromDateString('2026-11-05') }],
      skipDuplicates: true,
      select: { id: true },
    });
    expect(tx.smsMessage.updateMany).not.toHaveBeenCalled();
    expect(tx.notificationItem.createMany).not.toHaveBeenCalled();
    expect(tx.smsMessage.createMany).not.toHaveBeenCalled();
  });

  it('cancels older pending and timed-out messages only', async () => {
    await generateDailyNotification(AFTER_DAILY_TIME);

    expect(tx.smsMessage.updateMany).toHaveBeenCalledWith({
      where: {
        notification: {
          notificationDate: { lt: fromDateString('2026-11-05') },
        },
        OR: [
          { status: 'PENDING' },
          {
            status: 'SENDING',
            claimedAt: { lt: new Date('2026-11-05T00:50:00.000Z') },
          },
        ],
      },
      data: { status: 'CANCELLED' },
    });
  });

  it('cancels older messages and queues nothing when there are no items', async () => {
    tx.medicineBatch.findMany.mockResolvedValue([]);

    await generateDailyNotification(AFTER_DAILY_TIME);

    expect(tx.smsMessage.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.notification.update).not.toHaveBeenCalled();
    expect(tx.smsMessage.createMany).not.toHaveBeenCalled();
  });

  it('selects in-stock batches of non-deleted medicines up to the threshold', async () => {
    await generateDailyNotification(AFTER_DAILY_TIME);

    expect(tx.medicineBatch.findMany.mock.calls[0][0].where).toEqual({
      quantity: { gt: 0 },
      expirationDate: { lte: fromDateString('2026-12-05') },
      medicine: { deletedAt: null },
    });
  });

  it('snapshots items and sets the counts', async () => {
    await generateDailyNotification(AFTER_DAILY_TIME);

    expect(tx.notificationItem.createMany.mock.calls[0][0].data).toEqual([
      {
        notificationId: NOTIFICATION_ID,
        batchId: 'a',
        status: 'EXPIRED',
        quantity: 5,
        expirationDate: fromDateString('2026-11-03'),
        daysToExpiry: -2,
      },
      expect.objectContaining({
        batchId: 'b',
        status: 'NEAR_EXPIRY',
        daysToExpiry: 0,
      }),
      expect.objectContaining({
        batchId: 'c',
        status: 'NEAR_EXPIRY',
        daysToExpiry: 30,
      }),
    ]);
    expect(tx.notification.update).toHaveBeenCalledWith({
      where: { id: NOTIFICATION_ID },
      data: { expiredCount: 1, nearExpiryCount: 2 },
    });
  });

  it('queues one rendered message per recipient', async () => {
    await generateDailyNotification(AFTER_DAILY_TIME);

    expect(tx.employee.findMany.mock.calls[0][0].where).toEqual({
      isActive: true,
      deletedAt: null,
      receivesSmsAlerts: true,
    });
    const { data } = tx.smsMessage.createMany.mock.calls[0][0];
    expect(data.map((row: { employeeId: string }) => row.employeeId)).toEqual([
      'employee-1',
      'employee-2',
    ]);
    expect(data[0]).toEqual({
      notificationId: NOTIFICATION_ID,
      employeeId: 'employee-1',
      phoneNumber: '+639171234567',
      body: [
        'Clinic 2026-11-05 1/2',
        'Paracetamol 500mg B#A exp 2026-11-03 (-2d)',
        'Paracetamol 500mg B#B exp 2026-11-05 (0d)',
        'Paracetamol 500mg B#C exp 2026-12-05 (30d)',
      ].join('\n'),
    });
  });

  it('skips SMS when disabled but still writes the digest', async () => {
    settingsMock.mockResolvedValue({ ...settings, smsEnabled: false });

    await generateDailyNotification(AFTER_DAILY_TIME);

    expect(tx.notificationItem.createMany).toHaveBeenCalledTimes(1);
    expect(tx.smsMessage.createMany).not.toHaveBeenCalled();
  });

  it('rejects when a write fails, so the transaction rolls back', async () => {
    tx.notificationItem.createMany.mockRejectedValue(new Error('write failed'));

    await expect(generateDailyNotification(AFTER_DAILY_TIME)).rejects.toThrow(
      'write failed',
    );
  });
});

describe('reads', () => {
  const AT = new Date('2026-11-05T01:00:00.000Z');
  const row = {
    id: NOTIFICATION_ID,
    notificationDate: fromDateString('2026-11-05'),
    expiredCount: 1,
    nearExpiryCount: 2,
    createdAt: AT,
    reads: [] as { readAt: Date }[],
  };
  const summary = {
    id: NOTIFICATION_ID,
    notificationDate: '2026-11-05',
    expiredCount: 1,
    nearExpiryCount: 2,
    isRead: false,
    createdAt: AT.toISOString(),
  };

  beforeEach(() => {
    jest.resetAllMocks();
    // Before the daily time, so listing generates nothing here.
    settingsMock.mockResolvedValue({
      ...settings,
      dailyNotificationTime: '23:59',
    });
    jest.useFakeTimers({ now: BEFORE_DAILY_TIME });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('listNotifications', () => {
    beforeEach(() => {
      mockedPrisma.$transaction.mockImplementation(
        (queries: Promise<unknown>[]) => Promise.all(queries),
      );
      mockedPrisma.notification.findMany.mockResolvedValue([
        row,
        { ...row, id: 'notification-2', reads: [{ readAt: AT }] },
      ]);
      mockedPrisma.notification.count
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(1);
    });

    it('generates first, then returns the page with read state', async () => {
      await expect(
        listNotifications(USER_ID, { page: 2, pageSize: 5 }),
      ).resolves.toEqual({
        items: [summary, { ...summary, id: 'notification-2', isRead: true }],
        total: 2,
        unreadCount: 1,
        page: 2,
        pageSize: 5,
      });
      expect(settingsMock).toHaveBeenCalledTimes(1);
    });

    it('hides empty digests, sorts newest first and scopes reads to the user', async () => {
      await listNotifications(USER_ID, { page: 2, pageSize: 5 });

      const nonEmpty = {
        OR: [{ expiredCount: { gt: 0 } }, { nearExpiryCount: { gt: 0 } }],
      };
      expect(mockedPrisma.notification.findMany).toHaveBeenCalledWith({
        where: nonEmpty,
        include: {
          reads: { where: { userId: USER_ID }, select: { readAt: true } },
        },
        orderBy: { notificationDate: 'desc' },
        skip: 5,
        take: 5,
      });
      expect(mockedPrisma.notification.count).toHaveBeenNthCalledWith(1, {
        where: nonEmpty,
      });
      expect(mockedPrisma.notification.count).toHaveBeenNthCalledWith(2, {
        where: { ...nonEmpty, reads: { none: { userId: USER_ID } } },
      });
    });
  });

  describe('getNotification', () => {
    it('returns the digest with live names and snapshot values', async () => {
      mockedPrisma.notification.findFirst.mockResolvedValue({
        ...row,
        reads: [{ readAt: AT }],
        items: [
          {
            id: 'item-1',
            batchId: 'batch-1',
            status: 'EXPIRED',
            quantity: 5,
            expirationDate: fromDateString('2026-11-03'),
            daysToExpiry: -2,
            batch: {
              batchNumber: 'A123',
              medicineId: 'medicine-1',
              medicine: { name: 'Paracetamol', strength: null },
            },
          },
        ],
      });

      await expect(getNotification(USER_ID, NOTIFICATION_ID)).resolves.toEqual({
        ...summary,
        isRead: true,
        items: [
          {
            id: 'item-1',
            batchId: 'batch-1',
            medicineId: 'medicine-1',
            medicineName: 'Paracetamol',
            strength: null,
            batchNumber: 'A123',
            status: 'EXPIRED',
            quantity: 5,
            expirationDate: '2026-11-03',
            daysToExpiry: -2,
          },
        ],
      });
      const query = mockedPrisma.notification.findFirst.mock.calls[0][0];
      expect(query.include.items.orderBy).toEqual([
        { daysToExpiry: 'asc' },
        { id: 'asc' },
      ]);
    });

    it('throws NOT_FOUND for an unknown or empty digest', async () => {
      mockedPrisma.notification.findFirst.mockResolvedValue(null);

      const error = await getNotification(USER_ID, NOTIFICATION_ID).catch(
        (caught: unknown) => caught,
      );

      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(404);
      expect(mockedPrisma.notification.findFirst.mock.calls[0][0].where).toEqual({
        id: NOTIFICATION_ID,
        OR: [{ expiredCount: { gt: 0 } }, { nearExpiryCount: { gt: 0 } }],
      });
    });
  });

  describe('markNotificationRead', () => {
    it('inserts with skipDuplicates, then returns the stored read_at', async () => {
      mockedPrisma.notification.findFirst.mockResolvedValue({
        id: NOTIFICATION_ID,
      });
      mockedPrisma.notificationRead.findUniqueOrThrow.mockResolvedValue({
        readAt: AT,
      });

      await expect(
        markNotificationRead(USER_ID, NOTIFICATION_ID),
      ).resolves.toEqual({ id: NOTIFICATION_ID, readAt: AT.toISOString() });
      expect(mockedPrisma.notificationRead.createMany).toHaveBeenCalledWith({
        data: [{ notificationId: NOTIFICATION_ID, userId: USER_ID }],
        skipDuplicates: true,
      });
      expect(
        mockedPrisma.notificationRead.findUniqueOrThrow,
      ).toHaveBeenCalledWith({
        where: {
          notificationId_userId: {
            notificationId: NOTIFICATION_ID,
            userId: USER_ID,
          },
        },
        select: { readAt: true },
      });
    });

    it('throws NOT_FOUND and writes nothing for an unknown or empty digest', async () => {
      mockedPrisma.notification.findFirst.mockResolvedValue(null);

      await expect(
        markNotificationRead(USER_ID, NOTIFICATION_ID),
      ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
      expect(mockedPrisma.notificationRead.createMany).not.toHaveBeenCalled();
    });
  });
});
