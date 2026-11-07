import type { NextRequest } from 'next/server';
import { apiFailure, apiSuccess, parseInput } from '@/lib/api-response';
import { requirePermission } from '@/lib/auth';
import { markNotificationRead } from '@/lib/notifications';
import { idSchema } from '@/lib/validations/notification';

export async function POST(
  _request: NextRequest,
  ctx: RouteContext<'/api/notifications/[id]/read'>,
) {
  try {
    const user = await requirePermission('notification:read');
    const id = parseInput(idSchema, (await ctx.params).id);
    return apiSuccess(await markNotificationRead(user.id, id));
  } catch (error) {
    return apiFailure(error);
  }
}
