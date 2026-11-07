import type { NextRequest } from 'next/server';
import { apiFailure, apiSuccess, parseInput } from '@/lib/api-response';
import { requirePermission } from '@/lib/auth';
import { listNotifications } from '@/lib/notifications';
import { notificationListQuerySchema } from '@/lib/validations/notification';

export async function GET(request: NextRequest) {
  try {
    const user = await requirePermission('notification:read');
    const query = parseInput(
      notificationListQuerySchema,
      Object.fromEntries(request.nextUrl.searchParams),
    );
    return apiSuccess(await listNotifications(user.id, query));
  } catch (error) {
    return apiFailure(error);
  }
}
