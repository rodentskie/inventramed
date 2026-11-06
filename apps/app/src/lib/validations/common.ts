import { z } from 'zod';

// PostgreSQL text columns can't store NUL characters.
export const hasNoNul = (value: string) => !value.includes('\u0000');

export const text = (maxLength: number) =>
  z.string().trim().max(maxLength).refine(hasNoNul, 'Contains invalid characters.');

export const requiredText = (maxLength: number) => text(maxLength).min(1);

/** Blank values become null. An absent field stays undefined, which means "unchanged" on PATCH. */
export const blankToNull = (schema: z.ZodType<string, string>) =>
  schema
    .nullable()
    .optional()
    .transform((value) => (value === '' ? null : value));

export const optionalText = (maxLength: number) => blankToNull(text(maxLength));

export const hasAtLeastOneField = (value: Record<string, unknown>) =>
  Object.values(value).some((field) => field !== undefined);
export const AT_LEAST_ONE_FIELD = 'Provide at least one field to update.';

export const idSchema = z.uuid();
