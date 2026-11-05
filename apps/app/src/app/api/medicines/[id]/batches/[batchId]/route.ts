import type { NextRequest } from 'next/server';
import {
  apiFailure,
  apiSuccess,
  parseInput,
  parseJsonBody,
} from '@/lib/api-response';
import { requirePermission } from '@/lib/auth';
import { getBatch, updateBatch } from '@/lib/medicines';
import { idSchema, updateBatchSchema } from '@/lib/validations/medicine';

type Context = RouteContext<'/api/medicines/[id]/batches/[batchId]'>;

async function parseIds(ctx: Context) {
  const { id, batchId } = await ctx.params;
  return {
    medicineId: parseInput(idSchema, id),
    batchId: parseInput(idSchema, batchId),
  };
}

export async function GET(_request: NextRequest, ctx: Context) {
  try {
    await requirePermission('medicine:read');
    const { medicineId, batchId } = await parseIds(ctx);
    return apiSuccess(await getBatch(medicineId, batchId));
  } catch (error) {
    return apiFailure(error);
  }
}

export async function PATCH(request: NextRequest, ctx: Context) {
  try {
    const user = await requirePermission('medicine:write');
    const { medicineId, batchId } = await parseIds(ctx);
    const input = parseInput(updateBatchSchema, await parseJsonBody(request));
    return apiSuccess(await updateBatch(user.id, medicineId, batchId, input));
  } catch (error) {
    return apiFailure(error);
  }
}
