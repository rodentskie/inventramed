import type { NextRequest } from 'next/server';
import {
  apiFailure,
  apiSuccess,
  parseInput,
  parseJsonBody,
} from '@/lib/api-response';
import { requirePermission } from '@/lib/auth';
import { recordBatchMovement } from '@/lib/inventory';
import { batchMovementSchema, idSchema } from '@/lib/validations/inventory';

export async function POST(
  request: NextRequest,
  ctx: RouteContext<'/api/medicines/[id]/batches/[batchId]/movements'>,
) {
  try {
    const user = await requirePermission('inventory:write');
    const params = await ctx.params;
    const medicineId = parseInput(idSchema, params.id);
    const batchId = parseInput(idSchema, params.batchId);
    const input = parseInput(batchMovementSchema, await parseJsonBody(request));
    const result = await recordBatchMovement(
      user.id,
      medicineId,
      batchId,
      input,
    );
    return apiSuccess(result, result.transaction ? 201 : 200);
  } catch (error) {
    return apiFailure(error);
  }
}
