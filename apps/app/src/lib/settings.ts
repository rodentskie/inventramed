import 'server-only';
import { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import type { UpdateSettingsInput } from '@/lib/validations/settings';
import type { Settings } from '@/types/settings';

const SETTINGS_ID = 1;

const settingsSelect = {
  facilityName: true,
  timezone: true,
  nearExpiryThresholdDays: true,
  dailyNotificationTime: true,
  smsEnabled: true,
  smsMaxAttempts: true,
  smsRetryDelayMinutes: true,
  smsClaimTimeoutMinutes: true,
  smsBatchSize: true,
  smsMaxItems: true,
  workerPollIntervalSecs: true,
  smsTemplate: true,
  workerLastSeenAt: true,
  updatedAt: true,
  updatedBy: { select: { id: true, username: true } },
} satisfies Prisma.SettingSelect;

type SettingsRow = Prisma.SettingGetPayload<{ select: typeof settingsSelect }>;

function toSettings(row: SettingsRow): Settings {
  return {
    ...row,
    workerLastSeenAt: row.workerLastSeenAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getSettings(): Promise<Settings> {
  const row = await prisma.setting.findUniqueOrThrow({
    where: { id: SETTINGS_ID },
    select: settingsSelect,
  });
  return toSettings(row);
}

/** `settings` has no audit trigger, so `updatedBy` only records the last editor. */
export async function updateSettings(
  actorId: string,
  input: UpdateSettingsInput,
): Promise<Settings> {
  const row = await prisma.setting.update({
    where: { id: SETTINGS_ID },
    data: { ...input, updatedById: actorId },
    select: settingsSelect,
  });
  return toSettings(row);
}
