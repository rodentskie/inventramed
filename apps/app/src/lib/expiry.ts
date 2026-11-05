import type { BatchExpiryStatus } from '@/types/medicine';

const MS_PER_DAY = 86_400_000;

/** Today's date in the given IANA timezone, as YYYY-MM-DD. */
export function getLocalToday(timezone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Prisma returns `@db.Date` columns as UTC midnight, so read them back in UTC. */
export function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function fromDateString(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/** Negative when the date has passed. */
export function getDaysToExpiry(expirationDate: string, today: string): number {
  const difference =
    fromDateString(expirationDate).getTime() - fromDateString(today).getTime();
  return Math.round(difference / MS_PER_DAY);
}

export function getExpiryStatus(
  expirationDate: string,
  today: string,
  nearExpiryThresholdDays: number,
): BatchExpiryStatus {
  const days = getDaysToExpiry(expirationDate, today);
  if (days < 0) {
    return 'EXPIRED';
  }
  return days <= nearExpiryThresholdDays ? 'NEAR_EXPIRY' : 'SAFE';
}
