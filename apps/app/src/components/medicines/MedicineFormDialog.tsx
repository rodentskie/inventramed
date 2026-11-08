'use client';

import { Button, Input } from '@chakra-ui/react';
import { Field, toaster } from '@inventra-med/components';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LuPencil, LuPlus } from 'react-icons/lu';
import { createMedicineAction, updateMedicineAction } from '@/actions/medicines';
import { FormDialog } from '@/components/common/FormDialog';
import { ProductBarcodeField } from '@/components/medicines/ProductBarcodeField';
import { useActionSubmit } from '@/hooks/use-action-submit';
import type { Medicine } from '@/types/medicine';

type FormValues = {
  name: string;
  genericName: string;
  strength: string;
  dosageForm: string;
  unit: string;
  productBarcode: string;
};

type TextField = Exclude<keyof FormValues, 'productBarcode'>;

const TEXT_FIELDS: { field: TextField; label: string; required?: boolean }[] = [
  { field: 'name', label: 'Name', required: true },
  { field: 'genericName', label: 'Generic name' },
  { field: 'strength', label: 'Strength' },
  { field: 'dosageForm', label: 'Dosage form' },
  { field: 'unit', label: 'Unit', required: true },
];

interface MedicineFormDialogProps {
  /** Edits this medicine; creates a new one without it. */
  medicine?: Medicine;
  /** Prefills Product barcode when creating, e.g. from `/scan`. */
  defaultProductBarcode?: string;
  triggerLabel?: string;
}

function toValues(medicine?: Medicine, productBarcode = ''): FormValues {
  return {
    name: medicine?.name ?? '',
    genericName: medicine?.genericName ?? '',
    strength: medicine?.strength ?? '',
    dosageForm: medicine?.dosageForm ?? '',
    unit: medicine?.unit ?? 'pc',
    productBarcode: medicine?.productBarcode ?? productBarcode,
  };
}

/** Only the fields that differ, since the update schema rejects an empty change. */
function changedFields(values: FormValues, initial: FormValues): Partial<FormValues> {
  return Object.fromEntries(
    Object.entries(values).filter(
      ([key, value]) => value.trim() !== initial[key as keyof FormValues],
    ),
  );
}

export function MedicineFormDialog({
  medicine,
  defaultProductBarcode,
  triggerLabel,
}: MedicineFormDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const initial = toValues(medicine, defaultProductBarcode);
  const [values, setValues] = useState(initial);
  const { errors, setErrors, isSubmitting, submit } = useActionSubmit();
  const changes = changedFields(values, initial);
  const isEdit = Boolean(medicine);

  const set = (field: keyof FormValues) => (value: string) =>
    setValues((current) => ({ ...current, [field]: value }));

  function handleOpenChange(next: boolean) {
    if (next) {
      setValues(toValues(medicine, defaultProductBarcode));
      setErrors({});
    }
    setOpen(next);
  }

  function handleSubmit() {
    const codeFields = { MEDICINE_DUPLICATE: 'name' } as const;
    if (medicine) {
      void submit(() => updateMedicineAction(medicine.id, changes), {
        codeFields,
        onSuccess: () => {
          toaster.create({ type: 'success', title: 'Medicine updated' });
          setOpen(false);
        },
      });
      return;
    }
    void submit(() => createMedicineAction(values), {
      codeFields,
      onSuccess: (created) => {
        toaster.create({ type: 'success', title: 'Medicine created' });
        setOpen(false);
        router.push(`/medicines/${created.id}`);
      },
    });
  }

  return (
    <>
      <Button
        size="sm"
        variant={isEdit ? 'outline' : 'solid'}
        colorPalette={isEdit ? undefined : 'teal'}
        onClick={() => handleOpenChange(true)}
      >
        {isEdit ? <LuPencil /> : <LuPlus />}
        {triggerLabel ?? (isEdit ? 'Edit' : 'New medicine')}
      </Button>
      <FormDialog
        title={isEdit ? 'Edit medicine' : 'New medicine'}
        open={open}
        onOpenChange={handleOpenChange}
        onSubmit={handleSubmit}
        submitLabel={isEdit ? 'Save' : 'Create'}
        isSubmitting={isSubmitting}
        submitDisabled={isEdit && Object.keys(changes).length === 0}
      >
        {TEXT_FIELDS.map(({ field, label, required }) => (
          <Field
            key={field}
            label={label}
            required={required}
            invalid={Boolean(errors[field])}
            errorText={errors[field]}
          >
            <Input value={values[field]} onChange={(event) => set(field)(event.target.value)} />
          </Field>
        ))}
        <ProductBarcodeField
          value={values.productBarcode}
          onChange={set('productBarcode')}
          error={errors.productBarcode}
        />
      </FormDialog>
    </>
  );
}
