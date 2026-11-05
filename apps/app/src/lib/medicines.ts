import 'server-only';
import { Prisma } from '@/generated/prisma/client';
import type {
  Medicine as MedicineRow,
  MedicineBatch as MedicineBatchRow,
} from '@/generated/prisma/client';
import { ApiError, notFound } from '@/lib/api-response';
import { generateBatchBarcode, generateMedicineBarcode } from '@/lib/barcode';
import {
  fromDateString,
  getDaysToExpiry,
  getExpiryStatus,
  getLocalToday,
  toDateString,
} from '@/lib/expiry';
import { prisma } from '@/lib/prisma';
import type {
  CreateMedicineInput,
  MedicineListQuery,
  ReceiveStockInput,
  UpdateBatchInput,
  UpdateMedicineInput,
} from '@/lib/validations/medicine';
import { withActor } from '@/lib/with-actor';
import type {
  Medicine,
  MedicineBatch,
  MedicineDetail,
  MedicineList,
  ReceiveStockResult,
} from '@/types/medicine';

type Tx = Prisma.TransactionClient;

interface ExpiryContext {
  today: string;
  threshold: number;
}

interface DuplicateKey {
  name: string;
  strength: string | null;
  dosageForm: string | null;
}

async function getExpiryContext(): Promise<ExpiryContext> {
  const settings = await prisma.setting.findUniqueOrThrow({
    where: { id: 1 },
    select: { timezone: true, nearExpiryThresholdDays: true },
  });
  return {
    today: getLocalToday(settings.timezone),
    threshold: settings.nearExpiryThresholdDays,
  };
}

function toMedicine(row: MedicineRow, totalStock: number): Medicine {
  return {
    id: row.id,
    name: row.name,
    genericName: row.genericName,
    strength: row.strength,
    dosageForm: row.dosageForm,
    unit: row.unit,
    barcode: row.barcode,
    totalStock,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toBatch(row: MedicineBatchRow, context: ExpiryContext): MedicineBatch {
  const expirationDate = toDateString(row.expirationDate);
  return {
    id: row.id,
    medicineId: row.medicineId,
    batchNumber: row.batchNumber,
    barcode: row.barcode,
    expirationDate,
    quantity: row.quantity,
    status: getExpiryStatus(expirationDate, context.today, context.threshold),
    daysToExpiry: getDaysToExpiry(expirationDate, context.today),
    receivedAt: row.receivedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function getTotalStock(client: Tx, medicineId: string): Promise<number> {
  const result = await client.medicineBatch.aggregate({
    where: { medicineId },
    _sum: { quantity: true },
  });
  return result._sum.quantity ?? 0;
}

/**
 * Locks an active medicine's row until the transaction ends, so deletes, edits
 * and stock receipts on the same medicine can't overlap.
 */
async function lockActiveMedicine(tx: Tx, id: string): Promise<DuplicateKey> {
  const rows = await tx.$queryRaw<
    { name: string; strength: string | null; dosage_form: string | null }[]
  >`SELECT name, strength, dosage_form FROM medicines
     WHERE id = ${id}::uuid AND deleted_at IS NULL
     FOR UPDATE`;
  const row = rows[0];
  if (!row) {
    throw notFound();
  }
  return { name: row.name, strength: row.strength, dosageForm: row.dosage_form };
}

/** Takes a lock on the key first, because a check alone would let concurrent requests race. */
async function assertNotDuplicate(
  tx: Tx,
  key: DuplicateKey,
  excludeId: string | null,
): Promise<void> {
  const lockKey = JSON.stringify([
    key.name,
    key.strength,
    key.dosageForm,
  ]).toLowerCase();
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}::text, 0))`;

  const duplicates = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM medicines
     WHERE deleted_at IS NULL
       AND lower(name) = lower(${key.name}::text)
       AND lower(strength) IS NOT DISTINCT FROM lower(${key.strength}::text)
       AND lower(dosage_form) IS NOT DISTINCT FROM lower(${key.dosageForm}::text)
       AND (${excludeId}::uuid IS NULL OR id <> ${excludeId}::uuid)
     LIMIT 1`;

  if (duplicates.length > 0) {
    throw new ApiError(
      409,
      'MEDICINE_DUPLICATE',
      'A medicine with this name, strength and dosage form already exists.',
    );
  }
}

/** Escapes LIKE wildcards so `search` matches them literally. */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

export async function listMedicines({
  search,
  page,
  pageSize,
}: MedicineListQuery): Promise<MedicineList> {
  const pattern = search ? escapeLikePattern(search) : undefined;
  const where: Prisma.MedicineWhereInput = {
    deletedAt: null,
    ...(pattern && {
      OR: [
        { name: { contains: pattern, mode: 'insensitive' } },
        { genericName: { contains: pattern, mode: 'insensitive' } },
      ],
    }),
  };

  const [rows, total] = await prisma.$transaction([
    prisma.medicine.findMany({
      where,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.medicine.count({ where }),
  ]);

  const stock = await prisma.medicineBatch.groupBy({
    by: ['medicineId'],
    where: { medicineId: { in: rows.map((row) => row.id) } },
    _sum: { quantity: true },
  });
  const stockByMedicine = new Map(
    stock.map((group) => [group.medicineId, group._sum.quantity ?? 0]),
  );

  return {
    items: rows.map((row) => toMedicine(row, stockByMedicine.get(row.id) ?? 0)),
    total,
    page,
    pageSize,
  };
}

export async function getMedicine(id: string): Promise<MedicineDetail> {
  const row = await prisma.medicine.findFirst({
    where: { id, deletedAt: null },
    include: {
      batches: {
        orderBy: [{ expirationDate: 'asc' }, { receivedAt: 'asc' }, { id: 'asc' }],
      },
    },
  });
  if (!row) {
    throw notFound();
  }

  const context = await getExpiryContext();
  const totalStock = row.batches.reduce((sum, batch) => sum + batch.quantity, 0);
  return {
    ...toMedicine(row, totalStock),
    batches: row.batches.map((batch) => toBatch(batch, context)),
  };
}

export async function createMedicine(
  actorId: string,
  input: CreateMedicineInput,
): Promise<Medicine> {
  return withActor(actorId, async (tx) => {
    await assertNotDuplicate(
      tx,
      {
        name: input.name,
        strength: input.strength ?? null,
        dosageForm: input.dosageForm ?? null,
      },
      null,
    );
    const row = await tx.medicine.create({
      data: {
        ...input,
        barcode: generateMedicineBarcode(),
        createdById: actorId,
      },
    });
    return toMedicine(row, 0);
  });
}

export async function updateMedicine(
  actorId: string,
  id: string,
  input: UpdateMedicineInput,
): Promise<Medicine> {
  return withActor(actorId, async (tx) => {
    const current = await lockActiveMedicine(tx, id);
    const merged: DuplicateKey = {
      name: input.name ?? current.name,
      strength: input.strength === undefined ? current.strength : input.strength,
      dosageForm:
        input.dosageForm === undefined ? current.dosageForm : input.dosageForm,
    };

    const keyChanged =
      merged.name !== current.name ||
      merged.strength !== current.strength ||
      merged.dosageForm !== current.dosageForm;
    if (keyChanged) {
      await assertNotDuplicate(tx, merged, id);
    }

    const row = await tx.medicine.update({ where: { id }, data: input });
    return toMedicine(row, await getTotalStock(tx, id));
  });
}

export async function softDeleteMedicine(
  actorId: string,
  id: string,
): Promise<{ id: string }> {
  return withActor(actorId, async (tx) => {
    await lockActiveMedicine(tx, id);
    if ((await getTotalStock(tx, id)) > 0) {
      throw new ApiError(
        409,
        'MEDICINE_HAS_STOCK',
        'This medicine still has stock and cannot be deleted.',
      );
    }
    await tx.medicine.update({ where: { id }, data: { deletedAt: new Date() } });
    return { id };
  });
}

export async function receiveStock(
  actorId: string,
  medicineId: string,
  input: ReceiveStockInput,
): Promise<ReceiveStockResult> {
  const expirationDate = fromDateString(input.expirationDate);

  const { row, created } = await withActor(actorId, async (tx) => {
    await lockActiveMedicine(tx, medicineId);

    const existing = await tx.medicineBatch.findUnique({
      where: {
        medicineId_batchNumber_expirationDate: {
          medicineId,
          batchNumber: input.batchNumber,
          expirationDate,
        },
      },
      select: { id: true },
    });
    const batchId =
      existing?.id ??
      (
        await tx.medicineBatch.create({
          data: {
            medicineId,
            batchNumber: input.batchNumber,
            expirationDate,
            barcode: generateBatchBarcode(),
          },
          select: { id: true },
        })
      ).id;

    const transaction = await tx.inventoryTransaction.create({
      data: {
        medicineId,
        direction: 'IN',
        reason: 'RECEIVED',
        quantity: input.quantity,
        performedById: actorId,
        notes: input.notes ?? null,
      },
      select: { id: true },
    });
    // The inventory_entries_apply trigger updates the batch quantity.
    await tx.inventoryEntry.create({
      data: {
        transactionId: transaction.id,
        batchId,
        quantity: input.quantity,
      },
    });

    return {
      row: await tx.medicineBatch.findUniqueOrThrow({ where: { id: batchId } }),
      created: !existing,
    };
  });

  return { batch: toBatch(row, await getExpiryContext()), created };
}

export async function getBatch(
  medicineId: string,
  batchId: string,
): Promise<MedicineBatch> {
  const row = await prisma.medicineBatch.findFirst({
    where: { id: batchId, medicineId, medicine: { deletedAt: null } },
  });
  if (!row) {
    throw notFound();
  }
  return toBatch(row, await getExpiryContext());
}

export async function updateBatch(
  actorId: string,
  medicineId: string,
  batchId: string,
  input: UpdateBatchInput,
): Promise<MedicineBatch> {
  try {
    const row = await withActor(actorId, async (tx) => {
      await lockActiveMedicine(tx, medicineId);
      const existing = await tx.medicineBatch.findFirst({
        where: { id: batchId, medicineId },
        select: { id: true },
      });
      if (!existing) {
        throw notFound();
      }
      return tx.medicineBatch.update({
        where: { id: batchId },
        data: {
          batchNumber: input.batchNumber,
          expirationDate: input.expirationDate
            ? fromDateString(input.expirationDate)
            : undefined,
        },
      });
    });
    return toBatch(row, await getExpiryContext());
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ApiError(
        409,
        'BATCH_DUPLICATE',
        'Another batch of this medicine has the same number and expiration date.',
      );
    }
    throw error;
  }
}
