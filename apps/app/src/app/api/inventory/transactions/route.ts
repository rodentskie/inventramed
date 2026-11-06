import type { NextRequest } from 'next/server';
import { apiFailure, apiSuccess, parseInput } from '@/lib/api-response';
import { requirePermission } from '@/lib/auth';
import { listTransactions } from '@/lib/inventory';
import { transactionListQuerySchema } from '@/lib/validations/inventory';

export async function GET(request: NextRequest) {
  try {
    await requirePermission('inventory:read');
    const query = parseInput(
      transactionListQuerySchema,
      Object.fromEntries(request.nextUrl.searchParams),
    );
    return apiSuccess(await listTransactions(query));
  } catch (error) {
    return apiFailure(error);
  }
}
