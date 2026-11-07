import {
  formatSmsItems,
  renderSmsBody,
  type SmsItem,
} from '../../src/lib/sms-body';

const item = (overrides: Partial<SmsItem> = {}): SmsItem => ({
  medicineName: 'Paracetamol',
  strength: '500mg',
  batchNumber: 'A123',
  status: 'NEAR_EXPIRY',
  expirationDate: '2026-11-02',
  daysToExpiry: 3,
  ...overrides,
});

describe('formatSmsItems', () => {
  it('formats a line with the documented layout', () => {
    expect(formatSmsItems([item()], 10)).toBe(
      'Paracetamol 500mg B#A123 exp 2026-11-02 (3d)',
    );
  });

  it('leaves out a missing strength', () => {
    expect(formatSmsItems([item({ strength: null })], 10)).toBe(
      'Paracetamol B#A123 exp 2026-11-02 (3d)',
    );
  });

  it('shows negative days for an expired item', () => {
    const expired = item({ status: 'EXPIRED', daysToExpiry: -2 });

    expect(formatSmsItems([expired], 10)).toContain('(-2d)');
  });

  it('lists expired items first, then the soonest expiry', () => {
    const lines = formatSmsItems(
      [
        item({ batchNumber: 'LATE', daysToExpiry: 9 }),
        item({ batchNumber: 'OLD', status: 'EXPIRED', daysToExpiry: -2 }),
        item({ batchNumber: 'SOON', daysToExpiry: 1 }),
      ],
      10,
    ).split('\n');

    expect(lines.map((line) => line.match(/B#(\w+)/)?.[1])).toEqual([
      'OLD',
      'SOON',
      'LATE',
    ]);
  });

  it('adds no "more" line when the items fit exactly', () => {
    expect(formatSmsItems([item(), item()], 2)).not.toContain('more');
  });

  it('stops at the limit and counts the rest', () => {
    const lines = formatSmsItems([item(), item(), item(), item()], 3).split('\n');

    expect(lines).toHaveLength(4);
    expect(lines[3]).toBe('+1 more, check InventraMed');
  });
});

describe('renderSmsBody', () => {
  const values = {
    facility: 'Clinic',
    date: '2026-11-05',
    expired: 1,
    near_expiry: 2,
    items: 'line',
  };

  it('replaces every placeholder', () => {
    expect(
      renderSmsBody('{facility} {date}: {expired}/{near_expiry}\n{items}', values),
    ).toBe('Clinic 2026-11-05: 1/2\nline');
  });

  it('replaces a placeholder that appears twice', () => {
    expect(renderSmsBody('{expired} {expired}', values)).toBe('1 1');
  });

  it('keeps a value containing a placeholder literal', () => {
    expect(
      renderSmsBody('{items} {facility}', { ...values, items: '{facility}' }),
    ).toBe('{facility} Clinic');
  });

  it('keeps a medicine named {items} literal', () => {
    expect(renderSmsBody('{facility}', { ...values, facility: '{items}' })).toBe(
      '{items}',
    );
  });

  it('keeps $ replacement patterns literal', () => {
    expect(renderSmsBody('{items}', { ...values, items: "$& $1 $' cost" })).toBe(
      "$& $1 $' cost",
    );
  });
});
