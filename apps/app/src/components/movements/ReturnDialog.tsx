'use client';

import { NativeSelect } from '@chakra-ui/react';
import { Field } from '@inventra-med/components';
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
import type { MedicineBatch, MovementMedicine } from '@/types/medicine';

interface ReturnDialogProps extends MovementDialogProps {
  medicine: MovementMedicine;
  batch: MedicineBatch;
}

export function ReturnDialog({ medicine, batch, ...dialog }: ReturnDialogProps) {
  const [direction, setDirection] = useState('');
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const { errors, isSubmitting, run } = useMovementSubmit(dialog);

  function handleSubmit() {
    run(
      () =>
        recordMovementAction(medicine.id, batch.id, {
          reason: 'RETURNED',
          direction: direction === '' ? undefined : direction,
          quantity: parseQuantity(quantity),
          notes,
        }),
      () => 'Return recorded',
    );
  }

  return (
    <FormDialog
      title="Record a return"
      open
      onOpenChange={(open) => !open && dialog.onClose()}
      onSubmit={handleSubmit}
      submitLabel="Record"
      isSubmitting={isSubmitting}
    >
      <MovementSummary medicine={medicine} batch={batch} />
      <Field label="Direction" required invalid={Boolean(errors.direction)} errorText={errors.direction}>
        <NativeSelect.Root>
          <NativeSelect.Field
            value={direction}
            onChange={(event) => setDirection(event.target.value)}
          >
            <option value="">Choose a direction</option>
            <option value="IN">Returned to stock</option>
            <option value="OUT">Returned to supplier</option>
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
      </Field>
      <QuantityField value={quantity} onChange={setQuantity} error={errors.quantity} />
      <NotesField value={notes} onChange={setNotes} error={errors.notes} required />
    </FormDialog>
  );
}
