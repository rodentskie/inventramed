import { z } from 'zod';
import { idSchema, optionalText, requiredText } from '@/lib/validations/common';

export { idSchema };

const NOTES_MAX_LENGTH = 500;
const QUANTITY_MAX = 1_000_000;
const BATCH_IDS_MAX = 100;
const PAGE_MAX = 1_000_000;
const PAGE_SIZE_MAX = 100;

const INVENTORY_REASONS = [
  'RECEIVED',
  'DISPENSED',
  'COUNT_ADJUSTMENT',
  'RETURNED',
  'DAMAGED',
  'LOST',
  'EXPIRED_DISPOSAL',
] as const;
const INVENTORY_DIRECTIONS = ['IN', 'OUT'] as const;

const QUANTITY_MESSAGE = 'Enter a whole number from 1 to 1,000,000.';
const COUNT_MESSAGE = 'Enter a whole number from 0 to 1,000,000.';

const quantity = z
  .number(QUANTITY_MESSAGE)
  .int(QUANTITY_MESSAGE)
  .min(1, QUANTITY_MESSAGE)
  .max(QUANTITY_MAX, QUANTITY_MESSAGE);
const requiredNotes = requiredText(NOTES_MAX_LENGTH);

export const dispenseSchema = z.strictObject({
  quantity,
  notes: optionalText(NOTES_MAX_LENGTH),
});

export const batchMovementSchema = z.discriminatedUnion('reason', [
  z.strictObject({
    reason: z.literal(['DAMAGED', 'LOST']),
    quantity,
    notes: requiredNotes,
  }),
  z.strictObject({
    reason: z.literal('RETURNED'),
    direction: z.enum(INVENTORY_DIRECTIONS, 'Choose a direction.'),
    quantity,
    notes: requiredNotes,
  }),
  z.strictObject({
    reason: z.literal('COUNT_ADJUSTMENT'),
    countedQuantity: z
      .number(COUNT_MESSAGE)
      .int(COUNT_MESSAGE)
      .min(0, COUNT_MESSAGE)
      .max(QUANTITY_MAX, COUNT_MESSAGE),
    notes: requiredNotes,
  }),
]);

/** An empty `batchIds` is rejected, so it can't be mistaken for "every expired batch". */
export const expiredDisposalSchema = z.strictObject({
  batchIds: z
    .array(idSchema)
    .min(1)
    .max(BATCH_IDS_MAX)
    .transform((ids) => [...new Set(ids.map((id) => id.toLowerCase()))])
    .optional(),
  notes: optionalText(NOTES_MAX_LENGTH),
});

export const transactionListQuerySchema = z.strictObject({
  medicineId: idSchema.optional(),
  batchId: idSchema.optional(),
  reason: z.enum(INVENTORY_REASONS).optional(),
  direction: z.enum(INVENTORY_DIRECTIONS).optional(),
  page: z.coerce.number().int().min(1).max(PAGE_MAX).default(1),
  pageSize: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(20),
});

export type DispenseInput = z.output<typeof dispenseSchema>;
export type BatchMovementInput = z.output<typeof batchMovementSchema>;
export type ExpiredDisposalInput = z.output<typeof expiredDisposalSchema>;
export type TransactionListQuery = z.output<typeof transactionListQuerySchema>;
