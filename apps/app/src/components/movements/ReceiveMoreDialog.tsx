'use client';

import { useState } from 'react';
import { receiveStockAction } from '@/actions/medicines';
import { FormDialog } from '@/components/common/FormDialog';
import {
  MovementSummary,
  NotesField,
  parseQuantity,
  QuantityField,
} from '@/components/movements/MovementFields';
import { type MovementDialogProps, useMovementSubmit } from '@/hooks/use-movement-submit';
import { formatCount } from '@/lib/format';
import type { MedicineBatch, MovementMedicine } from '@/types/medicine';

interface ReceiveMoreDialogProps extends MovementDialogProps {
  medicine: MovementMedicine;
  batch: MedicineBatch;
}

/** Adds to one batch, so its number and expiry are fixed. */
export function ReceiveMoreDialog({ medicine, batch, ...dialog }: ReceiveMoreDialogProps) {
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const { errors, isSubmitting, run } = useMovementSubmit(dialog);

  function handleSubmit() {
    const parsedQuantity = parseQuantity(quantity);
    run(
      () =>
        receiveStockAction(medicine.id, {
          batchNumber: batch.batchNumber,
          expirationDate: batch.expirationDate,
          quantity: parsedQuantity,
          notes,
        }),
      () =>
        `Added ${formatCount(parsedQuantity ?? 0)} ${medicine.unit} to batch ${batch.batchNumber}`,
    );
  }

  return (
    <FormDialog
      title={`Receive more of batch ${batch.batchNumber}`}
      open
      onOpenChange={(open) => !open && dialog.onClose()}
      onSubmit={handleSubmit}
      submitLabel="Receive"
      isSubmitting={isSubmitting}
    >
      <MovementSummary medicine={medicine} batch={batch} />
      <QuantityField value={quantity} onChange={setQuantity} error={errors.quantity} />
      <NotesField value={notes} onChange={setNotes} error={errors.notes} />
    </FormDialog>
  );
}
