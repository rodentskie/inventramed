import 'server-only';
import type { Prisma } from '@/generated/prisma/client';
import { ApiError, notFound } from '@/lib/api-response';
import { toDateString } from '@/lib/expiry';
import { allocateFefo, type FefoAllocation, type FefoBatch } from '@/lib/fefo';
import {
  getExpiryContext,
  lockActiveMedicine,
  toBatch,
} from '@/lib/medicines';
import { prisma } from '@/lib/prisma';
import type {
  BatchMovementInput,
  DispenseInput,
  ExpiredDisposalInput,
  TransactionListQuery,
} from '@/lib/validations/inventory';
import { withActor } from '@/lib/with-actor';
import type {
  BatchMovementResult,
  InventoryDirection,
  InventoryReason,
  InventoryTransaction,
  InventoryTransactionList,
} from '@/types/inventory';

type Tx = Prisma.TransactionClient;

const TRANSACTION_INCLUDE = {
  performedBy: { select: { id: true, username: true } },
  entries: {
    include: {
      batch: { select: { batchNumber: true, expirationDate: true } },
    },
    orderBy: [
      { batch: { expirationDate: 'asc' } },
      { batch: { receivedAt: 'asc' } },
      { batchId: 'asc' },
    ],
  },
} satisfies Prisma.InventoryTransactionInclude;

type TransactionRow = Prisma.InventoryTransactionGetPayload<{
  include: typeof TRANSACTION_INCLUDE;
}>;

interface Movement {
  direction: InventoryDirection;
  quantity: number;
}

interface NewTransaction {
  actorId: string;
  medicineId: string;
  direction: InventoryDirection;
  reason: InventoryReason;
  notes: string | null | undefined;
  allocations: FefoAllocation[];
}

function toTransaction(row: TransactionRow): InventoryTransaction {
  return {
    id: row.id,
    medicineId: row.medicineId,
    direction: row.direction,
    reason: row.reason,
    quantity: row.quantity,
    notes: row.notes,
    performedBy: row.performedBy,
    createdAt: row.createdAt.toISOString(),
    entries: row.entries.map((entry) => ({
      id: entry.id,
      batchId: entry.batchId,
      batchNumber: entry.batch.batchNumber,
      expirationDate: toDateString(entry.batch.expirationDate),
      quantity: entry.quantity,
    })),
  };
}

function insufficientStock(available: number): ApiError {
  return new ApiError(
    409,
    'INSUFFICIENT_STOCK',
    'There is not enough stock for this movement.',
    { quantity: [`Only ${available} available.`] },
  );
}

/**
 * The only place the app writes a movement. The quantity comes from the entries,
 * so the two can't disagree, and the inventory_entries_apply trigger updates each batch.
 */
async function createTransaction(
  tx: Tx,
  { actorId, medicineId, direction, reason, notes, allocations }: NewTransaction,
): Promise<InventoryTransaction> {
  const row = await tx.inventoryTransaction.create({
    data: {
      medicineId,
      direction,
      reason,
      quantity: allocations.reduce((sum, entry) => sum + entry.quantity, 0),
      performedById: actorId,
      notes: notes ?? null,
      entries: {
        create: allocations.map(({ batchId, quantity }) => ({
          batchId,
          quantity,
        })),
      },
    },
    include: TRANSACTION_INCLUDE,
  });
  return toTransaction(row);
}

/** Returns null when a count matches the batch, because there is nothing to record. */
function resolveMovement(
  input: BatchMovementInput,
  currentQuantity: number,
): Movement | null {
  switch (input.reason) {
    case 'COUNT_ADJUSTMENT': {
      const difference = input.countedQuantity - currentQuantity;
      if (difference === 0) {
        return null;
      }
      return {
        direction: difference > 0 ? 'IN' : 'OUT',
        quantity: Math.abs(difference),
      };
    }
    case 'RETURNED':
      return { direction: input.direction, quantity: input.quantity };
    default:
      return { direction: 'OUT', quantity: input.quantity };
  }
}

async function lockBatch(
  tx: Tx,
  medicineId: string,
  batchId: string,
): Promise<FefoBatch> {
  const rows = await tx.$queryRaw<FefoBatch[]>`
    SELECT id, quantity FROM medicine_batches
     WHERE id = ${batchId}::uuid AND medicine_id = ${medicineId}::uuid
     FOR UPDATE`;
  const row = rows[0];
  if (!row) {
    throw notFound();
  }
  return row;
}

function lockUsableBatches(
  tx: Tx,
  medicineId: string,
  today: string,
): Promise<FefoBatch[]> {
  return tx.$queryRaw<FefoBatch[]>`
    SELECT id, quantity FROM medicine_batches
     WHERE medicine_id = ${medicineId}::uuid
       AND quantity > 0
       AND expiration_date >= ${today}::date
     ORDER BY expiration_date, received_at, id
     FOR UPDATE`;
}

function lockExpiredBatches(
  tx: Tx,
  medicineId: string,
  today: string,
): Promise<FefoBatch[]> {
  return tx.$queryRaw<FefoBatch[]>`
    SELECT id, quantity FROM medicine_batches
     WHERE medicine_id = ${medicineId}::uuid
       AND quantity > 0
       AND expiration_date < ${today}::date
     ORDER BY expiration_date, received_at, id
     FOR UPDATE`;
}

async function lockNamedExpiredBatches(
  tx: Tx,
  medicineId: string,
  batchIds: string[],
  today: string,
): Promise<FefoBatch[]> {
  const rows = await tx.$queryRaw<(FefoBatch & { expired: boolean })[]>`
    SELECT id, quantity, expiration_date < ${today}::date AS expired
      FROM medicine_batches
     WHERE medicine_id = ${medicineId}::uuid
       AND id = ANY(${batchIds}::uuid[])
     ORDER BY expiration_date, received_at, id
     FOR UPDATE`;

  if (rows.length !== batchIds.length) {
    throw notFound();
  }
  if (rows.some((row) => !row.expired || row.quantity === 0)) {
    throw new ApiError(
      409,
      'BATCH_NOT_EXPIRED',
      'Only expired batches that still have stock can be disposed of.',
    );
  }
  return rows;
}

export async function dispense(
  actorId: string,
  medicineId: string,
  input: DispenseInput,
): Promise<InventoryTransaction> {
  return withActor(actorId, async (tx) => {
    await lockActiveMedicine(tx, medicineId);
    const { today } = await getExpiryContext(tx);
    const batches = await lockUsableBatches(tx, medicineId, today);

    const allocations = allocateFefo(batches, input.quantity);
    if (!allocations) {
      throw insufficientStock(
        batches.reduce((sum, batch) => sum + batch.quantity, 0),
      );
    }

    return createTransaction(tx, {
      actorId,
      medicineId,
      direction: 'OUT',
      reason: 'DISPENSED',
      notes: input.notes,
      allocations,
    });
  });
}

export async function recordBatchMovement(
  actorId: string,
  medicineId: string,
  batchId: string,
  input: BatchMovementInput,
): Promise<BatchMovementResult> {
  const { transaction, row } = await withActor(actorId, async (tx) => {
    await lockActiveMedicine(tx, medicineId);
    const batch = await lockBatch(tx, medicineId, batchId);

    const movement = resolveMovement(input, batch.quantity);
    if (movement?.direction === 'OUT' && movement.quantity > batch.quantity) {
      throw insufficientStock(batch.quantity);
    }

    return {
      transaction: movement
        ? await createTransaction(tx, {
            actorId,
            medicineId,
            direction: movement.direction,
            reason: input.reason,
            notes: input.notes,
            allocations: [{ batchId, quantity: movement.quantity }],
          })
        : null,
      row: await tx.medicineBatch.findUniqueOrThrow({ where: { id: batchId } }),
    };
  });

  return { transaction, batch: toBatch(row, await getExpiryContext()) };
}

export async function disposeExpiredStock(
  actorId: string,
  medicineId: string,
  input: ExpiredDisposalInput,
): Promise<InventoryTransaction> {
  return withActor(actorId, async (tx) => {
    await lockActiveMedicine(tx, medicineId);
    const { today } = await getExpiryContext(tx);
    const batches = input.batchIds
      ? await lockNamedExpiredBatches(tx, medicineId, input.batchIds, today)
      : await lockExpiredBatches(tx, medicineId, today);

    if (batches.length === 0) {
      throw new ApiError(
        409,
        'NO_EXPIRED_STOCK',
        'This medicine has no expired stock to dispose of.',
      );
    }

    return createTransaction(tx, {
      actorId,
      medicineId,
      direction: 'OUT',
      reason: 'EXPIRED_DISPOSAL',
      notes: input.notes,
      allocations: batches.map(({ id, quantity }) => ({
        batchId: id,
        quantity,
      })),
    });
  });
}

export async function listTransactions({
  medicineId,
  batchId,
  reason,
  direction,
  page,
  pageSize,
}: TransactionListQuery): Promise<InventoryTransactionList> {
  const where: Prisma.InventoryTransactionWhereInput = {
    medicineId,
    reason,
    direction,
    ...(batchId && { entries: { some: { batchId } } }),
  };

  const [rows, total] = await prisma.$transaction([
    prisma.inventoryTransaction.findMany({
      where,
      include: TRANSACTION_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.inventoryTransaction.count({ where }),
  ]);

  return { items: rows.map(toTransaction), total, page, pageSize };
}

export async function getTransaction(id: string): Promise<InventoryTransaction> {
  const row = await prisma.inventoryTransaction.findUnique({
    where: { id },
    include: TRANSACTION_INCLUDE,
  });
  if (!row) {
    throw notFound();
  }
  return toTransaction(row);
}
