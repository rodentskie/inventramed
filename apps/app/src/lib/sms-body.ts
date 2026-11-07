import type { NotificationItem } from '@/types/notification';

export type SmsItem = Pick<
  NotificationItem,
  | 'medicineName'
  | 'strength'
  | 'batchNumber'
  | 'status'
  | 'expirationDate'
  | 'daysToExpiry'
>;

export interface SmsBodyValues {
  facility: string;
  date: string;
  expired: number;
  near_expiry: number;
  items: string;
}

const PLACEHOLDER_PATTERN = /\{(facility|date|expired|near_expiry|items)\}/g;

function formatSmsItem(item: SmsItem): string {
  const name = item.strength
    ? `${item.medicineName} ${item.strength}`
    : item.medicineName;
  return `${name} B#${item.batchNumber} exp ${item.expirationDate} (${item.daysToExpiry}d)`;
}

/** Expired first, then soonest expiry. Lists at most `maxItems`, then a "+N more" line. */
export function formatSmsItems(items: SmsItem[], maxItems: number): string {
  const sorted = [...items].sort((a, b) => a.daysToExpiry - b.daysToExpiry);
  const lines = sorted.slice(0, maxItems).map(formatSmsItem);
  const remaining = sorted.length - lines.length;
  if (remaining > 0) {
    lines.push(`+${remaining} more, check InventraMed`);
  }
  return lines.join('\n');
}

/**
 * One pass with a replacer function, so inserted text is never scanned again
 * and `$` in a medicine name isn't treated as a replacement pattern.
 */
export function renderSmsBody(template: string, values: SmsBodyValues): string {
  return template.replace(
    PLACEHOLDER_PATTERN,
    (_match, name: keyof SmsBodyValues) => String(values[name]),
  );
}
