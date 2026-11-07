/** @jest-environment node */
import { NextRequest } from 'next/server';
import * as route from '../../../src/app/api/audit-logs/route';
import { ApiError } from '../../../src/lib/api-response';
import { listAuditLogs } from '../../../src/lib/audit-logs';
import { requirePermission } from '../../../src/lib/auth';

jest.mock('@/lib/auth', () => ({ requirePermission: jest.fn() }));
jest.mock('@/lib/audit-logs', () => ({ listAuditLogs: jest.fn() }));

const permissionMock = requirePermission as jest.Mock;
const listMock = listAuditLogs as jest.Mock;

const get = (query = '') =>
  route.GET(new NextRequest(`http://localhost/api/audit-logs${query}`));

describe('GET /api/audit-logs', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    permissionMock.mockResolvedValue({ id: 'user-1' });
  });

  it('returns 401 without a session', async () => {
    permissionMock.mockRejectedValue(
      new ApiError(401, 'UNAUTHENTICATED', 'You must be logged in.'),
    );

    const response = await get();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: { code: 'UNAUTHENTICATED' },
    });
    expect(listMock).not.toHaveBeenCalled();
  });

  it('returns 403 without audit:read', async () => {
    permissionMock.mockRejectedValue(
      new ApiError(403, 'FORBIDDEN', 'You do not have permission to do this.'),
    );

    const response = await get();

    expect(permissionMock).toHaveBeenCalledWith('audit:read');
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: { code: 'FORBIDDEN' },
    });
    expect(listMock).not.toHaveBeenCalled();
  });

  it.each([
    ['entityType', '?entityType=users'],
    ['entityId', '?entityId=nope'],
    ['action', '?action=read'],
    ['actorId', '?actorId=nope'],
    ['from', '?from=2026-11-01'],
    ['pageSize', '?pageSize=101'],
    ['sort', '?sort=id'],
    [
      'to',
      '?from=2026-11-02T00:00:00Z&to=2026-11-01T00:00:00Z',
    ],
  ])('returns 400 for an invalid %s', async (field, query) => {
    const response = await get(query);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.fields).toHaveProperty(field);
    expect(listMock).not.toHaveBeenCalled();
  });

  it('rejects an unencoded + in an offset, which a query string reads as a space', async () => {
    const response = await get('?from=2026-11-01T00:00:00+08:00');

    expect(response.status).toBe(400);
  });

  it('passes the parsed query on, with an encoded offset', async () => {
    listMock.mockResolvedValue({ items: [], total: 0, page: 2, pageSize: 5 });

    const response = await get(
      '?action=created&from=2026-11-01T00:00:00%2B08:00&page=2&pageSize=5',
    );

    expect(response.status).toBe(200);
    expect(listMock).toHaveBeenCalledWith({
      action: 'created',
      from: new Date('2026-10-31T16:00:00.000Z'),
      page: 2,
      pageSize: 5,
    });
  });

  it('returns the list in the success format', async () => {
    const list = {
      items: [
        {
          id: '1',
          entityType: 'medicines',
          entityId: '2',
          action: 'created',
          changes: { before: null, after: { name: 'A' } },
          actor: null,
          createdAt: '2026-11-06T01:02:03.000Z',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    };
    listMock.mockResolvedValue(list);

    const response = await get();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: list,
    });
  });

  it('exposes only GET', () => {
    expect(Object.keys(route)).toEqual(['GET']);
  });
});
