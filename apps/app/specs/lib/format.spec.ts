import {
  capitalize,
  formatCount,
  formatDaysToExpiry,
  formatMedicineName,
  formatRelativeTime,
} from '../../src/lib/format';

const NOW = new Date('2026-11-08T04:00:00.000Z');

function ago(ms: number): Date {
  return new Date(NOW.getTime() - ms);
}

describe('formatRelativeTime', () => {
  it.each([
    [0, 'just now'],
    [59_000, 'just now'],
    [60_000, '1 min ago'],
    [59 * 60_000, '59 min ago'],
    [60 * 60_000, '1 h ago'],
    [23 * 3_600_000, '23 h ago'],
    [24 * 3_600_000, '1 d ago'],
    [10 * 86_400_000, '10 d ago'],
  ])('formats %d ms as %s', (ms, expected) => {
    expect(formatRelativeTime(ago(ms), NOW)).toBe(expected);
  });

  it('treats a future time as just now', () => {
    expect(formatRelativeTime(new Date(NOW.getTime() + 60_000), NOW)).toBe('just now');
  });

  it('accepts an ISO string', () => {
    expect(formatRelativeTime(ago(120_000).toISOString(), NOW)).toBe('2 min ago');
  });
});

describe('formatDaysToExpiry', () => {
  it.each([
    [-7, 'Expired 7d ago'],
    [-1, 'Expired 1d ago'],
    [0, 'Expires today'],
    [4, '4d left'],
  ])('formats %d as %s', (days, expected) => {
    expect(formatDaysToExpiry(days)).toBe(expected);
  });
});

describe('formatMedicineName', () => {
  it('adds the strength when there is one', () => {
    expect(formatMedicineName('Paracetamol', '500 mg')).toBe('Paracetamol 500 mg');
    expect(formatMedicineName('Paracetamol', null)).toBe('Paracetamol');
  });
});

describe('formatCount', () => {
  it('groups thousands', () => {
    expect(formatCount(4512)).toBe('4,512');
  });
});

describe('capitalize', () => {
  it('capitalizes the first letter', () => {
    expect(capitalize('admin')).toBe('Admin');
    expect(capitalize('')).toBe('');
  });
});
