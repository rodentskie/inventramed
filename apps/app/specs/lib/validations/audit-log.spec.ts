import { auditLogListQuerySchema } from '../../../src/lib/validations/audit-log';

const ID = '3f2b7c1e-8a4d-4e6f-9b1a-2c3d4e5f6a7b';

describe('auditLogListQuerySchema', () => {
  it('applies the paging defaults', () => {
    expect(auditLogListQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
    });
  });

  it('coerces paging values from the query string', () => {
    expect(
      auditLogListQuerySchema.parse({ page: '3', pageSize: '100' }),
    ).toEqual({ page: 3, pageSize: 100 });
  });

  it.each([
    { page: '0' },
    { page: '-1' },
    { page: '1.5' },
    { page: 'abc' },
    { pageSize: '0' },
    { pageSize: '101' },
  ])('rejects paging of %j', (query) => {
    expect(auditLogListQuerySchema.safeParse(query).success).toBe(false);
  });

  it.each([
    'medicines',
    'medicine_batches',
    'inventory_transactions',
    'inventory_entries',
  ])('accepts an entityType of %s', (entityType) => {
    expect(auditLogListQuerySchema.safeParse({ entityType }).success).toBe(true);
  });

  it.each(['users', 'settings', 'MEDICINES', ''])(
    'rejects an entityType of "%s"',
    (entityType) => {
      expect(auditLogListQuerySchema.safeParse({ entityType }).success).toBe(
        false,
      );
    },
  );

  it.each(['created', 'updated', 'deleted'])(
    'accepts an action of %s',
    (action) => {
      expect(auditLogListQuerySchema.safeParse({ action }).success).toBe(true);
    },
  );

  it('rejects an unknown action', () => {
    expect(auditLogListQuerySchema.safeParse({ action: 'read' }).success).toBe(
      false,
    );
  });

  it.each(['entityId', 'actorId'])('validates %s as a UUID', (field) => {
    expect(auditLogListQuerySchema.safeParse({ [field]: ID }).success).toBe(
      true,
    );
    expect(
      auditLogListQuerySchema.safeParse({ [field]: 'not-a-uuid' }).success,
    ).toBe(false);
  });

  it('converts from and to using their offsets', () => {
    const query = auditLogListQuerySchema.parse({
      from: '2026-11-01T00:00:00+08:00',
      to: '2026-11-02T00:00:00Z',
    });

    expect(query.from).toEqual(new Date('2026-10-31T16:00:00.000Z'));
    expect(query.to).toEqual(new Date('2026-11-02T00:00:00.000Z'));
  });

  it.each([
    '2026-11-01T00:00:00',
    '2026-11-01',
    '2026-02-30T00:00:00+08:00',
    '2026-11-01T00:00:00 08:00',
    'yesterday',
  ])('rejects a timestamp of "%s"', (value) => {
    expect(auditLogListQuerySchema.safeParse({ from: value }).success).toBe(
      false,
    );
    expect(auditLogListQuerySchema.safeParse({ to: value }).success).toBe(false);
  });

  it.each([
    ['before', '2026-11-01T00:00:00Z', '2026-10-31T00:00:00Z'],
    ['equal to', '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z'],
    ['the same instant as', '2026-11-01T08:00:00+08:00', '2026-11-01T00:00:00Z'],
  ])('rejects a to %s from', (_name, from, to) => {
    const result = auditLogListQuerySchema.safeParse({ from, to });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(['to']);
  });

  it('compares from and to as instants, not as text', () => {
    expect(
      auditLogListQuerySchema.safeParse({
        from: '2026-11-01T07:00:00+08:00',
        to: '2026-11-01T00:00:00Z',
      }).success,
    ).toBe(true);
  });

  it('rejects unknown fields', () => {
    expect(auditLogListQuerySchema.safeParse({ sort: 'id' }).success).toBe(
      false,
    );
  });
});
