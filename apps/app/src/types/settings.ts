export interface Settings {
  facilityName: string;
  timezone: string;
  nearExpiryThresholdDays: number;
  dailyNotificationTime: string;
  smsEnabled: boolean;
  smsMaxAttempts: number;
  smsRetryDelayMinutes: number;
  smsClaimTimeoutMinutes: number;
  smsBatchSize: number;
  smsMaxItems: number;
  workerPollIntervalSecs: number;
  smsTemplate: string;
  workerLastSeenAt: string | null;
  updatedBy: { id: string; username: string } | null;
  updatedAt: string;
}
