import { unstable_rethrow } from 'next/navigation';
import { ApiError } from '@/lib/api-response';
import type { ActionResult } from '@/types/action';

export type { ActionError, ActionResult } from '@/types/action';

export const GENERIC_ERROR_MESSAGE = 'Something went wrong. Please try again.';

/**
 * Runs a Server Action body and returns `{ success, data, error }`. Maps
 * `ApiError` the way `apiFailure` does, and logs anything else as
 * `INTERNAL_ERROR`. Next's redirect and not-found errors are rethrown.
 */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { success: true, data: await fn() };
  } catch (error) {
    unstable_rethrow(error);

    if (error instanceof ApiError) {
      return {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          ...(error.fields && { fields: error.fields }),
        },
      };
    }

    console.error('Unexpected action error', error);
    return {
      success: false,
      error: { code: 'INTERNAL_ERROR', message: GENERIC_ERROR_MESSAGE },
    };
  }
}
