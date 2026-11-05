import 'server-only';
import { compare } from 'bcrypt';
import type { NextAuthOptions, User } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { z } from 'zod';
import {
  formatLockoutMessage,
  getLockoutMinutesRemaining,
  getLoginLimitConfig,
  type LoginLimitConfig,
} from '@/lib/login-limit';
import { prisma } from '@/lib/prisma';

const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

// Hash of a discarded random value, compared for unknown usernames so response
// time doesn't reveal which usernames exist. Uses the same cost as real hashes.
const DUMMY_PASSWORD_HASH =
  '$2b$12$t.keILgOHeChAY.zufmQuuM8BpFdLe6SRbFJfn0dh/ivhMpMUaoH.';

// Not strict: NextAuth also passes csrfToken, callbackUrl and json.
const credentialsSchema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(200),
});

class LoginLockedError extends Error {}

/**
 * Counts this try before the password check, so parallel requests can't get
 * more guesses than the limit allows. Returns false when the account is locked.
 */
async function countLoginAttempt(
  userId: string,
  { maxAttempts, cooldownMinutes }: LoginLimitConfig,
): Promise<boolean> {
  const counted = await prisma.$executeRaw`
    UPDATE users
       SET failed_login_attempts = CASE
             WHEN failed_login_attempts >= ${maxAttempts}::int THEN 1
             ELSE failed_login_attempts + 1
           END,
           last_login_attempt_at = now(),
           updated_at = now()
     WHERE id = ${userId}::uuid
       AND (failed_login_attempts < ${maxAttempts}::int
            OR last_login_attempt_at <= now() - make_interval(mins => ${cooldownMinutes}::int))`;
  return counted > 0;
}

async function throwLockedError(
  userId: string,
  cooldownMinutes: number,
): Promise<never> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { lastLoginAttemptAt: true },
  });
  const minutes = getLockoutMinutesRemaining(
    user?.lastLoginAttemptAt ?? null,
    cooldownMinutes,
  );
  throw new LoginLockedError(formatLockoutMessage(minutes));
}

async function attemptLogin(credentials: unknown): Promise<User | null> {
  const config = getLoginLimitConfig();
  if (!config) {
    console.error(
      'LOGIN_MAX_ATTEMPTS and LOGIN_COOLDOWN_MINUTES must be positive integers. Rejecting login.',
    );
    return null;
  }

  const parsed = credentialsSchema.safeParse(credentials);
  if (!parsed.success) {
    return null;
  }
  const { username, password } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      passwordHash: true,
      isActive: true,
      employee: { select: { isActive: true, deletedAt: true } },
    },
  });

  if (!user) {
    await compare(password, DUMMY_PASSWORD_HASH);
    return null;
  }

  if (!(await countLoginAttempt(user.id, config))) {
    return throwLockedError(user.id, config.cooldownMinutes);
  }

  const passwordMatches = await compare(password, user.passwordHash);
  const isActive =
    user.isActive && user.employee.isActive && !user.employee.deletedAt;
  if (!passwordMatches || !isActive) {
    return null;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 0, lastLoginAt: new Date() },
  });

  return { id: user.id, name: user.username };
}

/**
 * NextAuth copies a thrown error's message into the redirect URL, so the
 * lockout message is the only error allowed to leave this function.
 */
export async function authorizeCredentials(
  credentials: unknown,
): Promise<User | null> {
  try {
    return await attemptLogin(credentials);
  } catch (error) {
    if (error instanceof LoginLockedError) {
      throw error;
    }
    console.error('Login failed unexpectedly', error);
    return null;
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      authorize: authorizeCredentials,
    }),
  ],
  session: { strategy: 'jwt', maxAge: SESSION_MAX_AGE_SECONDS },
  callbacks: {
    jwt({ token, user }) {
      if (user?.name) {
        token.username = user.name;
      }
      return token;
    },
    session({ session, token }) {
      return {
        expires: session.expires,
        user: { id: token.sub ?? '', username: token.username ?? '' },
      };
    },
  },
};
