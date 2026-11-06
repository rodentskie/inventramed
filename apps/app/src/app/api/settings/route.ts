import type { NextRequest } from 'next/server';
import {
  apiFailure,
  apiSuccess,
  parseInput,
  parseJsonBody,
} from '@/lib/api-response';
import { requirePermission } from '@/lib/auth';
import { getSettings, updateSettings } from '@/lib/settings';
import { updateSettingsSchema } from '@/lib/validations/settings';

export async function GET() {
  try {
    await requirePermission('settings:manage');
    return apiSuccess(await getSettings());
  } catch (error) {
    return apiFailure(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requirePermission('settings:manage');
    const input = parseInput(updateSettingsSchema, await parseJsonBody(request));
    return apiSuccess(await updateSettings(user.id, input));
  } catch (error) {
    return apiFailure(error);
  }
}
