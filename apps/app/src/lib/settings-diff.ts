import type { Settings } from '@/types/settings';

const TEXT_FIELDS = ['facilityName', 'timezone', 'dailyNotificationTime', 'smsTemplate'] as const;
const NUMBER_FIELDS = [
  'nearExpiryThresholdDays',
  'smsMaxItems',
  'workerPollIntervalSecs',
  'smsBatchSize',
  'smsMaxAttempts',
  'smsRetryDelayMinutes',
  'smsClaimTimeoutMinutes',
] as const;

type TextField = (typeof TEXT_FIELDS)[number];
export type NumberField = (typeof NUMBER_FIELDS)[number];

export type EditableSettings = Pick<Settings, TextField | NumberField | 'smsEnabled'>;

/** Number inputs hold text, so a field can be empty or part-way through an edit. */
export type SettingsFormValues = Record<TextField | NumberField, string> & { smsEnabled: boolean };

/** An empty number is sent as `null`, so the server answers with that field's error. */
export type SettingsChanges = Partial<
  Record<TextField, string> & Record<NumberField, number | null> & { smsEnabled: boolean }
>;

export function toFormValues(settings: EditableSettings): SettingsFormValues {
  const numbers = Object.fromEntries(
    NUMBER_FIELDS.map((field) => [field, String(settings[field])]),
  ) as Record<NumberField, string>;

  return {
    ...numbers,
    facilityName: settings.facilityName,
    timezone: settings.timezone,
    dailyNotificationTime: settings.dailyNotificationTime,
    smsTemplate: settings.smsTemplate,
    smsEnabled: settings.smsEnabled,
  };
}

/**
 * Only the editable fields that differ, so read-only fields are never sent.
 * Text is compared trimmed, because the schema trims it before saving.
 */
export function diffSettings(
  initial: EditableSettings,
  current: SettingsFormValues,
): SettingsChanges {
  const changes: SettingsChanges = {};

  for (const field of TEXT_FIELDS) {
    const value = current[field].trim();
    if (value !== initial[field]) {
      changes[field] = value;
    }
  }
  for (const field of NUMBER_FIELDS) {
    const text = current[field].trim();
    const value = text === '' ? null : Number(text);
    if (value !== initial[field]) {
      changes[field] = value;
    }
  }
  if (current.smsEnabled !== initial.smsEnabled) {
    changes.smsEnabled = current.smsEnabled;
  }
  return changes;
}
