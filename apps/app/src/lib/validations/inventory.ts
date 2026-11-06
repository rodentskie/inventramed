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

const quantity = z.number().int().min(1).max(QUANTITY_MAX);
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
    direction: z.enum(INVENTORY_DIRECTIONS),
    quantity,
    notes: requiredNotes,
  }),
  z.strictObject({
    reason: z.literal('COUNT_ADJUSTMENT'),
    countedQuantity: z.number().int().min(0).max(QUANTITY_MAX),
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
