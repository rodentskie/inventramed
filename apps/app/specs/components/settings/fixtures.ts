import type { Settings } from '../../../src/types/settings';

export function settings(overrides: Partial<Settings> = {}): Settings {
  return {
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
    smsTemplate: '{facility} alert {date}\n{items}',
    workerLastSeenAt: null,
    updatedBy: null,
    updatedAt: '2026-11-06T00:00:00.000Z',
    ...overrides,
  };
}
