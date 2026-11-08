import type { InventoryReason } from '@/types/inventory';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const REASON_LABELS: Record<InventoryReason, string> = {
  RECEIVED: 'Received',
  DISPENSED: 'Dispensed',
  COUNT_ADJUSTMENT: 'Count adjusted',
  RETURNED: 'Returned',
  DAMAGED: 'Damaged',
  LOST: 'Lost',
  EXPIRED_DISPOSAL: 'Expired disposal',
};

/** Past times only, e.g. `just now`, `5 min ago`, `3 h ago`, `2 d ago`. */
export function formatRelativeTime(date: string | Date, now: Date = new Date()): string {
  const elapsed = Math.max(0, now.getTime() - new Date(date).getTime());
  if (elapsed < MINUTE) {
    return 'just now';
  }
  if (elapsed < HOUR) {
    return `${Math.floor(elapsed / MINUTE)} min ago`;
  }
  if (elapsed < DAY) {
    return `${Math.floor(elapsed / HOUR)} h ago`;
  }
  return `${Math.floor(elapsed / DAY)} d ago`;
}

/** Negative days have passed since expiry. */
export function formatDaysToExpiry(days: number): string {
  if (days < 0) {
    return `Expired ${-days}d ago`;
  }
  if (days === 0) {
    return 'Expires today';
  }
  return `${days}d left`;
}

export function formatCount(value: number): string {
  return value.toLocaleString('en-PH');
}

/** `Paracetamol 500 mg`, or just the name without a strength. */
export function formatMedicineName(name: string, strength: string | null): string {
  return strength ? `${name} ${strength}` : name;
}

export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
