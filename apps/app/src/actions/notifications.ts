'use server';

import { revalidatePath } from 'next/cache';
import { runAction } from '@/lib/action-result';
import { parseInput } from '@/lib/api-response';
import { requirePermission } from '@/lib/auth';
import {
  markAllNotificationsRead,
  markNotificationRead,
} from '@/lib/notifications';
import { idSchema } from '@/lib/validations/common';
import type { ActionResult } from '@/types/action';
import type { NotificationReadResult } from '@/types/notification';

/** The layout holds the bell, so its dot is recomputed on the next render. */
function revalidateNotifications() {
  revalidatePath('/notifications');
  revalidatePath('/', 'layout');
}

export async function markNotificationReadAction(
  notificationId: unknown,
): Promise<ActionResult<NotificationReadResult>> {
  return runAction(async () => {
    const user = await requirePermission('notification:read');
    const id = parseInput(idSchema, notificationId);
    const result = await markNotificationRead(user.id, id);
    revalidateNotifications();
    return result;
  });
}

export async function markAllNotificationsReadAction(): Promise<ActionResult<{ count: number }>> {
  return runAction(async () => {
    const user = await requirePermission('notification:read');
    const result = await markAllNotificationsRead(user.id);
    revalidateNotifications();
    return result;
  });
}
