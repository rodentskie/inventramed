export type SmsStatus = 'PENDING' | 'SENDING' | 'SENT' | 'FAILED' | 'CANCELLED';

export interface ClaimedSmsMessage {
  id: string;
  phoneNumber: string;
  body: string;
  attempt: number;
}

export interface SmsClaim {
  pollIntervalSecs: number;
  /** The worker expires queued messages before this, so a re-claim can't leave a second copy. */
  claimTimeoutSecs: number;
  messages: ClaimedSmsMessage[];
}

export interface SmsResult {
  id: string;
  status: SmsStatus;
  applied: boolean;
}
