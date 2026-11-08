'use client';

import { Button, Input, Text, Textarea } from '@chakra-ui/react';
import { Field, toaster } from '@inventra-med/components';
import { useState } from 'react';
import { LuPackagePlus } from 'react-icons/lu';
import { receiveStockAction } from '@/actions/medicines';
import { FormDialog } from '@/components/common/FormDialog';
import { useActionSubmit } from '@/hooks/use-action-submit';

interface ReceiveStockDialogProps {
  medicineId: string;
  /** Today in `settings.timezone`, for the already-expired warning. */
  today: string;
}

const EMPTY = { batchNumber: '', expirationDate: '', quantity: '', notes: '' };

export const ALREADY_EXPIRED = 'This batch is already expired.';

export function ReceiveStockDialog({ medicineId, today }: ReceiveStockDialogProps) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(EMPTY);
  const { errors, setErrors, isSubmitting, submit } = useActionSubmit();

  const set = (field: keyof typeof EMPTY) => (value: string) =>
    setValues((current) => ({ ...current, [field]: value }));
  const isExpired = values.expirationDate !== '' && values.expirationDate < today;

  function handleOpenChange(next: boolean) {
    if (next) {
      setValues(EMPTY);
      setErrors({});
    }
    setOpen(next);
  }

  function handleSubmit() {
    const input = {
      batchNumber: values.batchNumber,
      expirationDate: values.expirationDate,
      quantity: values.quantity.trim() === '' ? undefined : Number(values.quantity),
      notes: values.notes,
    };
    void submit(() => receiveStockAction(medicineId, input), {
      onSuccess: ({ batch, created }) => {
        toaster.create({
          type: 'success',
          title: created
            ? `New batch ${batch.batchNumber} created`
            : `Added to batch ${batch.batchNumber}`,
        });
        setOpen(false);
      },
    });
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => handleOpenChange(true)}>
        <LuPackagePlus />
        Receive stock
      </Button>
      <FormDialog
        title="Receive stock"
        open={open}
        onOpenChange={handleOpenChange}
        onSubmit={handleSubmit}
        submitLabel="Receive"
        isSubmitting={isSubmitting}
      >
        <Field label="Batch number" required invalid={Boolean(errors.batchNumber)} errorText={errors.batchNumber}>
          <Input value={values.batchNumber} onChange={(event) => set('batchNumber')(event.target.value)} />
        </Field>
        <Field
          label="Expiration date"
          required
          invalid={Boolean(errors.expirationDate)}
          errorText={errors.expirationDate}
        >
          <Input
            type="date"
            value={values.expirationDate}
            onChange={(event) => set('expirationDate')(event.target.value)}
          />
          {isExpired && !errors.expirationDate && (
            <Text textStyle="xs" color="fg.warning">
              {ALREADY_EXPIRED}
            </Text>
          )}
        </Field>
        <Field label="Quantity" required invalid={Boolean(errors.quantity)} errorText={errors.quantity}>
          <Input
            inputMode="numeric"
            value={values.quantity}
            onChange={(event) => set('quantity')(event.target.value)}
          />
        </Field>
        <Field label="Notes" invalid={Boolean(errors.notes)} errorText={errors.notes}>
          <Textarea value={values.notes} onChange={(event) => set('notes')(event.target.value)} />
        </Field>
      </FormDialog>
    </>
  );
}
