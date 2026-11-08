'use client';

import { toaster } from '@inventra-med/components';
import { useState } from 'react';
import type { ApiErrorCode } from '@/lib/api-response';
import type { ActionResult } from '@/types/action';

export const GENERIC_ERROR = 'Something went wrong. Please try again.';

export type FieldErrors = Record<string, string | undefined>;

interface SubmitOptions<T> {
  onSuccess: (data: T) => void;
  /** Error codes without `fields` that still belong under one field, e.g. a duplicate name. */
  codeFields?: Partial<Record<ApiErrorCode, string>>;
}

/**
 * Runs a Server Action from a form: blocks double submits, puts `fields`
 * errors under their inputs and shows any other error as a toast.
 */
export function useActionSubmit() {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit<T>(
    run: () => Promise<ActionResult<T>>,
    { onSuccess, codeFields = {} }: SubmitOptions<T>,
  ): Promise<void> {
    if (isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await run();
      if (result.success) {
        setErrors({});
        onSuccess(result.data);
        return;
      }

      const { code, message, fields } = result.error;
      const field = codeFields[code];
      const fieldErrors: FieldErrors = Object.fromEntries(
        Object.entries(fields ?? {}).map(([key, messages]) => [key, messages[0]]),
      );
      if (field) {
        fieldErrors[field] = message;
      }
      setErrors(fieldErrors);

      const shownOnFields = Object.keys(fieldErrors).some((key) => key !== '_');
      if (!shownOnFields) {
        toaster.create({ type: 'error', title: fieldErrors._ ?? message });
      }
    } catch {
      toaster.create({ type: 'error', title: GENERIC_ERROR });
    } finally {
      setIsSubmitting(false);
    }
  }

  return { errors, setErrors, isSubmitting, submit };
}
