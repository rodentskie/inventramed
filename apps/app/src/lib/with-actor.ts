import 'server-only';
import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';

/**
 * Runs `fn` in one interactive transaction with `app.actor_id` set, so the
 * audit triggers record who made the change. Every inventory write must use it.
 */
export function withActor<T>(
  userId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.actor_id', ${userId}, true)`;
    return fn(tx);
  });
}
