export type SmsStatus = 'PENDING' | 'SENDING' | 'SENT' | 'FAILED' | 'CANCELLED';

export interface ClaimedSmsMessage {
  id: string;
  phoneNumber: string;
  body: string;
  attempt: number;
}

export interface SmsClaim {
  pollIntervalSecs: number;
  messages: ClaimedSmsMessage[];
}

export interface SmsResult {
  id: string;
  status: SmsStatus;
  applied: boolean;
}
