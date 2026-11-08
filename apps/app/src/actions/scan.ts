'use server';

import { runAction } from '@/lib/action-result';
import { parseInput } from '@/lib/api-response';
import { requirePermission } from '@/lib/auth';
import { findByBarcode } from '@/lib/medicines';
import { barcodeLookupSchema } from '@/lib/validations/barcode';
import type { ActionResult } from '@/types/action';
import type { ScanResult } from '@/types/medicine';

export async function lookupBarcodeAction(code: unknown): Promise<ActionResult<ScanResult>> {
  return runAction(async () => {
    await requirePermission('medicine:read');
    const input = parseInput(barcodeLookupSchema, { code });
    return findByBarcode(input.code);
  });
}
