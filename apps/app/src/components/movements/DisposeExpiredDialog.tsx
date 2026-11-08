'use client';

import { Checkbox, Stack, Text } from '@chakra-ui/react';
import { useState } from 'react';
import { disposeExpiredAction } from '@/actions/inventory';
import { FormDialog } from '@/components/common/FormDialog';
import { MovementSummary, NotesField } from '@/components/movements/MovementFields';
import { type MovementDialogProps, useMovementSubmit } from '@/hooks/use-movement-submit';
import { isDisposable } from '@/lib/batch-stock';
import { formatCount } from '@/lib/format';
import type { MedicineBatch, MovementMedicine } from '@/types/medicine';

interface DisposeExpiredDialogProps extends MovementDialogProps {
  medicine: MovementMedicine;
  /** Disposes this batch only. */
  batch?: MedicineBatch;
  /** The medicine's batches. The form lists the expired ones with stock, all ticked. */
  batches?: MedicineBatch[];
}

export function DisposeExpiredDialog({
  medicine,
  batch,
  batches = [],
  ...dialog
}: DisposeExpiredDialogProps) {
  const listed = batch ? [] : batches.filter(isDisposable);
  const [ticked, setTicked] = useState(() => new Set(listed.map(({ id }) => id)));
  const [notes, setNotes] = useState('');
  const { errors, isSubmitting, run } = useMovementSubmit(dialog);
  const batchIds = batch ? [batch.id] : listed.map(({ id }) => id).filter((id) => ticked.has(id));

  function setBatchTicked(id: string, checked: boolean) {
    setTicked((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }

  function handleSubmit() {
    // Always names the batches, so stock that expired after this form opened stays untouched.
    run(
      () => disposeExpiredAction(medicine.id, { batchIds, notes }),
      (transaction) =>
        `Disposed ${formatCount(transaction.quantity)} ${medicine.unit} of expired stock`,
    );
  }

  return (
    <FormDialog
      title="Dispose expired stock"
      open
      onOpenChange={(open) => !open && dialog.onClose()}
      onSubmit={handleSubmit}
      submitLabel="Dispose"
      isSubmitting={isSubmitting}
      submitDisabled={batchIds.length === 0}
      colorPalette="red"
    >
      <MovementSummary medicine={medicine} batch={batch} />
      {!batch && (
        <Stack as="fieldset" gap="2">
          <Text as="legend" textStyle="sm" fontWeight="medium" mb="2">
            Batches to dispose
          </Text>
          {listed.map(({ id, batchNumber, expirationDate, quantity }) => (
            <Checkbox.Root
              key={id}
              size="sm"
              checked={ticked.has(id)}
              onCheckedChange={({ checked }) => setBatchTicked(id, checked === true)}
            >
              <Checkbox.HiddenInput />
              <Checkbox.Control />
              <Checkbox.Label>
                {batchNumber} · Expired {expirationDate} · {formatCount(quantity)} {medicine.unit}
              </Checkbox.Label>
            </Checkbox.Root>
          ))}
        </Stack>
      )}
      <NotesField value={notes} onChange={setNotes} error={errors.notes} />
    </FormDialog>
  );
}
