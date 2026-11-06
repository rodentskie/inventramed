import type { NextRequest } from 'next/server';
import { apiFailure, apiSuccess, parseInput } from '@/lib/api-response';
import { requirePermission } from '@/lib/auth';
import { getTransaction } from '@/lib/inventory';
import { idSchema } from '@/lib/validations/inventory';

export async function GET(
  _request: NextRequest,
  ctx: RouteContext<'/api/inventory/transactions/[id]'>,
) {
  try {
    await requirePermission('inventory:read');
    const id = parseInput(idSchema, (await ctx.params).id);
    return apiSuccess(await getTransaction(id));
  } catch (error) {
    return apiFailure(error);
  }
}
