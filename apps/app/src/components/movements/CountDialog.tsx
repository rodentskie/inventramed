'use client';

import { Text } from '@chakra-ui/react';
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

export const COUNT_MATCHES = 'Count matches, nothing recorded.';

interface CountDialogProps extends MovementDialogProps {
  medicine: MovementMedicine;
  batch: MedicineBatch;
}

function getDifferenceLabel(counted: number | undefined, current: number): string | null {
  if (counted === undefined || !Number.isInteger(counted) || counted < 0) {
    return null;
  }
  const difference = counted - current;
  if (difference === 0) {
    return COUNT_MATCHES;
  }
  return `Difference: ${difference > 0 ? '+' : '−'}${formatCount(Math.abs(difference))}`;
}

export function CountDialog({ medicine, batch, ...dialog }: CountDialogProps) {
  const [counted, setCounted] = useState('');
  const [notes, setNotes] = useState('');
  const { errors, isSubmitting, run } = useMovementSubmit(dialog);
  const countedQuantity = parseQuantity(counted);
  const differenceLabel = getDifferenceLabel(countedQuantity, batch.quantity);

  function handleSubmit() {
    run(
      () =>
        recordMovementAction(medicine.id, batch.id, {
          reason: 'COUNT_ADJUSTMENT',
          countedQuantity,
          notes,
        }),
      ({ transaction }) => (transaction ? 'Count updated' : COUNT_MATCHES),
    );
  }

  return (
    <FormDialog
      title={`Count batch ${batch.batchNumber}`}
      open
      onOpenChange={(open) => !open && dialog.onClose()}
      onSubmit={handleSubmit}
      submitLabel="Save count"
      isSubmitting={isSubmitting}
    >
      <MovementSummary medicine={medicine} batch={batch} />
      <QuantityField
        label="Counted quantity"
        value={counted}
        onChange={setCounted}
        error={errors.countedQuantity}
      />
      {differenceLabel && (
        <Text textStyle="sm" color="fg.muted">
          {differenceLabel}
        </Text>
      )}
      <NotesField value={notes} onChange={setNotes} error={errors.notes} required />
    </FormDialog>
  );
}
