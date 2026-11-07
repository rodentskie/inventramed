import type { NextRequest } from 'next/server';
import { apiFailure, apiSuccess, parseInput } from '@/lib/api-response';
import { listAuditLogs } from '@/lib/audit-logs';
import { requirePermission } from '@/lib/auth';
import { auditLogListQuerySchema } from '@/lib/validations/audit-log';

export async function GET(request: NextRequest) {
  try {
    await requirePermission('audit:read');
    const query = parseInput(
      auditLogListQuerySchema,
      Object.fromEntries(request.nextUrl.searchParams),
    );
    return apiSuccess(await listAuditLogs(query));
  } catch (error) {
    return apiFailure(error);
  }
}
