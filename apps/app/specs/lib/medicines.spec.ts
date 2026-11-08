/** @jest-environment node */
import { Prisma } from '../../src/generated/prisma/client';
import {
  createMedicine,
  findByBarcode,
  getBatchLabel,
  softDeleteMedicine,
  updateMedicine,
} from '../../src/lib/medicines';
import { prisma } from '../../src/lib/prisma';

jest.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: jest.fn(),
    setting: { findUniqueOrThrow: jest.fn() },
    medicine: { findFirst: jest.fn() },
    medicineBatch: { findFirst: jest.fn() },
  },
}));

const prismaMock = prisma as unknown as {
  $transaction: jest.Mock;
  setting: { findUniqueOrThrow: jest.Mock };
  medicine: { findFirst: jest.Mock };
  medicineBatch: { findFirst: jest.Mock };
};

const tx = {
  $executeRaw: jest.fn(),
  $queryRaw: jest.fn(),
  medicine: { create: jest.fn(), update: jest.fn() },
  medicineBatch: { aggregate: jest.fn() },
};

const AT = new Date('2026-11-08T02:00:00.000Z');
const MEDICINE_ID = '3f2b7c1e-8a4d-4e6f-9b1a-2c3d4e5f6a7b';

const medicineRow = {
  id: MEDICINE_ID,
  name: 'Paracetamol',
  genericName: 'paracetamol',
  strength: '500 mg',
  dosageForm: 'tablet',
  unit: 'pc',
  barcode: 'MED-7Q2K0000AAAA',
  productBarcode: '4800123456789',
  createdById: 'user-1',
  createdAt: AT,
  updatedAt: AT,
  deletedAt: null,
};

const batchRow = {
  id: 'batch-1',
  medicineId: MEDICINE_ID,
  batchNumber: 'P778',
  barcode: 'BAT-91XZ4KD0Q7M2',
  expirationDate: new Date('2026-11-12T00:00:00.000Z'),
  quantity: 150,
  receivedAt: AT,
  createdAt: AT,
  updatedAt: AT,
};

function uniqueViolation(index: string) {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '7',
    meta: { driverAdapterError: { cause: { constraint: { index } } } },
  });
}

beforeEach(() => {
  jest.resetAllMocks();
  prismaMock.$transaction.mockImplementation((fn: (client: typeof tx) => unknown) => fn(tx));
  prismaMock.setting.findUniqueOrThrow.mockResolvedValue({
    timezone: 'Asia/Manila',
    nearExpiryThresholdDays: 30,
  });
  tx.$queryRaw.mockResolvedValue([]);
  tx.medicineBatch.aggregate.mockResolvedValue({ _sum: { quantity: 0 } });
});

describe('getBatchLabel', () => {
  it('returns the label of a batch of an active medicine', async () => {
    prismaMock.medicineBatch.findFirst.mockResolvedValue({
      ...batchRow,
      medicine: { name: 'Paracetamol', strength: '500 mg' },
    });

    await expect(getBatchLabel('batch-1')).resolves.toEqual({
      medicineName: 'Paracetamol',
      strength: '500 mg',
      batchNumber: 'P778',
      expirationDate: '2026-11-12',
      barcode: 'BAT-91XZ4KD0Q7M2',
    });
    expect(prismaMock.medicineBatch.findFirst.mock.calls[0][0].where).toEqual({
      id: 'batch-1',
      medicine: { deletedAt: null },
    });
  });

  it('fails with NOT_FOUND for a missing batch or a deleted medicine', async () => {
    prismaMock.medicineBatch.findFirst.mockResolvedValue(null);

    await expect(getBatchLabel('batch-1')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('findByBarcode', () => {
  function mockMedicine() {
    prismaMock.medicine.findFirst
      .mockResolvedValueOnce({ id: MEDICINE_ID })
      .mockResolvedValueOnce({ ...medicineRow, batches: [batchRow] });
  }

  it('finds a medicine by its MED- barcode', async () => {
    mockMedicine();

    const result = await findByBarcode('MED-7Q2K0000AAAA');

    expect(result.kind).toBe('medicine');
    expect(result.medicine.batches).toHaveLength(1);
    expect(prismaMock.medicine.findFirst.mock.calls[0][0].where).toEqual({
      barcode: 'MED-7Q2K0000AAAA',
      deletedAt: null,
    });
  });

  it('finds a batch and its medicine by a BAT- barcode', async () => {
    prismaMock.medicineBatch.findFirst.mockResolvedValue({
      id: 'batch-1',
      medicineId: MEDICINE_ID,
    });
    prismaMock.medicine.findFirst.mockResolvedValue({ ...medicineRow, batches: [batchRow] });

    const result = await findByBarcode('BAT-91XZ4KD0Q7M2');

    expect(result).toMatchObject({ kind: 'batch', batchId: 'batch-1' });
    expect(result.medicine.id).toBe(MEDICINE_ID);
    expect(prismaMock.medicineBatch.findFirst.mock.calls[0][0].where).toEqual({
      barcode: 'BAT-91XZ4KD0Q7M2',
      medicine: { deletedAt: null },
    });
  });

  it('finds a product code and its UPC-A / EAN-13 twin', async () => {
    mockMedicine();

    const result = await findByBarcode('012345678905');

    expect(result.kind).toBe('product');
    expect(prismaMock.medicine.findFirst.mock.calls[0][0].where).toEqual({
      productBarcode: { in: ['012345678905', '0012345678905'] },
      deletedAt: null,
    });
  });

  it.each([['MED-7Q2K0000AAAA'], ['4800123456789']])(
    'fails with NOT_FOUND for an unknown or deleted %s',
    async (code) => {
      prismaMock.medicine.findFirst.mockResolvedValue(null);

      await expect(findByBarcode(code)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    },
  );

  it('fails with NOT_FOUND for an unknown batch', async () => {
    prismaMock.medicineBatch.findFirst.mockResolvedValue(null);

    await expect(findByBarcode('BAT-91XZ4KD0Q7M2')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('product barcode writes', () => {
  it('reports a product barcode clash on create as PRODUCT_BARCODE_DUPLICATE', async () => {
    tx.medicine.create.mockRejectedValue(uniqueViolation('medicines_product_barcode_key'));

    await expect(
      createMedicine('user-1', { name: 'Paracetamol', unit: 'pc', productBarcode: '4800123456789' }),
    ).rejects.toMatchObject({
      status: 409,
      code: 'PRODUCT_BARCODE_DUPLICATE',
      fields: { productBarcode: ['Another medicine already has this product barcode.'] },
    });
  });

  it('reports a product barcode clash on update', async () => {
    tx.$queryRaw.mockResolvedValueOnce([{ name: 'Paracetamol', strength: null, dosage_form: null }]);
    tx.medicine.update.mockRejectedValue(uniqueViolation('medicines_product_barcode_key'));

    await expect(
      updateMedicine('user-1', MEDICINE_ID, { productBarcode: '4800123456789' }),
    ).rejects.toMatchObject({ code: 'PRODUCT_BARCODE_DUPLICATE' });
  });

  it('rethrows other unique violations', async () => {
    const error = uniqueViolation('medicines_barcode_key');
    tx.medicine.create.mockRejectedValue(error);

    await expect(createMedicine('user-1', { name: 'Paracetamol', unit: 'pc' })).rejects.toBe(error);
  });

  it('clears the product barcode on soft delete', async () => {
    tx.$queryRaw.mockResolvedValueOnce([{ name: 'Paracetamol', strength: null, dosage_form: null }]);

    await softDeleteMedicine('user-1', MEDICINE_ID);

    expect(tx.medicine.update).toHaveBeenCalledWith({
      where: { id: MEDICINE_ID },
      data: { deletedAt: expect.any(Date), productBarcode: null },
    });
  });
});
