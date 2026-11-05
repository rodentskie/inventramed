import type { NextRequest } from 'next/server';
import {
  apiFailure,
  apiSuccess,
  parseInput,
  parseJsonBody,
} from '@/lib/api-response';
import { requirePermission } from '@/lib/auth';
import { createMedicine, listMedicines } from '@/lib/medicines';
import {
  createMedicineSchema,
  medicineListQuerySchema,
} from '@/lib/validations/medicine';

export async function GET(request: NextRequest) {
  try {
    await requirePermission('medicine:read');
    const query = parseInput(
      medicineListQuerySchema,
      Object.fromEntries(request.nextUrl.searchParams),
    );
    return apiSuccess(await listMedicines(query));
  } catch (error) {
    return apiFailure(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission('medicine:write');
    const input = parseInput(createMedicineSchema, await parseJsonBody(request));
    return apiSuccess(await createMedicine(user.id, input), 201);
  } catch (error) {
    return apiFailure(error);
  }
}
