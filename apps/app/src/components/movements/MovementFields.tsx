'use client';

import { Input, Stack, Text, Textarea } from '@chakra-ui/react';
import { Field } from '@inventra-med/components';
import { formatCount, formatMedicineName } from '@/lib/format';
import type { MedicineBatch, MovementMedicine } from '@/types/medicine';

/** Blank stays undefined, so the schema reports it as missing. */
export function parseQuantity(value: string): number | undefined {
  return value.trim() === '' ? undefined : Number(value);
}

interface MovementSummaryProps {
  medicine: MovementMedicine;
  batch?: MedicineBatch;
  /** Stock line for a form that isn't about one batch. */
  stockLabel?: string;
}

/** The medicine, batch and current quantity, at the top of every movement form. */
export function MovementSummary({ medicine, batch, stockLabel }: MovementSummaryProps) {
  return (
    <Stack gap="0.5">
      <Text fontWeight="medium">{formatMedicineName(medicine.name, medicine.strength)}</Text>
      {batch && (
        <>
          <Text textStyle="sm" color="fg.muted">
            Batch {batch.batchNumber} · Expires {batch.expirationDate}
          </Text>
          <Text textStyle="sm" color="fg.muted">
            {formatCount(batch.quantity)} {medicine.unit} in this batch
          </Text>
        </>
      )}
      {stockLabel && (
        <Text textStyle="sm" color="fg.muted">
          {stockLabel}
        </Text>
      )}
    </Stack>
  );
}

interface QuantityFieldProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

export function QuantityField({ label = 'Quantity', value, onChange, error }: QuantityFieldProps) {
  return (
    <Field label={label} required invalid={Boolean(error)} errorText={error}>
      <Input
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

interface NotesFieldProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
}

export function NotesField({ value, onChange, error, required = false }: NotesFieldProps) {
  return (
    <Field label="Notes" required={required} invalid={Boolean(error)} errorText={error}>
      <Textarea value={value} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}
