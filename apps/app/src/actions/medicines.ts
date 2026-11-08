'use server';

import { revalidatePath } from 'next/cache';
import { runAction } from '@/lib/action-result';
import { parseInput } from '@/lib/api-response';
import { requirePermission } from '@/lib/auth';
import {
  createMedicine,
  receiveStock,
  softDeleteMedicine,
  updateBatch,
  updateMedicine,
} from '@/lib/medicines';
import {
  createMedicineSchema,
  idSchema,
  receiveStockSchema,
  updateBatchSchema,
  updateMedicineSchema,
} from '@/lib/validations/medicine';
import type { ActionResult } from '@/types/action';
import type { Medicine, MedicineBatch, ReceiveStockResult } from '@/types/medicine';

const LIST_PATH = '/medicines';

function revalidateMedicine(id: string) {
  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${id}`);
}

export async function createMedicineAction(
  input: unknown,
): Promise<ActionResult<Medicine>> {
  return runAction(async () => {
    const user = await requirePermission('medicine:write');
    const medicine = await createMedicine(user.id, parseInput(createMedicineSchema, input));
    revalidatePath(LIST_PATH);
    return medicine;
  });
}

export async function updateMedicineAction(
  medicineId: unknown,
  input: unknown,
): Promise<ActionResult<Medicine>> {
  return runAction(async () => {
    const user = await requirePermission('medicine:write');
    const id = parseInput(idSchema, medicineId);
    const medicine = await updateMedicine(user.id, id, parseInput(updateMedicineSchema, input));
    revalidateMedicine(id);
    return medicine;
  });
}

export async function deleteMedicineAction(
  medicineId: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await requirePermission('medicine:write');
    const id = parseInput(idSchema, medicineId);
    const result = await softDeleteMedicine(user.id, id);
    revalidateMedicine(id);
    return result;
  });
}

export async function receiveStockAction(
  medicineId: unknown,
  input: unknown,
): Promise<ActionResult<ReceiveStockResult>> {
  return runAction(async () => {
    const user = await requirePermission('medicine:write', 'inventory:write');
    const id = parseInput(idSchema, medicineId);
    const result = await receiveStock(user.id, id, parseInput(receiveStockSchema, input));
    revalidateMedicine(id);
    revalidatePath('/');
    revalidatePath('/scan');
    return result;
  });
}

export async function updateBatchAction(
  medicineId: unknown,
  batchId: unknown,
  input: unknown,
): Promise<ActionResult<MedicineBatch>> {
  return runAction(async () => {
    const user = await requirePermission('medicine:write');
    const id = parseInput(idSchema, medicineId);
    const batch = await updateBatch(
      user.id,
      id,
      parseInput(idSchema, batchId),
      parseInput(updateBatchSchema, input),
    );
    revalidateMedicine(id);
    return batch;
  });
}
