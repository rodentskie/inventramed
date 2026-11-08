import 'server-only';
import { cache } from 'react';
import {
  addDays,
  fromDateString,
  getDaysToExpiry,
  getExpiryStatus,
  toDateString,
} from '@/lib/expiry';
import { getExpiryContext } from '@/lib/medicines';
import { listNotifications } from '@/lib/notifications';
import { prisma } from '@/lib/prisma';
import { getSettings } from '@/lib/settings';
import type {
  ActivityItem,
  AttentionList,
  DashboardOverview,
  WorkerStatus,
} from '@/types/dashboard';
import type { NotificationSummary } from '@/types/notification';

/** The worker counts as offline after missing this many polls. */
const MISSED_POLLS_BEFORE_OFFLINE = 3;

interface OverviewRow {
  medicineCount: number;
  unitsInStock: number;
  nearExpiryBatches: number;
  expiredBatches: number;
}

/** Same rules as `getExpiryStatus`: near expiry is 0 to `threshold` days left. */
export async function getOverview(): Promise<DashboardOverview> {
  const { today, threshold } = await getExpiryContext();
  const rows = await prisma.$queryRaw<OverviewRow[]>`
    SELECT
      (SELECT COUNT(*) FROM medicines WHERE deleted_at IS NULL)::int AS "medicineCount",
      COALESCE(SUM(b.quantity), 0)::int AS "unitsInStock",
      (COUNT(*) FILTER (
        WHERE b.quantity > 0
          AND b.expiration_date >= ${today}::date
          AND b.expiration_date <= ${today}::date + ${threshold}::int
      ))::int AS "nearExpiryBatches",
      (COUNT(*) FILTER (
        WHERE b.quantity > 0 AND b.expiration_date < ${today}::date
      ))::int AS "expiredBatches"
    FROM medicine_batches b
    JOIN medicines m ON m.id = b.medicine_id AND m.deleted_at IS NULL`;

  return { ...rows[0], threshold };
}

/** Expired first, then soonest expiry, the same order FEFO uses. */
export async function getAttentionBatches(limit = 10): Promise<AttentionList> {
  const { today, threshold } = await getExpiryContext();
  const where = {
    quantity: { gt: 0 },
    expirationDate: { lte: fromDateString(addDays(today, threshold)) },
    medicine: { deletedAt: null },
  };

  const [rows, total] = await prisma.$transaction([
    prisma.medicineBatch.findMany({
      where,
      select: {
        id: true,
        batchNumber: true,
        expirationDate: true,
        quantity: true,
        medicine: { select: { name: true, strength: true, unit: true } },
      },
      orderBy: [{ expirationDate: 'asc' }, { receivedAt: 'asc' }, { id: 'asc' }],
      take: limit,
    }),
    prisma.medicineBatch.count({ where }),
  ]);

  const items = rows.map((row) => {
    const expirationDate = toDateString(row.expirationDate);
    return {
      id: row.id,
      medicineName: row.medicine.name,
      strength: row.medicine.strength,
      unit: row.medicine.unit,
      batchNumber: row.batchNumber,
      expirationDate,
      quantity: row.quantity,
      status: getExpiryStatus(expirationDate, today, threshold),
      daysToExpiry: getDaysToExpiry(expirationDate, today),
    };
  });

  return { items, total, threshold };
}

/**
 * Also generates today's digest when it's due. `cache` lets the header's bell
 * and the dashboard share one read per request.
 */
export const getLatestDigest = cache(
  async (userId: string): Promise<NotificationSummary | null> => {
    const list = await listNotifications(userId, { page: 1, pageSize: 1 });
    return list.items[0] ?? null;
  },
);

export async function getRecentActivity(limit = 5): Promise<ActivityItem[]> {
  const [rows, settings] = await Promise.all([
    prisma.inventoryTransaction.findMany({
      select: {
        id: true,
        direction: true,
        reason: true,
        quantity: true,
        createdAt: true,
        medicine: { select: { name: true, strength: true, unit: true } },
        performedBy: { select: { username: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: limit,
    }),
    prisma.setting.findUniqueOrThrow({
      where: { id: 1 },
      select: { timezone: true },
    }),
  ]);
  const exactTime = new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: settings.timezone,
  });

  return rows.map((row) => ({
    id: row.id,
    direction: row.direction,
    reason: row.reason,
    quantity: row.quantity,
    unit: row.medicine.unit,
    medicineName: row.medicine.name,
    strength: row.medicine.strength,
    performedBy: row.performedBy.username,
    createdAt: row.createdAt.toISOString(),
    exactTime: exactTime.format(row.createdAt),
  }));
}

export async function getWorkerStatus(now: Date = new Date()): Promise<WorkerStatus> {
  const settings = await getSettings();
  const lastSeenAt = settings.workerLastSeenAt;
  const maxSilenceMs =
    settings.workerPollIntervalSecs * MISSED_POLLS_BEFORE_OFFLINE * 1000;
  const online =
    lastSeenAt !== null &&
    now.getTime() - new Date(lastSeenAt).getTime() <= maxSilenceMs;

  return { smsEnabled: settings.smsEnabled, lastSeenAt, online };
}
