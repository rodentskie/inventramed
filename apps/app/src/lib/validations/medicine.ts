import { z } from 'zod';

const NAME_MAX_LENGTH = 200;
const DETAIL_MAX_LENGTH = 100;
const UNIT_MAX_LENGTH = 20;
const NOTES_MAX_LENGTH = 500;
const QUANTITY_MAX = 1_000_000;
const PAGE_MAX = 1_000_000;
const PAGE_SIZE_MAX = 100;

// PostgreSQL text columns can't store NUL characters.
const hasNoNul = (value: string) => !value.includes('\u0000');

const text = (maxLength: number) =>
  z.string().trim().max(maxLength).refine(hasNoNul, 'Contains invalid characters.');

const requiredText = (maxLength: number) => text(maxLength).min(1);

/** Blank values become null. An absent field stays undefined, which means "unchanged" on PATCH. */
const optionalText = (maxLength: number) =>
  text(maxLength)
    .nullable()
    .optional()
    .transform((value) => (value === '' ? null : value));

const hasAtLeastOneField = (value: Record<string, unknown>) =>
  Object.values(value).some((field) => field !== undefined);
const AT_LEAST_ONE_FIELD = 'Provide at least one field to update.';

export const idSchema = z.uuid();

export const medicineListQuerySchema = z.strictObject({
  search: z
    .string()
    .trim()
    .max(NAME_MAX_LENGTH)
    .refine(hasNoNul, 'Contains invalid characters.')
    .optional(),
  page: z.coerce.number().int().min(1).max(PAGE_MAX).default(1),
  pageSize: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(20),
});

export const createMedicineSchema = z.strictObject({
  name: requiredText(NAME_MAX_LENGTH),
  genericName: optionalText(NAME_MAX_LENGTH),
  strength: optionalText(DETAIL_MAX_LENGTH),
  dosageForm: optionalText(DETAIL_MAX_LENGTH),
  unit: requiredText(UNIT_MAX_LENGTH).default('pc'),
});

export const updateMedicineSchema = z
  .strictObject({
    name: requiredText(NAME_MAX_LENGTH).optional(),
    genericName: optionalText(NAME_MAX_LENGTH),
    strength: optionalText(DETAIL_MAX_LENGTH),
    dosageForm: optionalText(DETAIL_MAX_LENGTH),
    unit: requiredText(UNIT_MAX_LENGTH).optional(),
  })
  .refine(hasAtLeastOneField, AT_LEAST_ONE_FIELD);

export const receiveStockSchema = z.strictObject({
  batchNumber: requiredText(DETAIL_MAX_LENGTH),
  expirationDate: z.iso.date(),
  quantity: z.number().int().min(1).max(QUANTITY_MAX),
  notes: optionalText(NOTES_MAX_LENGTH),
});

export const updateBatchSchema = z
  .strictObject({
    batchNumber: requiredText(DETAIL_MAX_LENGTH).optional(),
    expirationDate: z.iso.date().optional(),
  })
  .refine(hasAtLeastOneField, AT_LEAST_ONE_FIELD);

export type MedicineListQuery = z.output<typeof medicineListQuerySchema>;
export type CreateMedicineInput = z.output<typeof createMedicineSchema>;
export type UpdateMedicineInput = z.output<typeof updateMedicineSchema>;
export type ReceiveStockInput = z.output<typeof receiveStockSchema>;
export type UpdateBatchInput = z.output<typeof updateBatchSchema>;
