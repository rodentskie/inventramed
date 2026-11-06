import type { NextRequest } from 'next/server';
import {
  apiFailure,
  apiSuccess,
  parseInput,
  parseJsonBody,
} from '@/lib/api-response';
import { requirePermission } from '@/lib/auth';
import { createEmployee, listEmployees } from '@/lib/employees';
import {
  createEmployeeSchema,
  employeeListQuerySchema,
} from '@/lib/validations/employee';

export async function GET(request: NextRequest) {
  try {
    await requirePermission('employee:manage', 'user:manage');
    const query = parseInput(
      employeeListQuerySchema,
      Object.fromEntries(request.nextUrl.searchParams),
    );
    return apiSuccess(await listEmployees(query));
  } catch (error) {
    return apiFailure(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requirePermission('employee:manage', 'user:manage');
    const input = parseInput(createEmployeeSchema, await parseJsonBody(request));
    return apiSuccess(await createEmployee(input), 201);
  } catch (error) {
    return apiFailure(error);
  }
}
