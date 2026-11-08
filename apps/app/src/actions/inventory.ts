'use server';

import { revalidatePath } from 'next/cache';
import { runAction } from '@/lib/action-result';
import { parseInput } from '@/lib/api-response';
import { requirePermission } from '@/lib/auth';
import { dispense, disposeExpiredStock, recordBatchMovement } from '@/lib/inventory';
import {
  batchMovementSchema,
  dispenseSchema,
  expiredDisposalSchema,
  idSchema,
} from '@/lib/validations/inventory';
import type { ActionResult } from '@/types/action';
import type { BatchMovementResult, InventoryTransaction } from '@/types/inventory';

function revalidateStock(medicineId: string) {
  revalidatePath('/medicines');
  revalidatePath(`/medicines/${medicineId}`);
  revalidatePath('/');
  revalidatePath('/scan');
}

export async function dispenseAction(
  medicineId: unknown,
  input: unknown,
): Promise<ActionResult<InventoryTransaction>> {
  return runAction(async () => {
    const user = await requirePermission('inventory:write');
    const id = parseInput(idSchema, medicineId);
    const transaction = await dispense(user.id, id, parseInput(dispenseSchema, input));
    revalidateStock(id);
    return transaction;
  });
}

export async function recordMovementAction(
  medicineId: unknown,
  batchId: unknown,
  input: unknown,
): Promise<ActionResult<BatchMovementResult>> {
  return runAction(async () => {
    const user = await requirePermission('inventory:write');
    const id = parseInput(idSchema, medicineId);
    const result = await recordBatchMovement(
      user.id,
      id,
      parseInput(idSchema, batchId),
      parseInput(batchMovementSchema, input),
    );
    revalidateStock(id);
    return result;
  });
}

export async function disposeExpiredAction(
  medicineId: unknown,
  input: unknown,
): Promise<ActionResult<InventoryTransaction>> {
  return runAction(async () => {
    const user = await requirePermission('inventory:write');
    const id = parseInput(idSchema, medicineId);
    const transaction = await disposeExpiredStock(
      user.id,
      id,
      parseInput(expiredDisposalSchema, input),
    );
    revalidateStock(id);
    return transaction;
  });
}
