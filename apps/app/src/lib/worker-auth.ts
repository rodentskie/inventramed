import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { ApiError } from '@/lib/api-response';

const BEARER = /^Bearer (.+)$/i;

const sha256 = (value: string) => createHash('sha256').update(value).digest();

/** Hashing gives both values the same length, which `timingSafeEqual` requires. */
export function requireWorkerToken(request: Request): void {
  const expected = process.env.WORKER_API_TOKEN;
  if (!expected) {
    console.error('WORKER_API_TOKEN is not set, so worker calls are rejected');
  }

  const token = request.headers.get('authorization')?.match(BEARER)?.[1];
  if (
    !expected ||
    !token ||
    !timingSafeEqual(sha256(token), sha256(expected))
  ) {
    throw new ApiError(
      401,
      'UNAUTHENTICATED',
      'A valid worker token is required.',
    );
  }
}
