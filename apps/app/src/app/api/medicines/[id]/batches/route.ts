import type { NextRequest } from 'next/server';
import {
  apiFailure,
  apiSuccess,
  parseInput,
  parseJsonBody,
} from '@/lib/api-response';
import { requirePermission } from '@/lib/auth';
import { receiveStock } from '@/lib/medicines';
import { idSchema, receiveStockSchema } from '@/lib/validations/medicine';

export async function POST(
  request: NextRequest,
  ctx: RouteContext<'/api/medicines/[id]/batches'>,
) {
  try {
    const user = await requirePermission('medicine:write', 'inventory:write');
    const medicineId = parseInput(idSchema, (await ctx.params).id);
    const input = parseInput(receiveStockSchema, await parseJsonBody(request));
    const { batch, created } = await receiveStock(user.id, medicineId, input);
    return apiSuccess(batch, created ? 201 : 200);
  } catch (error) {
    return apiFailure(error);
  }
}
