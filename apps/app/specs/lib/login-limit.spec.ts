import {
  formatLockoutMessage,
  getLockoutMinutesRemaining,
  getLoginLimitConfig,
} from '../../src/lib/login-limit';

describe('getLoginLimitConfig', () => {
  it('reads positive integers', () => {
    expect(
      getLoginLimitConfig({
        LOGIN_MAX_ATTEMPTS: '5',
        LOGIN_COOLDOWN_MINUTES: '15',
      }),
    ).toEqual({ maxAttempts: 5, cooldownMinutes: 15 });
  });

  it.each([
    [{ LOGIN_COOLDOWN_MINUTES: '15' }],
    [{ LOGIN_MAX_ATTEMPTS: '5' }],
    [{ LOGIN_MAX_ATTEMPTS: '', LOGIN_COOLDOWN_MINUTES: '15' }],
    [{ LOGIN_MAX_ATTEMPTS: '0', LOGIN_COOLDOWN_MINUTES: '15' }],
    [{ LOGIN_MAX_ATTEMPTS: '-1', LOGIN_COOLDOWN_MINUTES: '15' }],
    [{ LOGIN_MAX_ATTEMPTS: '2.5', LOGIN_COOLDOWN_MINUTES: '15' }],
    [{ LOGIN_MAX_ATTEMPTS: 'five', LOGIN_COOLDOWN_MINUTES: '15' }],
  ])('returns null for %j', (env) => {
    expect(getLoginLimitConfig(env)).toBeNull();
  });
});

describe('getLockoutMinutesRemaining', () => {
  const now = new Date('2026-11-05T12:00:00.000Z');
  const minutesAgo = (minutes: number) =>
    new Date(now.getTime() - minutes * 60_000);

  it('returns the full cooldown right after the last attempt', () => {
    expect(getLockoutMinutesRemaining(minutesAgo(0), 15, now)).toBe(15);
  });

  it('rounds part of a minute up', () => {
    expect(getLockoutMinutesRemaining(minutesAgo(2.5), 15, now)).toBe(13);
  });

  it('returns 1 with exactly one minute left', () => {
    expect(getLockoutMinutesRemaining(minutesAgo(14), 15, now)).toBe(1);
  });

  it('never returns less than 1', () => {
    expect(getLockoutMinutesRemaining(minutesAgo(20), 15, now)).toBe(1);
  });

  it('returns the full cooldown without a last attempt', () => {
    expect(getLockoutMinutesRemaining(null, 15, now)).toBe(15);
  });
});

describe('formatLockoutMessage', () => {
  it('uses the plural', () => {
    expect(formatLockoutMessage(12)).toBe('Try again after 12 minutes');
  });

  it('uses the singular for one minute', () => {
    expect(formatLockoutMessage(1)).toBe('Try again after 1 minute');
  });
});
