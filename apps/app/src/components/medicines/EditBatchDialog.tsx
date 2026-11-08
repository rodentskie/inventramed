'use client';

import { Input } from '@chakra-ui/react';
import { Field, toaster } from '@inventra-med/components';
import { useState } from 'react';
import { updateBatchAction } from '@/actions/medicines';
import { FormDialog } from '@/components/common/FormDialog';
import { useActionSubmit } from '@/hooks/use-action-submit';
import type { MedicineBatch } from '@/types/medicine';

interface EditBatchDialogProps {
  batch: MedicineBatch;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditBatchDialog({ batch, open, onOpenChange }: EditBatchDialogProps) {
  const [batchNumber, setBatchNumber] = useState(batch.batchNumber);
  const [expirationDate, setExpirationDate] = useState(batch.expirationDate);
  const { errors, setErrors, isSubmitting, submit } = useActionSubmit();

  const changes = {
    ...(batchNumber.trim() !== batch.batchNumber && { batchNumber }),
    ...(expirationDate !== batch.expirationDate && { expirationDate }),
  };
  const hasChanges = Object.keys(changes).length > 0;

  function handleOpenChange(next: boolean) {
    if (next) {
      setBatchNumber(batch.batchNumber);
      setExpirationDate(batch.expirationDate);
      setErrors({});
    }
    onOpenChange(next);
  }

  function handleSubmit() {
    void submit(() => updateBatchAction(batch.medicineId, batch.id, changes), {
      codeFields: { BATCH_DUPLICATE: 'batchNumber' },
      onSuccess: () => {
        toaster.create({ type: 'success', title: 'Batch updated' });
        onOpenChange(false);
      },
    });
  }

  return (
    <FormDialog
      title={`Edit batch ${batch.batchNumber}`}
      open={open}
      onOpenChange={handleOpenChange}
      onSubmit={handleSubmit}
      submitLabel="Save"
      isSubmitting={isSubmitting}
      submitDisabled={!hasChanges}
    >
      <Field label="Batch number" invalid={Boolean(errors.batchNumber)} errorText={errors.batchNumber}>
        <Input value={batchNumber} onChange={(event) => setBatchNumber(event.target.value)} />
      </Field>
      <Field
        label="Expiration date"
        invalid={Boolean(errors.expirationDate)}
        errorText={errors.expirationDate}
      >
        <Input
          type="date"
          value={expirationDate}
          onChange={(event) => setExpirationDate(event.target.value)}
        />
      </Field>
    </FormDialog>
  );
}
