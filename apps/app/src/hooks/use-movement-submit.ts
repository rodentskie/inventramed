'use client';

import { toaster } from '@inventra-med/components';
import { useActionSubmit } from '@/hooks/use-action-submit';
import type { ActionResult } from '@/types/action';

export interface MovementDialogProps {
  onClose: () => void;
  /** Runs after a saved movement, for screens that revalidation doesn't refresh. */
  onMoved?: () => void;
}

/** Submits a movement form. On success it shows the toast, closes the dialog and reports back. */
export function useMovementSubmit({ onClose, onMoved }: MovementDialogProps) {
  const { errors, isSubmitting, submit } = useActionSubmit();

  function run<T>(action: () => Promise<ActionResult<T>>, getToast: (data: T) => string) {
    void submit(action, {
      onSuccess: (data) => {
        toaster.create({ type: 'success', title: getToast(data) });
        onClose();
        onMoved?.();
      },
    });
  }

  return { errors, isSubmitting, run };
}
