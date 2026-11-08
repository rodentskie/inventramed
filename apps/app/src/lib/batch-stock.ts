import type { BatchMovementAction } from '@/types/inventory';
import type { MedicineBatch } from '@/types/medicine';

export interface MovementPermissions {
  /** `inventory:write` */
  canMove: boolean;
  /** `inventory:write` and `medicine:write` */
  canReceive: boolean;
}

export function isDisposable(batch: MedicineBatch): boolean {
  return batch.status === 'EXPIRED' && batch.quantity > 0;
}

export function getExpiredQuantity(batches: MedicineBatch[]): number {
  return batches.filter(isDisposable).reduce((sum, batch) => sum + batch.quantity, 0);
}

/** Dispensing is FEFO over batches that haven't expired. */
export function getUsableQuantity(batches: MedicineBatch[]): number {
  return batches
    .filter((batch) => batch.status !== 'EXPIRED')
    .reduce((sum, batch) => sum + batch.quantity, 0);
}

/** The movements this user can make on a batch, in display order. */
export function getBatchActions(
  batch: MedicineBatch,
  { canMove, canReceive }: MovementPermissions,
): BatchMovementAction[] {
  return [
    ...(canReceive ? (['receive'] as const) : []),
    ...(canMove ? (['count', 'damaged', 'lost', 'returned'] as const) : []),
    ...(canMove && isDisposable(batch) ? (['dispose'] as const) : []),
  ];
}
