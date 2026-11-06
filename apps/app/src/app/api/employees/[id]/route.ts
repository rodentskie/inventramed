import type { NextRequest } from 'next/server';
import {
  apiFailure,
  apiSuccess,
  parseInput,
  parseJsonBody,
} from '@/lib/api-response';
import { requirePermission } from '@/lib/auth';
import {
  getEmployee,
  softDeleteEmployee,
  updateEmployee,
} from '@/lib/employees';
import { idSchema } from '@/lib/validations/common';
import { updateEmployeeSchema } from '@/lib/validations/employee';

type Context = RouteContext<'/api/employees/[id]'>;

export async function GET(_request: NextRequest, ctx: Context) {
  try {
    await requirePermission('employee:manage', 'user:manage');
    const id = parseInput(idSchema, (await ctx.params).id);
    return apiSuccess(await getEmployee(id));
  } catch (error) {
    return apiFailure(error);
  }
}

export async function PATCH(request: NextRequest, ctx: Context) {
  try {
    const user = await requirePermission('employee:manage', 'user:manage');
    const id = parseInput(idSchema, (await ctx.params).id);
    const input = parseInput(updateEmployeeSchema, await parseJsonBody(request));
    return apiSuccess(await updateEmployee(user.id, id, input));
  } catch (error) {
    return apiFailure(error);
  }
}

export async function DELETE(_request: NextRequest, ctx: Context) {
  try {
    const user = await requirePermission('employee:manage', 'user:manage');
    const id = parseInput(idSchema, (await ctx.params).id);
    return apiSuccess(await softDeleteEmployee(user.id, id));
  } catch (error) {
    return apiFailure(error);
  }
}
