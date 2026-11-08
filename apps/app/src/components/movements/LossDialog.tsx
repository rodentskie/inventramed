'use client';

import { useState } from 'react';
import { recordMovementAction } from '@/actions/inventory';
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

interface LossDialogProps extends MovementDialogProps {
  medicine: MovementMedicine;
  batch: MedicineBatch;
  kind: 'damaged' | 'lost';
}

const REASONS = { damaged: 'DAMAGED', lost: 'LOST' } as const;

export function LossDialog({ medicine, batch, kind, ...dialog }: LossDialogProps) {
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const { errors, isSubmitting, run } = useMovementSubmit(dialog);

  function handleSubmit() {
    const parsedQuantity = parseQuantity(quantity);
    run(
      () =>
        recordMovementAction(medicine.id, batch.id, {
          reason: REASONS[kind],
          quantity: parsedQuantity,
          notes,
        }),
      () => `Recorded ${formatCount(parsedQuantity ?? 0)} ${medicine.unit} as ${kind}`,
    );
  }

  return (
    <FormDialog
      title={`Record ${kind} stock`}
      open
      onOpenChange={(open) => !open && dialog.onClose()}
      onSubmit={handleSubmit}
      submitLabel="Record"
      isSubmitting={isSubmitting}
      colorPalette="red"
    >
      <MovementSummary medicine={medicine} batch={batch} />
      <QuantityField value={quantity} onChange={setQuantity} error={errors.quantity} />
      <NotesField value={notes} onChange={setNotes} error={errors.notes} required />
    </FormDialog>
  );
}
