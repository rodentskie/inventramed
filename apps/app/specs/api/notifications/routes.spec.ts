/** @jest-environment node */
import { NextRequest } from 'next/server';
import { POST as readRoute } from '../../../src/app/api/notifications/[id]/read/route';
import { GET as getRoute } from '../../../src/app/api/notifications/[id]/route';
import { GET as listRoute } from '../../../src/app/api/notifications/route';
import { ApiError, notFound } from '../../../src/lib/api-response';
import { requirePermission } from '../../../src/lib/auth';
import * as notifications from '../../../src/lib/notifications';

jest.mock('@/lib/auth', () => ({ requirePermission: jest.fn() }));
jest.mock('@/lib/notifications', () => ({
  listNotifications: jest.fn(),
  getNotification: jest.fn(),
  markNotificationRead: jest.fn(),
}));

const permissionMock = requirePermission as jest.Mock;
const mocked = notifications as jest.Mocked<typeof notifications>;

const USER_ID = 'user-1';
const ID = '3f2b7c1e-8a4d-4e6f-9b1a-2c3d4e5f6a7b';
const URL_BASE = 'http://localhost/api/notifications';

const ctx = (id = ID) => ({ params: Promise.resolve({ id }) });
const get = (query = '') => new NextRequest(`${URL_BASE}${query}`);
const post = () => new NextRequest(URL_BASE, { method: 'POST' });

const routes: [string, () => Promise<Response>][] = [
  ['GET list', () => listRoute(get())],
  ['GET one', () => getRoute(get(), ctx())],
  ['POST read', () => readRoute(post(), ctx())],
];

describe('notification routes', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    permissionMock.mockResolvedValue({ id: USER_ID });
  });

  describe.each(routes)('%s', (_name, call) => {
    it('checks notification:read', async () => {
      await call();

      expect(permissionMock).toHaveBeenCalledWith('notification:read');
    });

    it('returns 401 without a session', async () => {
      permissionMock.mockRejectedValue(
        new ApiError(401, 'UNAUTHENTICATED', 'You must be logged in.'),
      );

      const response = await call();

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({
        success: false,
        error: { code: 'UNAUTHENTICATED', message: 'You must be logged in.' },
      });
    });

    it('returns 403 and calls no data functions without permission', async () => {
      permissionMock.mockRejectedValue(
        new ApiError(403, 'FORBIDDEN', 'No permission.'),
      );

      expect((await call()).status).toBe(403);
      [
        mocked.listNotifications,
        mocked.getNotification,
        mocked.markNotificationRead,
      ].forEach((fn) => {
        expect(fn).not.toHaveBeenCalled();
      });
    });
  });

  describe('GET /api/notifications', () => {
    it('applies the default page and page size', async () => {
      const list = {
        items: [],
        total: 0,
        unreadCount: 0,
        page: 1,
        pageSize: 20,
      };
      mocked.listNotifications.mockResolvedValue(list);

      const response = await listRoute(get());

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        success: true,
        data: list,
      });
      expect(mocked.listNotifications).toHaveBeenCalledWith(USER_ID, {
        page: 1,
        pageSize: 20,
      });
    });

    it('accepts a page size of 100', async () => {
      await listRoute(get('?page=3&pageSize=100'));

      expect(mocked.listNotifications).toHaveBeenCalledWith(USER_ID, {
        page: 3,
        pageSize: 100,
      });
    });

    it.each(['?page=0', '?page=x', '?pageSize=0', '?pageSize=101', '?other=1'])(
      'returns 400 and generates nothing for %s',
      async (query) => {
        const response = await listRoute(get(query));

        expect(response.status).toBe(400);
        expect((await response.json()).error.code).toBe('VALIDATION_ERROR');
        expect(mocked.listNotifications).not.toHaveBeenCalled();
      },
    );
  });

  describe('GET /api/notifications/:id', () => {
    it('returns the digest for the caller', async () => {
      const detail = {
        id: ID,
        notificationDate: '2026-11-05',
        expiredCount: 0,
        nearExpiryCount: 1,
        isRead: false,
        createdAt: '2026-11-05T01:00:00.000Z',
        items: [],
      };
      mocked.getNotification.mockResolvedValue(detail);

      const response = await getRoute(get(), ctx());

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        success: true,
        data: detail,
      });
      expect(mocked.getNotification).toHaveBeenCalledWith(USER_ID, ID);
    });

    it('returns 400 for an invalid ID', async () => {
      const response = await getRoute(get(), ctx('bad'));

      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 404 for an unknown or empty digest', async () => {
      mocked.getNotification.mockRejectedValue(notFound());

      const response = await getRoute(get(), ctx());

      expect(response.status).toBe(404);
      expect((await response.json()).error.code).toBe('NOT_FOUND');
    });
  });

  describe('POST /api/notifications/:id/read', () => {
    it('returns 200 with the read time', async () => {
      const result = { id: ID, readAt: '2026-11-05T01:00:00.000Z' };
      mocked.markNotificationRead.mockResolvedValue(result);

      const response = await readRoute(post(), ctx());

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        success: true,
        data: result,
      });
      expect(mocked.markNotificationRead).toHaveBeenCalledWith(USER_ID, ID);
    });

    it('returns 400 for an invalid ID', async () => {
      const response = await readRoute(post(), ctx('bad'));

      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 404 for an unknown or empty digest', async () => {
      mocked.markNotificationRead.mockRejectedValue(notFound());

      const response = await readRoute(post(), ctx());

      expect(response.status).toBe(404);
      expect((await response.json()).error.code).toBe('NOT_FOUND');
    });
  });
});
