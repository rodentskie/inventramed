import {
  fromDateString,
  getDaysToExpiry,
  getExpiryStatus,
  getLocalToday,
  toDateString,
} from '../../src/lib/expiry';

describe('getExpiryStatus', () => {
  const today = '2026-11-05';

  it('is EXPIRED the day after the expiration date', () => {
    expect(getExpiryStatus('2026-11-04', today, 30)).toBe('EXPIRED');
  });

  it('is NEAR_EXPIRY on the expiration date', () => {
    expect(getExpiryStatus('2026-11-05', today, 30)).toBe('NEAR_EXPIRY');
  });

  it('is NEAR_EXPIRY exactly on the threshold', () => {
    expect(getExpiryStatus('2026-12-05', today, 30)).toBe('NEAR_EXPIRY');
  });

  it('is SAFE one day past the threshold', () => {
    expect(getExpiryStatus('2026-12-06', today, 30)).toBe('SAFE');
  });
});

describe('getDaysToExpiry', () => {
  it('is positive before expiry', () => {
    expect(getDaysToExpiry('2026-11-08', '2026-11-05')).toBe(3);
  });

  it('is negative after expiry', () => {
    expect(getDaysToExpiry('2026-11-02', '2026-11-05')).toBe(-3);
  });

  it('is 0 on the expiration date', () => {
    expect(getDaysToExpiry('2026-11-05', '2026-11-05')).toBe(0);
  });
});

describe('getLocalToday', () => {
  it('returns the Manila date when UTC is still on the previous day', () => {
    const now = new Date('2026-11-04T16:30:00.000Z');

    expect(getLocalToday('Asia/Manila', now)).toBe('2026-11-05');
  });

  it('returns the same date when both are on the same day', () => {
    const now = new Date('2026-11-05T02:00:00.000Z');

    expect(getLocalToday('Asia/Manila', now)).toBe('2026-11-05');
  });
});

describe('date conversion', () => {
  it('round-trips a date without shifting it', () => {
    expect(toDateString(fromDateString('2027-06-30'))).toBe('2027-06-30');
  });
});
