import type { NextRequest } from 'next/server';
import {
  apiFailure,
  apiSuccess,
  parseInput,
  parseJsonBody,
} from '@/lib/api-response';
import { recordSmsResult, recordWorkerHeartbeat } from '@/lib/sms-outbox';
import { idSchema, smsResultSchema } from '@/lib/validations/sms';
import { requireWorkerToken } from '@/lib/worker-auth';

export async function POST(
  request: NextRequest,
  ctx: RouteContext<'/api/worker/sms/[id]/result'>,
) {
  try {
    requireWorkerToken(request);
    await recordWorkerHeartbeat();
    const id = parseInput(idSchema, (await ctx.params).id);
    const input = parseInput(smsResultSchema, await parseJsonBody(request));
    return apiSuccess(await recordSmsResult(id, input));
  } catch (error) {
    return apiFailure(error);
  }
}
