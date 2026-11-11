import { z } from 'zod';
import { idSchema } from '@/lib/validations/common';

const PAGE_MAX = 1_000_000;
const PAGE_SIZE_MAX = 100;

export const AUDIT_ENTITY_TYPES = [
  'medicines',
  'medicine_batches',
  'inventory_transactions',
  'inventory_entries',
] as const;
export const AUDIT_ACTIONS = ['created', 'updated', 'deleted'] as const;

/** The offset is required, so the caller sets the timezone and the server never guesses it. */
const timestamp = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value));

export const auditLogListQuerySchema = z
  .strictObject({
    entityType: z.enum(AUDIT_ENTITY_TYPES).optional(),
    entityId: idSchema.optional(),
    action: z.enum(AUDIT_ACTIONS).optional(),
    actorId: idSchema.optional(),
    from: timestamp.optional(),
    to: timestamp.optional(),
    page: z.coerce.number().int().min(1).max(PAGE_MAX).default(1),
    pageSize: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(20),
  })
  .refine(({ from, to }) => !from || !to || to > from, {
    path: ['to'],
    message: 'Must be after from.',
  });

/**
 * The `/audit-logs` page's URL. Dates are local days in `settings.timezone`; the page
 * turns them into the timestamps `auditLogListQuerySchema` takes.
 */
export const auditLogPageQuerySchema = z.strictObject({
  entityType: z.enum(AUDIT_ENTITY_TYPES).optional(),
  action: z.enum(AUDIT_ACTIONS).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  page: z.coerce.number().int().min(1).max(PAGE_MAX).default(1),
  pageSize: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(20),
});

export type AuditLogListQuery = z.output<typeof auditLogListQuerySchema>;
export type AuditLogPageQuery = z.output<typeof auditLogPageQuerySchema>;
