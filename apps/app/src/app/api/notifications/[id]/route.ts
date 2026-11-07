import type { NextRequest } from 'next/server';
import { apiFailure, apiSuccess, parseInput } from '@/lib/api-response';
import { requirePermission } from '@/lib/auth';
import { getNotification } from '@/lib/notifications';
import { idSchema } from '@/lib/validations/notification';

export async function GET(
  _request: NextRequest,
  ctx: RouteContext<'/api/notifications/[id]'>,
) {
  try {
    const user = await requirePermission('notification:read');
    const id = parseInput(idSchema, (await ctx.params).id);
    return apiSuccess(await getNotification(user.id, id));
  } catch (error) {
    return apiFailure(error);
  }
}
