import { z } from 'zod';
import {
  AT_LEAST_ONE_FIELD,
  hasAtLeastOneField,
  requiredText,
} from '@/lib/validations/common';

const FACILITY_NAME_MAX_LENGTH = 100;
const SMS_TEMPLATE_MAX_LENGTH = 1000;
const NEAR_EXPIRY_THRESHOLD_DAYS_MAX = 3650;
const SMS_MAX_ATTEMPTS_MAX = 20;
const SMS_DELAY_MINUTES_MAX = 1440;
const SMS_BATCH_MAX = 100;
const WORKER_POLL_INTERVAL_SECS_MIN = 10;
const WORKER_POLL_INTERVAL_SECS_MAX = 86_400;

const DAILY_TIME_PATTERN = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const SMS_PLACEHOLDER_PATTERN = /\{([^{}]*)\}/g;
const SMS_PLACEHOLDERS = new Set([
  'facility',
  'date',
  'expired',
  'near_expiry',
  'items',
]);

/**
 * Uses the same API as `getLocalToday`, so an accepted value can't break it
 * later. `Intl` also accepts UTC offsets such as `+08:00`, which aren't IANA names.
 */
function isIanaTimezone(value: string): boolean {
  if (/^[+-]/.test(value)) {
    return false;
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function hasOnlyKnownPlaceholders(template: string): boolean {
  return [...template.matchAll(SMS_PLACEHOLDER_PATTERN)].every(([, name]) =>
    SMS_PLACEHOLDERS.has(name),
  );
}

const integer = (min: number, max: number) =>
  z.number().int().min(min).max(max).optional();

export const updateSettingsSchema = z
  .strictObject({
    facilityName: requiredText(FACILITY_NAME_MAX_LENGTH).optional(),
    timezone: z
      .string()
      .refine(isIanaTimezone, 'Must be a valid IANA timezone.')
      .optional(),
    nearExpiryThresholdDays: integer(1, NEAR_EXPIRY_THRESHOLD_DAYS_MAX),
    dailyNotificationTime: z
      .string()
      .regex(DAILY_TIME_PATTERN, 'Must be a time in HH:mm format.')
      .optional(),
    smsEnabled: z.boolean().optional(),
    smsMaxAttempts: integer(1, SMS_MAX_ATTEMPTS_MAX),
    smsRetryDelayMinutes: integer(1, SMS_DELAY_MINUTES_MAX),
    smsClaimTimeoutMinutes: integer(1, SMS_DELAY_MINUTES_MAX),
    smsBatchSize: integer(1, SMS_BATCH_MAX),
    smsMaxItems: integer(1, SMS_BATCH_MAX),
    workerPollIntervalSecs: integer(
      WORKER_POLL_INTERVAL_SECS_MIN,
      WORKER_POLL_INTERVAL_SECS_MAX,
    ),
    smsTemplate: requiredText(SMS_TEMPLATE_MAX_LENGTH)
      .refine(
        hasOnlyKnownPlaceholders,
        'Only {facility}, {date}, {expired}, {near_expiry} and {items} are allowed.',
      )
      .optional(),
  })
  .refine(hasAtLeastOneField, AT_LEAST_ONE_FIELD);

export type UpdateSettingsInput = z.output<typeof updateSettingsSchema>;
