import type { NextRequest } from 'next/server';
import { apiFailure, apiSuccess } from '@/lib/api-response';
import { claimSmsMessages, recordWorkerHeartbeat } from '@/lib/sms-outbox';
import { requireWorkerToken } from '@/lib/worker-auth';

export async function POST(request: NextRequest) {
  try {
    requireWorkerToken(request);
    await recordWorkerHeartbeat();
    return apiSuccess(await claimSmsMessages());
  } catch (error) {
    return apiFailure(error);
  }
}
