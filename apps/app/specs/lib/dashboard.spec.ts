/** @jest-environment node */
import {
  getAttentionBatches,
  getLatestDigest,
  getOverview,
  getRecentActivity,
  getWorkerStatus,
} from '../../src/lib/dashboard';
import { getExpiryContext } from '../../src/lib/medicines';
import { listNotifications } from '../../src/lib/notifications';
import { prisma } from '../../src/lib/prisma';
import { getSettings } from '../../src/lib/settings';

jest.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: jest.fn(),
    $transaction: jest.fn((queries: Promise<unknown>[]) => Promise.all(queries)),
    medicineBatch: { findMany: jest.fn(), count: jest.fn() },
    inventoryTransaction: { findMany: jest.fn() },
    setting: { findUniqueOrThrow: jest.fn() },
  },
}));
jest.mock('@/lib/medicines', () => ({ getExpiryContext: jest.fn() }));
jest.mock('@/lib/notifications', () => ({ listNotifications: jest.fn() }));
jest.mock('@/lib/settings', () => ({ getSettings: jest.fn() }));

const NOW = new Date('2026-11-08T04:00:00.000Z');

const queryRawMock = prisma.$queryRaw as unknown as jest.Mock;
const batchFindManyMock = prisma.medicineBatch.findMany as jest.Mock;
const batchCountMock = prisma.medicineBatch.count as jest.Mock;
const transactionFindManyMock = prisma.inventoryTransaction.findMany as jest.Mock;
const settingMock = prisma.setting.findUniqueOrThrow as jest.Mock;
const expiryContextMock = getExpiryContext as jest.Mock;
const listNotificationsMock = listNotifications as jest.Mock;
const getSettingsMock = getSettings as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  expiryContextMock.mockResolvedValue({ today: '2026-11-08', threshold: 30 });
});

describe('getOverview', () => {
  it('returns the counts with the threshold', async () => {
    queryRawMock.mockResolvedValue([
      { medicineCount: 3, unitsInStock: 450, nearExpiryBatches: 2, expiredBatches: 1 },
    ]);

    await expect(getOverview()).resolves.toEqual({
      medicineCount: 3,
      unitsInStock: 450,
      nearExpiryBatches: 2,
      expiredBatches: 1,
      threshold: 30,
    });
  });
});

describe('getAttentionBatches', () => {
  function batchRow(id: string, expirationDate: string) {
    return {
      id,
      batchNumber: `B-${id}`,
      expirationDate: new Date(`${expirationDate}T00:00:00.000Z`),
      quantity: 20,
      medicine: { name: 'Paracetamol', strength: '500 mg', unit: 'pc' },
    };
  }

  it('filters to today + threshold and maps status and days', async () => {
    batchFindManyMock.mockResolvedValue([
      batchRow('a', '2026-11-01'),
      batchRow('b', '2026-11-08'),
      batchRow('c', '2026-11-12'),
    ]);
    batchCountMock.mockResolvedValue(3);

    const result = await getAttentionBatches();

    const args = batchFindManyMock.mock.calls[0][0];
    expect(args.where).toEqual({
      quantity: { gt: 0 },
      expirationDate: { lte: new Date('2026-12-08T00:00:00.000Z') },
      medicine: { deletedAt: null },
    });
    expect(args.take).toBe(10);
    expect(result.total).toBe(3);
    expect(result.threshold).toBe(30);
    expect(result.items.map((item) => [item.status, item.daysToExpiry])).toEqual([
      ['EXPIRED', -7],
      ['NEAR_EXPIRY', 0],
      ['NEAR_EXPIRY', 4],
    ]);
    expect(result.items[0]).toMatchObject({
      medicineName: 'Paracetamol',
      strength: '500 mg',
      unit: 'pc',
      batchNumber: 'B-a',
      expirationDate: '2026-11-01',
    });
  });

  it('reports the total beyond the limit', async () => {
    batchFindManyMock.mockResolvedValue([batchRow('a', '2026-11-01')]);
    batchCountMock.mockResolvedValue(25);

    const result = await getAttentionBatches(1);

    expect(batchFindManyMock.mock.calls[0][0].take).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(25);
  });
});

describe('getRecentActivity', () => {
  it('maps transactions with the medicine and exact local time', async () => {
    transactionFindManyMock.mockResolvedValue([
      {
        id: 'tx-1',
        direction: 'OUT',
        reason: 'DISPENSED',
        quantity: 20,
        createdAt: NOW,
        medicine: { name: 'Amoxicillin', strength: '500 mg', unit: 'cap' },
        performedBy: { username: 'staff1' },
      },
    ]);
    settingMock.mockResolvedValue({ timezone: 'Asia/Manila' });

    const [item] = await getRecentActivity();

    expect(transactionFindManyMock.mock.calls[0][0].take).toBe(5);
    expect(item).toMatchObject({
      id: 'tx-1',
      direction: 'OUT',
      reason: 'DISPENSED',
      quantity: 20,
      unit: 'cap',
      medicineName: 'Amoxicillin',
      strength: '500 mg',
      performedBy: 'staff1',
      createdAt: NOW.toISOString(),
    });
    expect(item.exactTime).toMatch(/12:00/);
  });
});

describe('getLatestDigest', () => {
  it('returns the newest digest', async () => {
    const digest = { id: 'n-1', isRead: false };
    listNotificationsMock.mockResolvedValue({ items: [digest] });

    await expect(getLatestDigest('user-1')).resolves.toBe(digest);
    expect(listNotificationsMock).toHaveBeenCalledWith('user-1', { page: 1, pageSize: 1 });
  });

  it('returns null without a digest', async () => {
    listNotificationsMock.mockResolvedValue({ items: [] });

    await expect(getLatestDigest('user-2')).resolves.toBeNull();
  });
});

describe('getWorkerStatus', () => {
  function settings(workerLastSeenAt: string | null, smsEnabled = true) {
    return { workerLastSeenAt, smsEnabled, workerPollIntervalSecs: 300 };
  }

  it('is offline when the worker was never seen', async () => {
    getSettingsMock.mockResolvedValue(settings(null));

    await expect(getWorkerStatus(NOW)).resolves.toEqual({
      smsEnabled: true,
      lastSeenAt: null,
      online: false,
    });
  });

  it('is online within three poll intervals', async () => {
    const lastSeenAt = new Date(NOW.getTime() - 15 * 60_000).toISOString();
    getSettingsMock.mockResolvedValue(settings(lastSeenAt));

    await expect(getWorkerStatus(NOW)).resolves.toMatchObject({ online: true });
  });

  it('is offline after three missed polls', async () => {
    const lastSeenAt = new Date(NOW.getTime() - 15 * 60_000 - 1).toISOString();
    getSettingsMock.mockResolvedValue(settings(lastSeenAt));

    await expect(getWorkerStatus(NOW)).resolves.toMatchObject({ online: false });
  });

  it('reports SMS being disabled', async () => {
    getSettingsMock.mockResolvedValue(settings(null, false));

    await expect(getWorkerStatus(NOW)).resolves.toMatchObject({ smsEnabled: false });
  });
});
