'use server';

import { revalidatePath } from 'next/cache';
import { runAction } from '@/lib/action-result';
import { parseInput } from '@/lib/api-response';
import { requirePermission } from '@/lib/auth';
import { updateSettings } from '@/lib/settings';
import { updateSettingsSchema } from '@/lib/validations/settings';
import type { ActionResult } from '@/types/action';
import type { Settings } from '@/types/settings';

export async function updateSettingsAction(input: unknown): Promise<ActionResult<Settings>> {
  return runAction(async () => {
    const user = await requirePermission('settings:manage');
    const settings = await updateSettings(user.id, parseInput(updateSettingsSchema, input));
    revalidatePath('/settings');
    revalidatePath('/');
    return settings;
  });
}
