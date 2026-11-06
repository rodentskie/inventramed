/** @jest-environment node */
import { ApiError } from '../../src/lib/api-response';
import {
  dispense,
  disposeExpiredStock,
  getTransaction,
  listTransactions,
  recordBatchMovement,
} from '../../src/lib/inventory';
import { prisma } from '../../src/lib/prisma';

jest.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: jest.fn(),
    setting: { findUniqueOrThrow: jest.fn() },
    inventoryTransaction: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
    },
  },
}));

const ACTOR_ID = 'actor-user';
const MEDICINE_ID = 'medicine-1';
const BATCH_ID = 'batch-1';
const AT = new Date('2026-11-06T02:00:00.000Z');
const SETTINGS = { timezone: 'Asia/Manila', nearExpiryThresholdDays: 30 };
const MEDICINE_LOCK = [{ name: 'x', strength: null, dosage_form: null }];

const prismaMock = prisma as unknown as {
  $transaction: jest.Mock;
  setting: { findUniqueOrThrow: jest.Mock };
  inventoryTransaction: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    count: jest.Mock;
  };
};

const tx = {
  $executeRaw: jest.fn(),
  $queryRaw: jest.fn(),
  setting: { findUniqueOrThrow: jest.fn() },
  medicineBatch: { findUniqueOrThrow: jest.fn() },
  inventoryTransaction: { create: jest.fn() },
};

const batchRow = {
  id: BATCH_ID,
  medicineId: MEDICINE_ID,
  batchNumber: 'A123',
  barcode: 'BAT-1',
  expirationDate: new Date('2027-06-30T00:00:00.000Z'),
  quantity: 48,
  receivedAt: AT,
  createdAt: AT,
  updatedAt: AT,
};

function transactionRow(data: {
  direction: string;
  reason: string;
  quantity: number;
  notes: string | null;
  entries: { create: { batchId: string; quantity: number }[] };
}) {
  return {
    id: 'transaction-1',
    medicineId: MEDICINE_ID,
    direction: data.direction,
    reason: data.reason,
    quantity: data.quantity,
    notes: data.notes,
    createdAt: AT,
    performedBy: { id: ACTOR_ID, username: 'mreyes' },
    entries: data.entries.create.map((entry, index) => ({
      id: `entry-${index}`,
      batchId: entry.batchId,
      quantity: entry.quantity,
      batch: {
        batchNumber: 'A123',
        expirationDate: new Date('2027-06-30T00:00:00.000Z'),
      },
    })),
  };
}

/** The data passed to the one transaction insert. */
function createdData() {
  expect(tx.inventoryTransaction.create).toHaveBeenCalledTimes(1);
  return tx.inventoryTransaction.create.mock.calls[0][0].data;
}

/** Queues the rows returned by each $queryRaw call, after the medicine lock. */
function lockReturns(...rows: unknown[][]) {
  tx.$queryRaw.mockResolvedValueOnce(MEDICINE_LOCK);
  rows.forEach((row) => tx.$queryRaw.mockResolvedValueOnce(row));
}

async function rejection(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => {
      throw new Error('Expected a rejection');
    },
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(ApiError);
  return error as ApiError;
}

describe('inventory data layer', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers({ now: AT, doNotFake: ['nextTick', 'setImmediate'] });
    prismaMock.$transaction.mockImplementation((fn: (client: typeof tx) => unknown) =>
      fn(tx),
    );
    prismaMock.setting.findUniqueOrThrow.mockResolvedValue(SETTINGS);
    tx.setting.findUniqueOrThrow.mockResolvedValue(SETTINGS);
    tx.medicineBatch.findUniqueOrThrow.mockResolvedValue(batchRow);
    tx.inventoryTransaction.create.mockImplementation(
      ({ data }: { data: Parameters<typeof transactionRow>[0] }) =>
        Promise.resolve(transactionRow(data)),
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('dispense', () => {
    it('allocates across batches and records the total', async () => {
      lockReturns([
        { id: 'early', quantity: 10 },
        { id: 'late', quantity: 30 },
      ]);

      const result = await dispense(ACTOR_ID, MEDICINE_ID, {
        quantity: 25,
        notes: 'Ward 3',
      });

      expect(createdData()).toEqual({
        medicineId: MEDICINE_ID,
        direction: 'OUT',
        reason: 'DISPENSED',
        quantity: 25,
        performedById: ACTOR_ID,
        notes: 'Ward 3',
        entries: {
          create: [
            { batchId: 'early', quantity: 10 },
            { batchId: 'late', quantity: 15 },
          ],
        },
      });
      expect(result).toEqual({
        id: 'transaction-1',
        medicineId: MEDICINE_ID,
        direction: 'OUT',
        reason: 'DISPENSED',
        quantity: 25,
        notes: 'Ward 3',
        performedBy: { id: ACTOR_ID, username: 'mreyes' },
        createdAt: AT.toISOString(),
        entries: [
          {
            id: 'entry-0',
            batchId: 'early',
            batchNumber: 'A123',
            expirationDate: '2027-06-30',
            quantity: 10,
          },
          {
            id: 'entry-1',
            batchId: 'late',
            batchNumber: 'A123',
            expirationDate: '2027-06-30',
            quantity: 15,
          },
        ],
      });
    });

    it('sets the actor and takes the medicine lock before the batches', async () => {
      lockReturns([{ id: 'early', quantity: 10 }]);

      await dispense(ACTOR_ID, MEDICINE_ID, { quantity: 1 });

      expect(tx.$executeRaw.mock.calls[0][1]).toBe(ACTOR_ID);
      expect(tx.$queryRaw.mock.calls[0][0].join('')).toContain('FROM medicines');
      expect(tx.$queryRaw.mock.calls[1][0].join('')).toContain(
        'FROM medicine_batches',
      );
    });

    it('excludes expired batches using the local date', async () => {
      lockReturns([{ id: 'early', quantity: 10 }]);

      await dispense(ACTOR_ID, MEDICINE_ID, { quantity: 1 });

      const [sql, ...values] = tx.$queryRaw.mock.calls[1];
      expect(sql.join('?')).toContain('expiration_date >= ?::date');
      expect(sql.join('?')).toContain(
        'ORDER BY expiration_date, received_at, id',
      );
      expect(values).toContain('2026-11-06');
    });

    it('reads settings through the transaction, not a second connection', async () => {
      lockReturns([{ id: 'early', quantity: 10 }]);

      await dispense(ACTOR_ID, MEDICINE_ID, { quantity: 1 });

      expect(tx.setting.findUniqueOrThrow).toHaveBeenCalled();
      expect(prismaMock.setting.findUniqueOrThrow).not.toHaveBeenCalled();
    });

    it('returns 409 with the available quantity and writes nothing', async () => {
      lockReturns([
        { id: 'early', quantity: 10 },
        { id: 'late', quantity: 2 },
      ]);

      const error = await rejection(
        dispense(ACTOR_ID, MEDICINE_ID, { quantity: 13 }),
      );

      expect(error.status).toBe(409);
      expect(error.code).toBe('INSUFFICIENT_STOCK');
      expect(error.fields?.quantity[0]).toContain('12');
      expect(tx.inventoryTransaction.create).not.toHaveBeenCalled();
    });

    it('returns 404 for a missing or deleted medicine', async () => {
      tx.$queryRaw.mockResolvedValueOnce([]);

      const error = await rejection(
        dispense(ACTOR_ID, MEDICINE_ID, { quantity: 1 }),
      );

      expect(error.status).toBe(404);
      expect(tx.inventoryTransaction.create).not.toHaveBeenCalled();
    });
  });

  describe('recordBatchMovement', () => {
    it.each<[string, Parameters<typeof recordBatchMovement>[3], string, number]>([
      ['DAMAGED', { reason: 'DAMAGED', quantity: 2, notes: 'n' }, 'OUT', 2],
      ['LOST', { reason: 'LOST', quantity: 3, notes: 'n' }, 'OUT', 3],
      [
        'RETURNED to stock',
        { reason: 'RETURNED', direction: 'IN', quantity: 500, notes: 'n' },
        'IN',
        500,
      ],
      [
        'RETURNED to supplier',
        { reason: 'RETURNED', direction: 'OUT', quantity: 4, notes: 'n' },
        'OUT',
        4,
      ],
      [
        'a count above the batch',
        { reason: 'COUNT_ADJUSTMENT', countedQuantity: 60, notes: 'n' },
        'IN',
        12,
      ],
      [
        'a count below the batch',
        { reason: 'COUNT_ADJUSTMENT', countedQuantity: 8, notes: 'n' },
        'OUT',
        40,
      ],
      [
        'a count of 0',
        { reason: 'COUNT_ADJUSTMENT', countedQuantity: 0, notes: 'n' },
        'OUT',
        48,
      ],
    ])('works out direction and quantity for %s', async (_name, input, direction, quantity) => {
      lockReturns([{ id: BATCH_ID, quantity: 48 }]);

      const result = await recordBatchMovement(
        ACTOR_ID,
        MEDICINE_ID,
        BATCH_ID,
        input,
      );

      expect(createdData()).toEqual({
        medicineId: MEDICINE_ID,
        direction,
        reason: input.reason,
        quantity,
        performedById: ACTOR_ID,
        notes: 'n',
        entries: { create: [{ batchId: BATCH_ID, quantity }] },
      });
      expect(result.transaction?.quantity).toBe(quantity);
      expect(result.batch.id).toBe(BATCH_ID);
    });

    it('writes nothing when a count matches', async () => {
      lockReturns([{ id: BATCH_ID, quantity: 48 }]);

      const result = await recordBatchMovement(ACTOR_ID, MEDICINE_ID, BATCH_ID, {
        reason: 'COUNT_ADJUSTMENT',
        countedQuantity: 48,
        notes: 'n',
      });

      expect(result.transaction).toBeNull();
      expect(result.batch.quantity).toBe(48);
      expect(tx.inventoryTransaction.create).not.toHaveBeenCalled();
    });

    it.each<[string, Parameters<typeof recordBatchMovement>[3]]>([
      ['DAMAGED', { reason: 'DAMAGED', quantity: 49, notes: 'n' }],
      ['LOST', { reason: 'LOST', quantity: 49, notes: 'n' }],
      [
        'RETURNED to supplier',
        { reason: 'RETURNED', direction: 'OUT', quantity: 49, notes: 'n' },
      ],
    ])('returns 409 for %s above the batch quantity', async (_name, input) => {
      lockReturns([{ id: BATCH_ID, quantity: 48 }]);

      const error = await rejection(
        recordBatchMovement(ACTOR_ID, MEDICINE_ID, BATCH_ID, input),
      );

      expect(error.code).toBe('INSUFFICIENT_STOCK');
      expect(error.fields?.quantity[0]).toContain('48');
      expect(tx.inventoryTransaction.create).not.toHaveBeenCalled();
    });

    it('allows taking the whole batch', async () => {
      lockReturns([{ id: BATCH_ID, quantity: 48 }]);

      const { transaction } = await recordBatchMovement(
        ACTOR_ID,
        MEDICINE_ID,
        BATCH_ID,
        { reason: 'LOST', quantity: 48, notes: 'n' },
      );

      expect(transaction?.quantity).toBe(48);
    });

    it('returns 404 for a batch under another medicine', async () => {
      lockReturns([]);

      const error = await rejection(
        recordBatchMovement(ACTOR_ID, MEDICINE_ID, BATCH_ID, {
          reason: 'LOST',
          quantity: 1,
          notes: 'n',
        }),
      );

      expect(error.status).toBe(404);
      expect(tx.inventoryTransaction.create).not.toHaveBeenCalled();
    });
  });

  describe('disposeExpiredStock', () => {
    it('removes the whole of every expired batch by default', async () => {
      lockReturns([
        { id: 'one', quantity: 3 },
        { id: 'two', quantity: 4 },
      ]);

      await disposeExpiredStock(ACTOR_ID, MEDICINE_ID, {});

      const [sql, ...values] = tx.$queryRaw.mock.calls[1];
      expect(sql.join('?')).toContain('expiration_date < ?::date');
      expect(values).toContain('2026-11-06');
      expect(createdData()).toEqual({
        medicineId: MEDICINE_ID,
        direction: 'OUT',
        reason: 'EXPIRED_DISPOSAL',
        quantity: 7,
        performedById: ACTOR_ID,
        notes: null,
        entries: {
          create: [
            { batchId: 'one', quantity: 3 },
            { batchId: 'two', quantity: 4 },
          ],
        },
      });
    });

    it('returns 409 NO_EXPIRED_STOCK when nothing has expired', async () => {
      lockReturns([]);

      const error = await rejection(
        disposeExpiredStock(ACTOR_ID, MEDICINE_ID, {}),
      );

      expect(error.status).toBe(409);
      expect(error.code).toBe('NO_EXPIRED_STOCK');
    });

    it('removes only the named batches', async () => {
      lockReturns([{ id: 'one', quantity: 3, expired: true }]);

      await disposeExpiredStock(ACTOR_ID, MEDICINE_ID, {
        batchIds: ['one'],
        notes: 'Contractor',
      });

      expect(tx.$queryRaw.mock.calls[1]).toContainEqual(['one']);
      expect(createdData()).toMatchObject({
        quantity: 3,
        notes: 'Contractor',
        entries: { create: [{ batchId: 'one', quantity: 3 }] },
      });
    });

    it('returns 404 when a named batch belongs to another medicine', async () => {
      lockReturns([{ id: 'one', quantity: 3, expired: true }]);

      const error = await rejection(
        disposeExpiredStock(ACTOR_ID, MEDICINE_ID, {
          batchIds: ['one', 'other'],
        }),
      );

      expect(error.status).toBe(404);
      expect(tx.inventoryTransaction.create).not.toHaveBeenCalled();
    });

    it.each([
      ['is not expired', { id: 'one', quantity: 3, expired: false }],
      ['has no stock', { id: 'one', quantity: 0, expired: true }],
    ])('returns 409 BATCH_NOT_EXPIRED when a named batch %s', async (_name, row) => {
      lockReturns([row]);

      const error = await rejection(
        disposeExpiredStock(ACTOR_ID, MEDICINE_ID, { batchIds: ['one'] }),
      );

      expect(error.status).toBe(409);
      expect(error.code).toBe('BATCH_NOT_EXPIRED');
      expect(tx.inventoryTransaction.create).not.toHaveBeenCalled();
    });
  });

  describe('reads', () => {
    const row = transactionRow({
      direction: 'OUT',
      reason: 'LOST',
      quantity: 1,
      notes: 'n',
      entries: { create: [{ batchId: BATCH_ID, quantity: 1 }] },
    });

    beforeEach(() => {
      prismaMock.$transaction.mockImplementation((queries: unknown[]) =>
        Promise.all(queries),
      );
      prismaMock.inventoryTransaction.findMany.mockResolvedValue([row]);
      prismaMock.inventoryTransaction.count.mockResolvedValue(21);
    });

    it('lists newest first, with paging and entries in one query', async () => {
      const result = await listTransactions({ page: 2, pageSize: 20 });

      const args = prismaMock.inventoryTransaction.findMany.mock.calls[0][0];
      expect(args.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'asc' }]);
      expect(args.skip).toBe(20);
      expect(args.take).toBe(20);
      expect(args.include.entries).toBeDefined();
      expect(args.include.performedBy).toBeDefined();
      expect(result.total).toBe(21);
      expect(result.page).toBe(2);
      expect(result.items[0].entries[0].expirationDate).toBe('2027-06-30');
    });

    it('applies every filter to the rows and the count', async () => {
      await listTransactions({
        medicineId: MEDICINE_ID,
        batchId: BATCH_ID,
        reason: 'LOST',
        direction: 'OUT',
        page: 1,
        pageSize: 20,
      });

      const where = {
        medicineId: MEDICINE_ID,
        reason: 'LOST',
        direction: 'OUT',
        entries: { some: { batchId: BATCH_ID } },
      };
      expect(prismaMock.inventoryTransaction.findMany.mock.calls[0][0].where).toEqual(where);
      expect(prismaMock.inventoryTransaction.count).toHaveBeenCalledWith({ where });
    });

    it('reads one transaction', async () => {
      prismaMock.inventoryTransaction.findUnique.mockResolvedValue(row);

      await expect(getTransaction('transaction-1')).resolves.toMatchObject({
        id: 'transaction-1',
        performedBy: { username: 'mreyes' },
      });
    });

    it('returns 404 for a missing transaction', async () => {
      prismaMock.inventoryTransaction.findUnique.mockResolvedValue(null);

      const error = await rejection(getTransaction('missing'));

      expect(error.status).toBe(404);
    });
  });
});
