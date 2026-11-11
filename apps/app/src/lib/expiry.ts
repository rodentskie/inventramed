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

/** The current time in the given IANA timezone, as 24-hour HH:mm. */
export function getLocalTime(timezone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  return `${get('hour')}:${get('minute')}`;
}

/** How far the timezone's wall clock is ahead of UTC at that instant, in ms. */
function getUtcOffset(timezone: string, at: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(at));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  const wallClock = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return wallClock - Math.floor(at / 1000) * 1000;
}

/**
 * The instant a local day starts in the given IANA timezone. The offset is read twice,
 * because local midnight can fall on the other side of a daylight saving change from
 * UTC midnight. Where midnight is skipped, the day starts at the first instant after.
 */
export function startOfLocalDay(date: string, timezone: string): Date {
  const utcMidnight = fromDateString(date).getTime();
  const first = utcMidnight - getUtcOffset(timezone, utcMidnight);
  const second = utcMidnight - getUtcOffset(timezone, first);
  const start = getLocalToday(timezone, new Date(second)) === date ? second : first;
  return new Date(start);
}

/** Prisma returns `@db.Date` columns as UTC midnight, so read them back in UTC. */
export function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function fromDateString(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function addDays(date: string, days: number): string {
  return toDateString(new Date(fromDateString(date).getTime() + days * MS_PER_DAY));
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
