import 'server-only';
import type { Prisma } from '@/generated/prisma/client';
import { notFound } from '@/lib/api-response';
import {
  addDays,
  fromDateString,
  getDaysToExpiry,
  getLocalTime,
  getLocalToday,
  toDateString,
} from '@/lib/expiry';
import { prisma } from '@/lib/prisma';
import { getSettings } from '@/lib/settings';
import { formatSmsItems, renderSmsBody, type SmsItem } from '@/lib/sms-body';
import type { NotificationListQuery } from '@/lib/validations/notification';
import type { Settings } from '@/types/settings';
import type {
  NotificationDetail,
  NotificationList,
  NotificationReadResult,
  NotificationSummary,
} from '@/types/notification';

type Tx = Prisma.TransactionClient;

const MS_PER_MINUTE = 60_000;

/** An empty digest only records that the day ran, so no endpoint shows it. */
const NON_EMPTY = {
  OR: [{ expiredCount: { gt: 0 } }, { nearExpiryCount: { gt: 0 } }],
} satisfies Prisma.NotificationWhereInput;

const readsFor = (userId: string) =>
  ({
    where: { userId },
    select: { readAt: true },
  }) satisfies Prisma.Notification$readsArgs;

interface SummaryRow {
  id: string;
  notificationDate: Date;
  expiredCount: number;
  nearExpiryCount: number;
  createdAt: Date;
  reads: { readAt: Date }[];
}

function toSummary(row: SummaryRow): NotificationSummary {
  return {
    id: row.id,
    notificationDate: toDateString(row.notificationDate),
    expiredCount: row.expiredCount,
    nearExpiryCount: row.nearExpiryCount,
    isRead: row.reads.length > 0,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Includes `SENDING` past its claim, which the worker would otherwise reclaim and send. */
async function cancelOlderMessages(
  tx: Tx,
  notificationDate: Date,
  claimTimeoutMinutes: number,
  now: Date,
): Promise<void> {
  await tx.smsMessage.updateMany({
    where: {
      notification: { notificationDate: { lt: notificationDate } },
      OR: [
        { status: 'PENDING' },
        {
          status: 'SENDING',
          claimedAt: {
            lt: new Date(now.getTime() - claimTimeoutMinutes * MS_PER_MINUTE),
          },
        },
      ],
    },
    data: { status: 'CANCELLED' },
  });
}

async function snapshotItems(
  tx: Tx,
  notificationId: string,
  today: string,
  thresholdDays: number,
): Promise<SmsItem[]> {
  const batches = await tx.medicineBatch.findMany({
    where: {
      quantity: { gt: 0 },
      expirationDate: { lte: fromDateString(addDays(today, thresholdDays)) },
      medicine: { deletedAt: null },
    },
    select: {
      id: true,
      batchNumber: true,
      quantity: true,
      expirationDate: true,
      medicine: { select: { name: true, strength: true } },
    },
    orderBy: [{ expirationDate: 'asc' }, { receivedAt: 'asc' }, { id: 'asc' }],
  });

  const items = batches.map((batch) => {
    const expirationDate = toDateString(batch.expirationDate);
    const daysToExpiry = getDaysToExpiry(expirationDate, today);
    return {
      batch,
      expirationDate,
      daysToExpiry,
      status: daysToExpiry < 0 ? ('EXPIRED' as const) : ('NEAR_EXPIRY' as const),
    };
  });

  await tx.notificationItem.createMany({
    data: items.map(({ batch, status, daysToExpiry }) => ({
      notificationId,
      batchId: batch.id,
      status,
      quantity: batch.quantity,
      expirationDate: batch.expirationDate,
      daysToExpiry,
    })),
  });

  return items.map(({ batch, status, expirationDate, daysToExpiry }) => ({
    medicineName: batch.medicine.name,
    strength: batch.medicine.strength,
    batchNumber: batch.batchNumber,
    status,
    expirationDate,
    daysToExpiry,
  }));
}

async function queueSms(
  tx: Tx,
  notificationId: string,
  body: string,
): Promise<void> {
  const recipients = await tx.employee.findMany({
    where: { isActive: true, deletedAt: null, receivesSmsAlerts: true },
    select: { id: true, contactNumber: true },
  });

  await tx.smsMessage.createMany({
    data: recipients.flatMap(({ id, contactNumber }) =>
      contactNumber
        ? [{ notificationId, employeeId: id, phoneNumber: contactNumber, body }]
        : [],
    ),
  });
}

async function writeDigest(
  tx: Tx,
  settings: Settings,
  today: string,
  now: Date,
): Promise<void> {
  const notificationDate = fromDateString(today);
  const [notification] = await tx.notification.createManyAndReturn({
    data: [{ notificationDate }],
    skipDuplicates: true,
    select: { id: true },
  });
  if (!notification) {
    return;
  }

  await cancelOlderMessages(
    tx,
    notificationDate,
    settings.smsClaimTimeoutMinutes,
    now,
  );

  const items = await snapshotItems(
    tx,
    notification.id,
    today,
    settings.nearExpiryThresholdDays,
  );
  if (items.length === 0) {
    return;
  }

  const expired = items.filter((item) => item.status === 'EXPIRED').length;
  const nearExpiry = items.length - expired;
  await tx.notification.update({
    where: { id: notification.id },
    data: { expiredCount: expired, nearExpiryCount: nearExpiry },
  });

  if (settings.smsEnabled) {
    const body = renderSmsBody(settings.smsTemplate, {
      facility: settings.facilityName,
      date: today,
      expired,
      near_expiry: nearExpiry,
      items: formatSmsItems(items, settings.smsMaxItems),
    });
    await queueSms(tx, notification.id, body);
  }
}

/**
 * Creates today's digest once the daily time has passed. Everything runs in one
 * transaction, so a crash leaves no row and a later call retries. A concurrent
 * caller waits on the unique date, then finds the row and stops.
 */
export async function generateDailyNotification(
  now: Date = new Date(),
): Promise<void> {
  const settings = await getSettings();
  if (getLocalTime(settings.timezone, now) < settings.dailyNotificationTime) {
    return;
  }

  // This runs on every worker poll and list request, so skip the transaction when it can.
  const today = getLocalToday(settings.timezone, now);
  const existing = await prisma.notification.findUnique({
    where: { notificationDate: fromDateString(today) },
    select: { id: true },
  });
  if (existing) {
    return;
  }

  await prisma.$transaction((tx) => writeDigest(tx, settings, today, now));
}

export async function listNotifications(
  userId: string,
  { page, pageSize }: NotificationListQuery,
): Promise<NotificationList> {
  await generateDailyNotification();

  const [rows, total, unreadCount] = await prisma.$transaction([
    prisma.notification.findMany({
      where: NON_EMPTY,
      include: { reads: readsFor(userId) },
      orderBy: { notificationDate: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.notification.count({ where: NON_EMPTY }),
    prisma.notification.count({
      where: { ...NON_EMPTY, reads: { none: { userId } } },
    }),
  ]);

  return { items: rows.map(toSummary), total, unreadCount, page, pageSize };
}

export async function getNotification(
  userId: string,
  id: string,
): Promise<NotificationDetail> {
  const row = await prisma.notification.findFirst({
    where: { id, ...NON_EMPTY },
    include: {
      reads: readsFor(userId),
      items: {
        include: {
          batch: {
            select: {
              batchNumber: true,
              medicineId: true,
              medicine: { select: { name: true, strength: true } },
            },
          },
        },
        orderBy: [{ daysToExpiry: 'asc' }, { id: 'asc' }],
      },
    },
  });
  if (!row) {
    throw notFound();
  }

  return {
    ...toSummary(row),
    items: row.items.map((item) => ({
      id: item.id,
      batchId: item.batchId,
      medicineId: item.batch.medicineId,
      medicineName: item.batch.medicine.name,
      strength: item.batch.medicine.strength,
      batchNumber: item.batch.batchNumber,
      status: item.status,
      quantity: item.quantity,
      expirationDate: toDateString(item.expirationDate),
      daysToExpiry: item.daysToExpiry,
    })),
  };
}

/**
 * `ON CONFLICT DO NOTHING` keeps the first `read_at` when this is repeated.
 * Prisma's `upsert` with an empty `update` fails with P2002 on concurrent calls.
 */
export async function markNotificationRead(
  userId: string,
  id: string,
): Promise<NotificationReadResult> {
  const notification = await prisma.notification.findFirst({
    where: { id, ...NON_EMPTY },
    select: { id: true },
  });
  if (!notification) {
    throw notFound();
  }

  await prisma.notificationRead.createMany({
    data: [{ notificationId: id, userId }],
    skipDuplicates: true,
  });
  const read = await prisma.notificationRead.findUniqueOrThrow({
    where: { notificationId_userId: { notificationId: id, userId } },
    select: { readAt: true },
  });

  return { id, readAt: read.readAt.toISOString() };
}
