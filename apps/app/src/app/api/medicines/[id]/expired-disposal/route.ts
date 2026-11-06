import type { NextRequest } from 'next/server';
import {
  apiFailure,
  apiSuccess,
  parseInput,
  parseJsonBody,
} from '@/lib/api-response';
import { requirePermission } from '@/lib/auth';
import { disposeExpiredStock } from '@/lib/inventory';
import { expiredDisposalSchema, idSchema } from '@/lib/validations/inventory';

export async function POST(
  request: NextRequest,
  ctx: RouteContext<'/api/medicines/[id]/expired-disposal'>,
) {
  try {
    const user = await requirePermission('inventory:write');
    const medicineId = parseInput(idSchema, (await ctx.params).id);
    const input = parseInput(
      expiredDisposalSchema,
      await parseJsonBody(request),
    );
    return apiSuccess(
      await disposeExpiredStock(user.id, medicineId, input),
      201,
    );
  } catch (error) {
    return apiFailure(error);
  }
}
