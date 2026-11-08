'use client';

import { Text } from '@chakra-ui/react';
import { useState } from 'react';
import { dispenseAction } from '@/actions/inventory';
import { FormDialog } from '@/components/common/FormDialog';
import {
  MovementSummary,
  NotesField,
  parseQuantity,
  QuantityField,
} from '@/components/movements/MovementFields';
import { type MovementDialogProps, useMovementSubmit } from '@/hooks/use-movement-submit';
import { getExpiredQuantity, getUsableQuantity } from '@/lib/batch-stock';
import { formatCount } from '@/lib/format';
import type { MedicineDetail } from '@/types/medicine';

interface DispenseDialogProps extends MovementDialogProps {
  medicine: MedicineDetail;
}

export function DispenseDialog({ medicine, ...dialog }: DispenseDialogProps) {
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const { errors, isSubmitting, run } = useMovementSubmit(dialog);
  const { unit } = medicine;
  const expired = getExpiredQuantity(medicine.batches);

  function handleSubmit() {
    run(
      () => dispenseAction(medicine.id, { quantity: parseQuantity(quantity), notes }),
      (transaction) => `Dispensed ${formatCount(transaction.quantity)} ${unit}`,
    );
  }

  return (
    <FormDialog
      title="Dispense"
      open
      onOpenChange={(open) => !open && dialog.onClose()}
      onSubmit={handleSubmit}
      submitLabel="Dispense"
      isSubmitting={isSubmitting}
    >
      <MovementSummary
        medicine={medicine}
        stockLabel={`${formatCount(getUsableQuantity(medicine.batches))} ${unit} available`}
      />
      {expired > 0 && (
        <Text textStyle="sm" color="fg.warning">
          {formatCount(expired)} {unit} expired, not dispensable.
        </Text>
      )}
      <QuantityField value={quantity} onChange={setQuantity} error={errors.quantity} />
      <NotesField value={notes} onChange={setNotes} error={errors.notes} />
    </FormDialog>
  );
}
