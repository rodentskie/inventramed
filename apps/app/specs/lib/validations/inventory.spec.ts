import {
  batchMovementSchema,
  dispenseSchema,
  expiredDisposalSchema,
  transactionListQuerySchema,
} from '../../../src/lib/validations/inventory';

const ID = '3f2b7c1e-8a4d-4e6f-9b1a-2c3d4e5f6a7b';

describe('dispenseSchema', () => {
  it('accepts a quantity with optional notes', () => {
    expect(dispenseSchema.safeParse({ quantity: 25 }).success).toBe(true);
    expect(
      dispenseSchema.safeParse({ quantity: 25, notes: 'Ward 3' }).success,
    ).toBe(true);
  });

  it.each([0, -1, 1.5, 1_000_001, '5'])('rejects a quantity of %s', (quantity) => {
    expect(dispenseSchema.safeParse({ quantity }).success).toBe(false);
  });

  it('rejects unknown fields', () => {
    expect(
      dispenseSchema.safeParse({ quantity: 1, batchId: ID }).success,
    ).toBe(false);
  });
});

describe('batchMovementSchema', () => {
  it.each([
    { reason: 'DAMAGED', quantity: 2, notes: 'Dropped' },
    { reason: 'LOST', quantity: 1, notes: 'Missing after audit' },
    { reason: 'RETURNED', direction: 'IN', quantity: 5, notes: 'From ward' },
    { reason: 'RETURNED', direction: 'OUT', quantity: 5, notes: 'To supplier' },
    { reason: 'COUNT_ADJUSTMENT', countedQuantity: 48, notes: 'Monthly count' },
    { reason: 'COUNT_ADJUSTMENT', countedQuantity: 0, notes: 'None left' },
  ])('accepts $reason', (body) => {
    expect(batchMovementSchema.safeParse(body).success).toBe(true);
  });

  it.each(['RECEIVED', 'DISPENSED', 'EXPIRED_DISPOSAL', 'NOPE'])(
    'rejects the reason %s on the reason field',
    (reason) => {
      const result = batchMovementSchema.safeParse({
        reason,
        quantity: 1,
        notes: 'x',
      });

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toEqual(['reason']);
    },
  );

  it.each([
    { reason: 'DAMAGED', quantity: 2 },
    { reason: 'DAMAGED', quantity: 2, notes: '   ' },
    { reason: 'LOST', quantity: 2, notes: null },
    { reason: 'RETURNED', direction: 'IN', quantity: 2 },
    { reason: 'COUNT_ADJUSTMENT', countedQuantity: 2 },
    { reason: 'DAMAGED', quantity: 2, notes: 'x'.repeat(501) },
  ])('requires valid notes: %j', (body) => {
    const result = batchMovementSchema.safeParse(body);

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(['notes']);
  });

  it.each([
    ['direction on DAMAGED', { reason: 'DAMAGED', direction: 'IN', quantity: 1, notes: 'x' }],
    ['no direction on RETURNED', { reason: 'RETURNED', quantity: 1, notes: 'x' }],
    ['quantity on a count', { reason: 'COUNT_ADJUSTMENT', quantity: 1, countedQuantity: 1, notes: 'x' }],
    ['countedQuantity on LOST', { reason: 'LOST', countedQuantity: 1, notes: 'x' }],
    ['a quantity of 0 on DAMAGED', { reason: 'DAMAGED', quantity: 0, notes: 'x' }],
    ['a negative count', { reason: 'COUNT_ADJUSTMENT', countedQuantity: -1, notes: 'x' }],
    ['a count over the limit', { reason: 'COUNT_ADJUSTMENT', countedQuantity: 1_000_001, notes: 'x' }],
    ['an unknown field', { reason: 'LOST', quantity: 1, notes: 'x', extra: true }],
  ])('rejects %s', (_name, body) => {
    expect(batchMovementSchema.safeParse(body).success).toBe(false);
  });
});

describe('expiredDisposalSchema', () => {
  it('accepts an empty body', () => {
    expect(expiredDisposalSchema.parse({})).toEqual({});
  });

  it('removes duplicate batch IDs, whatever their case', () => {
    const { batchIds } = expiredDisposalSchema.parse({
      batchIds: [ID, ID, ID.toUpperCase()],
    });

    expect(batchIds).toEqual([ID]);
  });

  it.each([
    ['an empty list', { batchIds: [] }],
    ['an invalid ID', { batchIds: ['bad'] }],
    ['too many IDs', { batchIds: Array(101).fill(ID) }],
    ['an unknown field', { quantity: 1 }],
  ])('rejects %s', (_name, body) => {
    expect(expiredDisposalSchema.safeParse(body).success).toBe(false);
  });
});

describe('transactionListQuerySchema', () => {
  it('applies the paging defaults', () => {
    expect(transactionListQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
    });
  });

  it('accepts every filter', () => {
    expect(
      transactionListQuerySchema.parse({
        medicineId: ID,
        batchId: ID,
        reason: 'RECEIVED',
        direction: 'OUT',
        page: '2',
        pageSize: '100',
      }),
    ).toEqual({
      medicineId: ID,
      batchId: ID,
      reason: 'RECEIVED',
      direction: 'OUT',
      page: 2,
      pageSize: 100,
    });
  });

  it.each([
    { medicineId: 'bad' },
    { batchId: 'bad' },
    { reason: 'NOPE' },
    { direction: 'SIDEWAYS' },
    { page: '0' },
    { pageSize: '101' },
    { other: 'x' },
  ])('rejects %j', (query) => {
    expect(transactionListQuerySchema.safeParse(query).success).toBe(false);
  });
});
