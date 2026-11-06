import { apiFailure, apiSuccess } from '@/lib/api-response';
import { requirePermission } from '@/lib/auth';
import { listRoles } from '@/lib/roles';

export async function GET() {
  try {
    await requirePermission('user:manage');
    return apiSuccess(await listRoles());
  } catch (error) {
    return apiFailure(error);
  }
}
