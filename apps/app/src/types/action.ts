import type { ApiErrorCode, ApiFieldErrors } from '@/lib/api-response';

export interface ActionError {
  code: ApiErrorCode;
  message: string;
  fields?: ApiFieldErrors;
}

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: ActionError };
