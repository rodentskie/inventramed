import type { NextRequest } from 'next/server';
import {
  apiFailure,
  apiSuccess,
  parseInput,
  parseJsonBody,
} from '@/lib/api-response';
import { requirePermission } from '@/lib/auth';
import {
  getMedicine,
  softDeleteMedicine,
  updateMedicine,
} from '@/lib/medicines';
import { idSchema, updateMedicineSchema } from '@/lib/validations/medicine';

type Context = RouteContext<'/api/medicines/[id]'>;

export async function GET(_request: NextRequest, ctx: Context) {
  try {
    await requirePermission('medicine:read');
    const id = parseInput(idSchema, (await ctx.params).id);
    return apiSuccess(await getMedicine(id));
  } catch (error) {
    return apiFailure(error);
  }
}

export async function PATCH(request: NextRequest, ctx: Context) {
  try {
    const user = await requirePermission('medicine:write');
    const id = parseInput(idSchema, (await ctx.params).id);
    const input = parseInput(updateMedicineSchema, await parseJsonBody(request));
    return apiSuccess(await updateMedicine(user.id, id, input));
  } catch (error) {
    return apiFailure(error);
  }
}

export async function DELETE(_request: NextRequest, ctx: Context) {
  try {
    const user = await requirePermission('medicine:write');
    const id = parseInput(idSchema, (await ctx.params).id);
    return apiSuccess(await softDeleteMedicine(user.id, id));
  } catch (error) {
    return apiFailure(error);
  }
}
