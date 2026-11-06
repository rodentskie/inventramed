import type { NextRequest } from 'next/server';
import {
  apiFailure,
  apiSuccess,
  parseInput,
  parseJsonBody,
} from '@/lib/api-response';
import { requirePermission } from '@/lib/auth';
import { createEmployee } from '@/lib/employees';
import { createEmployeeSchema } from '@/lib/validations/employee';

export async function POST(request: NextRequest) {
  try {
    await requirePermission('employee:manage', 'user:manage');
    const input = parseInput(createEmployeeSchema, await parseJsonBody(request));
    return apiSuccess(await createEmployee(input), 201);
  } catch (error) {
    return apiFailure(error);
  }
}
