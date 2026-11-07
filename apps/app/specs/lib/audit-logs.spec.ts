/** @jest-environment node */
import { listAuditLogs } from '../../src/lib/audit-logs';
import { prisma } from '../../src/lib/prisma';

jest.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: jest.fn(),
    auditLog: { findMany: jest.fn(), count: jest.fn() },
    user: { findMany: jest.fn() },
  },
}));

const mockedPrisma = prisma as unknown as {
  $transaction: jest.Mock;
  auditLog: { findMany: jest.Mock; count: jest.Mock };
  user: { findMany: jest.Mock };
};

const ACTOR_A = '3f2b7c1e-8a4d-4e6f-9b1a-2c3d4e5f6a7b';
const ACTOR_B = '4a3c8d2f-9b5e-4f7a-8c2b-3d4e5f6a7b8c';
const ENTITY_ID = '5b4d9e3a-ac6f-4a8b-9d3c-4e5f6a7b8c9d';

const PAGING = { page: 1, pageSize: 20 };
const CREATED_AT = new Date('2026-11-06T01:02:03.000Z');

const row = (id: string, actorId: string | null) => ({
  id,
  entityType: 'medicines',
  entityId: ENTITY_ID,
  action: 'updated',
  changes: { before: { name: 'A' }, after: { name: 'B' } },
  actorId,
  createdAt: CREATED_AT,
});

const mockPage = (rows: ReturnType<typeof row>[], total = rows.length) => {
  mockedPrisma.$transaction.mockResolvedValue([rows, total]);
};

describe('listAuditLogs', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockedPrisma.user.findMany.mockResolvedValue([]);
  });

  it('sorts newest first, then by id, and pages the results', async () => {
    mockPage([]);

    await listAuditLogs({ page: 3, pageSize: 10 });

    expect(mockedPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: 20,
        take: 10,
      }),
    );
  });

  it('applies every filter to both the page and the total', async () => {
    mockPage([]);
    const from = new Date('2026-11-01T00:00:00.000Z');
    const to = new Date('2026-11-02T00:00:00.000Z');

    await listAuditLogs({
      ...PAGING,
      entityType: 'medicines',
      entityId: ENTITY_ID,
      action: 'created',
      actorId: ACTOR_A,
      from,
      to,
    });

    const where = {
      entityType: 'medicines',
      entityId: ENTITY_ID,
      action: 'created',
      actorId: ACTOR_A,
      createdAt: { gte: from, lt: to },
    };
    expect(mockedPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where }),
    );
    expect(mockedPrisma.auditLog.count).toHaveBeenCalledWith({ where });
  });

  it('leaves absent filters undefined, so Prisma ignores them', async () => {
    mockPage([]);

    await listAuditLogs(PAGING);

    expect(mockedPrisma.auditLog.count).toHaveBeenCalledWith({
      where: {
        entityType: undefined,
        entityId: undefined,
        action: undefined,
        actorId: undefined,
        createdAt: { gte: undefined, lt: undefined },
      },
    });
  });

  it('runs one actor query over the distinct actors of the page', async () => {
    mockPage([row('1', ACTOR_A), row('2', ACTOR_B), row('3', ACTOR_A)]);
    mockedPrisma.user.findMany.mockResolvedValue([
      { id: ACTOR_A, username: 'alice' },
      { id: ACTOR_B, username: 'bob' },
    ]);

    const result = await listAuditLogs(PAGING);

    expect(mockedPrisma.user.findMany).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.user.findMany).toHaveBeenCalledWith({
      where: { id: { in: [ACTOR_A, ACTOR_B] } },
      select: { id: true, username: true },
    });
    expect(result.items.map((item) => item.actor?.username)).toEqual([
      'alice',
      'bob',
      'alice',
    ]);
  });

  it('returns a null actor for a NULL actor_id', async () => {
    mockPage([row('1', null), row('2', ACTOR_A)]);
    mockedPrisma.user.findMany.mockResolvedValue([
      { id: ACTOR_A, username: 'alice' },
    ]);

    const result = await listAuditLogs(PAGING);

    expect(mockedPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: [ACTOR_A] } } }),
    );
    expect(result.items[0].actor).toBeNull();
    expect(result.items[1].actor).toEqual({ id: ACTOR_A, username: 'alice' });
  });

  it('skips the actor query when no row has an actor', async () => {
    mockPage([row('1', null)]);

    await listAuditLogs(PAGING);

    expect(mockedPrisma.user.findMany).not.toHaveBeenCalled();
  });

  it('returns the documented format, with changes as stored', async () => {
    mockPage([row('1', null)], 41);

    await expect(listAuditLogs({ page: 2, pageSize: 1 })).resolves.toEqual({
      items: [
        {
          id: '1',
          entityType: 'medicines',
          entityId: ENTITY_ID,
          action: 'updated',
          changes: { before: { name: 'A' }, after: { name: 'B' } },
          actor: null,
          createdAt: '2026-11-06T01:02:03.000Z',
        },
      ],
      total: 41,
      page: 2,
      pageSize: 1,
    });
  });
});
