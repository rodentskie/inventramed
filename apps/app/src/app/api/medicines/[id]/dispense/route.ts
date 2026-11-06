import type { NextRequest } from 'next/server';
import {
  apiFailure,
  apiSuccess,
  parseInput,
  parseJsonBody,
} from '@/lib/api-response';
import { requirePermission } from '@/lib/auth';
import { dispense } from '@/lib/inventory';
import { dispenseSchema, idSchema } from '@/lib/validations/inventory';

export async function POST(
  request: NextRequest,
  ctx: RouteContext<'/api/medicines/[id]/dispense'>,
) {
  try {
    const user = await requirePermission('inventory:write');
    const medicineId = parseInput(idSchema, (await ctx.params).id);
    const input = parseInput(dispenseSchema, await parseJsonBody(request));
    return apiSuccess(await dispense(user.id, medicineId, input), 201);
  } catch (error) {
    return apiFailure(error);
  }
}
