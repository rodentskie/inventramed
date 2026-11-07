import { z } from 'zod';

export interface LoginLimitConfig {
  maxAttempts: number;
  cooldownMinutes: number;
}

const MS_PER_MINUTE = 60_000;

const positiveInteger = z.coerce.number().int().positive();

const loginLimitEnvSchema = z.object({
  LOGIN_MAX_ATTEMPTS: positiveInteger,
  LOGIN_COOLDOWN_MINUTES: positiveInteger,
});

/** Returns null when the settings are missing or invalid, so callers can reject logins. */
export function getLoginLimitConfig(
  env: Record<string, string | undefined> = process.env,
): LoginLimitConfig | null {
  const result = loginLimitEnvSchema.safeParse(env);
  if (!result.success) {
    return null;
  }
  return {
    maxAttempts: result.data.LOGIN_MAX_ATTEMPTS,
    cooldownMinutes: result.data.LOGIN_COOLDOWN_MINUTES,
  };
}

/** Rounds up and never returns less than 1, so the message never says 0. */
export function getLockoutMinutesRemaining(
  lastAttemptAt: Date | null,
  cooldownMinutes: number,
  now: Date = new Date(),
): number {
  if (!lastAttemptAt) {
    return cooldownMinutes;
  }
  const elapsedMs = now.getTime() - lastAttemptAt.getTime();
  const remainingMs = cooldownMinutes * MS_PER_MINUTE - elapsedMs;
  return Math.max(1, Math.ceil(remainingMs / MS_PER_MINUTE));
}

export function formatLockoutMessage(minutes: number): string {
  return `Try again after ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}

/** Matches formatLockoutMessage, so the login page shows no other server text. */
export function isLockoutMessage(message: string): boolean {
  return /^Try again after \d+ minutes?$/.test(message);
}
