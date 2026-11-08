'use client';

import { CountDialog } from '@/components/movements/CountDialog';
import { DisposeExpiredDialog } from '@/components/movements/DisposeExpiredDialog';
import { LossDialog } from '@/components/movements/LossDialog';
import { ReceiveMoreDialog } from '@/components/movements/ReceiveMoreDialog';
import { ReturnDialog } from '@/components/movements/ReturnDialog';
import type { MovementDialogProps } from '@/hooks/use-movement-submit';
import type { BatchMovementAction } from '@/types/inventory';
import type { MedicineBatch, MovementMedicine } from '@/types/medicine';

interface BatchMovementDialogProps extends MovementDialogProps {
  action: BatchMovementAction;
  medicine: MovementMedicine;
  batch: MedicineBatch;
}

/**
 * The form for one batch action. Each form mounts when its action opens and
 * unmounts when it closes, so it always starts empty.
 */
export function BatchMovementDialog({ action, ...props }: BatchMovementDialogProps) {
  switch (action) {
    case 'receive':
      return <ReceiveMoreDialog {...props} />;
    case 'count':
      return <CountDialog {...props} />;
    case 'damaged':
    case 'lost':
      return <LossDialog {...props} kind={action} />;
    case 'returned':
      return <ReturnDialog {...props} />;
    case 'dispose':
      return <DisposeExpiredDialog {...props} />;
  }
}
