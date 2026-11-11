import {
  addDays,
  fromDateString,
  getDaysToExpiry,
  getExpiryStatus,
  getLocalTime,
  getLocalToday,
  startOfLocalDay,
  toDateString,
} from '../../src/lib/expiry';

describe('startOfLocalDay', () => {
  it('is 16:00 UTC the day before in Asia/Manila', () => {
    expect(startOfLocalDay('2026-11-08', 'Asia/Manila').toISOString()).toBe(
      '2026-11-07T16:00:00.000Z',
    );
  });

  it('is UTC midnight in UTC', () => {
    expect(startOfLocalDay('2026-11-08', 'UTC').toISOString()).toBe(
      '2026-11-08T00:00:00.000Z',
    );
  });

  it('uses the offset in force at midnight on the day daylight saving starts', () => {
    // New York moves from -05:00 to -04:00 at 02:00 on 2026-03-08.
    expect(startOfLocalDay('2026-03-08', 'America/New_York').toISOString()).toBe(
      '2026-03-08T05:00:00.000Z',
    );
    expect(startOfLocalDay('2026-03-09', 'America/New_York').toISOString()).toBe(
      '2026-03-09T04:00:00.000Z',
    );
  });

  it('uses the offset in force at midnight on the day daylight saving ends', () => {
    // New York moves from -04:00 to -05:00 at 02:00 on 2026-11-01.
    expect(startOfLocalDay('2026-11-01', 'America/New_York').toISOString()).toBe(
      '2026-11-01T04:00:00.000Z',
    );
    expect(startOfLocalDay('2026-11-02', 'America/New_York').toISOString()).toBe(
      '2026-11-02T05:00:00.000Z',
    );
  });

  it('starts at 01:00 where midnight is skipped', () => {
    // Santiago moves from -04:00 to -03:00 at 00:00 on 2026-09-06.
    const start = startOfLocalDay('2026-09-06', 'America/Santiago');
    expect(start.toISOString()).toBe('2026-09-06T04:00:00.000Z');
    expect(getLocalToday('America/Santiago', start)).toBe('2026-09-06');
  });
});

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

describe('getLocalTime', () => {
  it('returns Manila time when UTC is still on the previous day', () => {
    const now = new Date('2026-11-04T16:30:00.000Z');

    expect(getLocalTime('Asia/Manila', now)).toBe('00:30');
  });

  it('uses 24-hour time in the afternoon', () => {
    const now = new Date('2026-11-05T07:05:00.000Z');

    expect(getLocalTime('Asia/Manila', now)).toBe('15:05');
  });
});

describe('addDays', () => {
  it('crosses a month boundary', () => {
    expect(addDays('2026-11-20', 30)).toBe('2026-12-20');
  });
});

describe('date conversion', () => {
  it('round-trips a date without shifting it', () => {
    expect(toDateString(fromDateString('2027-06-30'))).toBe('2027-06-30');
  });
});
