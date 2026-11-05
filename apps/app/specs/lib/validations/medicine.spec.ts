import {
  createMedicineSchema,
  idSchema,
  medicineListQuerySchema,
  receiveStockSchema,
  updateBatchSchema,
  updateMedicineSchema,
} from '../../../src/lib/validations/medicine';

describe('createMedicineSchema', () => {
  it('trims text and defaults the unit', () => {
    expect(createMedicineSchema.parse({ name: '  Paracetamol ' })).toMatchObject({
      name: 'Paracetamol',
      unit: 'pc',
    });
  });

  it('turns blank optional text into null', () => {
    expect(
      createMedicineSchema.parse({ name: 'Paracetamol', strength: '   ' }).strength,
    ).toBeNull();
  });

  it('requires a name', () => {
    expect(createMedicineSchema.safeParse({ name: '  ' }).success).toBe(false);
  });

  it('enforces maximum lengths', () => {
    expect(
      createMedicineSchema.safeParse({ name: 'x'.repeat(201) }).success,
    ).toBe(false);
    expect(
      createMedicineSchema.safeParse({ name: 'x', unit: 'x'.repeat(21) }).success,
    ).toBe(false);
  });

  it('rejects NUL characters', () => {
    expect(createMedicineSchema.safeParse({ name: 'a\u0000b' }).success).toBe(
      false,
    );
  });

  it.each(['barcode', 'deletedAt', 'createdById'])('rejects %s', (field) => {
    expect(
      createMedicineSchema.safeParse({ name: 'x', [field]: 'value' }).success,
    ).toBe(false);
  });
});

describe('updateMedicineSchema', () => {
  it('rejects an empty body', () => {
    expect(updateMedicineSchema.safeParse({}).success).toBe(false);
  });

  it('can clear optional fields', () => {
    expect(updateMedicineSchema.parse({ strength: null }).strength).toBeNull();
  });

  it('leaves absent fields undefined', () => {
    const result = updateMedicineSchema.parse({ name: 'x' });

    expect(result.strength).toBeUndefined();
    expect(result.unit).toBeUndefined();
  });

  it.each(['name', 'unit'])('cannot clear %s', (field) => {
    expect(updateMedicineSchema.safeParse({ [field]: null }).success).toBe(false);
  });

  it('rejects a barcode change', () => {
    expect(updateMedicineSchema.safeParse({ barcode: 'MED-1' }).success).toBe(
      false,
    );
  });
});

describe('receiveStockSchema', () => {
  const valid = {
    batchNumber: 'A123',
    expirationDate: '2027-06-30',
    quantity: 100,
  };

  it('accepts a valid body', () => {
    expect(receiveStockSchema.safeParse(valid).success).toBe(true);
  });

  it('allows a past expiration date', () => {
    expect(
      receiveStockSchema.safeParse({ ...valid, expirationDate: '2020-01-01' })
        .success,
    ).toBe(true);
  });

  it.each([0, -1, 1.5, 1_000_001, '5'])('rejects a quantity of %j', (quantity) => {
    expect(receiveStockSchema.safeParse({ ...valid, quantity }).success).toBe(
      false,
    );
  });

  it.each(['2027-02-30', '30-06-2027', 'tomorrow', ''])(
    'rejects an expiration date of %j',
    (expirationDate) => {
      expect(
        receiveStockSchema.safeParse({ ...valid, expirationDate }).success,
      ).toBe(false);
    },
  );

  it('rejects unknown fields', () => {
    expect(
      receiveStockSchema.safeParse({ ...valid, barcode: 'BAT-1' }).success,
    ).toBe(false);
  });
});

describe('updateBatchSchema', () => {
  it('rejects an empty body', () => {
    expect(updateBatchSchema.safeParse({}).success).toBe(false);
  });

  it('accepts a single field', () => {
    expect(updateBatchSchema.safeParse({ batchNumber: 'B1' }).success).toBe(true);
  });

  it.each(['quantity', 'barcode', 'medicineId', 'receivedAt'])(
    'rejects %s',
    (field) => {
      expect(
        updateBatchSchema.safeParse({ batchNumber: 'B1', [field]: 1 }).success,
      ).toBe(false);
    },
  );
});

describe('medicineListQuerySchema', () => {
  it('applies defaults and coerces numbers', () => {
    expect(medicineListQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(medicineListQuerySchema.parse({ page: '3', pageSize: '50' })).toEqual({
      page: 3,
      pageSize: 50,
    });
  });

  it.each([{ page: '0' }, { page: 'abc' }, { pageSize: '101' }, { sort: 'name' }])(
    'rejects %j',
    (query) => {
      expect(medicineListQuerySchema.safeParse(query).success).toBe(false);
    },
  );
});

describe('idSchema', () => {
  it('accepts a UUID and rejects anything else', () => {
    expect(
      idSchema.safeParse('3f2b7c1e-8a4d-4e6f-9b1a-2c3d4e5f6a7b').success,
    ).toBe(true);
    expect(idSchema.safeParse('not-a-uuid').success).toBe(false);
  });
});
