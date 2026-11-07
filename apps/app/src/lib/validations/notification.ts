import { z } from 'zod';
import { idSchema } from '@/lib/validations/common';

export { idSchema };

const PAGE_MAX = 1_000_000;
const PAGE_SIZE_MAX = 100;

export const notificationListQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(PAGE_MAX).default(1),
  pageSize: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(20),
});

export type NotificationListQuery = z.output<typeof notificationListQuerySchema>;
