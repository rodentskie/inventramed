import { z } from 'zod';
import { idSchema, optionalText } from '@/lib/validations/common';

export { idSchema };

export const smsResultSchema = z.strictObject({
  attempt: z.number().int().min(1),
  success: z.boolean(),
  error: optionalText(500),
  modemResponse: optionalText(1000),
});

export type SmsResultInput = z.output<typeof smsResultSchema>;
