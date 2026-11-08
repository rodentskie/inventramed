/** @jest-environment node */
import { revalidatePath } from 'next/cache';
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from '../../src/actions/notifications';
import { ApiError, notFound } from '../../src/lib/api-response';
import { requirePermission } from '../../src/lib/auth';
import {
  markAllNotificationsRead,
  markNotificationRead,
} from '../../src/lib/notifications';

jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('@/lib/auth', () => ({ requirePermission: jest.fn() }));
jest.mock('@/lib/notifications', () => ({
  markNotificationRead: jest.fn(),
  markAllNotificationsRead: jest.fn(),
}));

const permissionMock = requirePermission as jest.Mock;
const revalidateMock = revalidatePath as jest.Mock;
const markMock = markNotificationRead as jest.Mock;
const markAllMock = markAllNotificationsRead as jest.Mock;

const ID = '3f2b7c1e-8a4d-4e6f-9b1a-2c3d4e5f6a7b';
const USER_ID = 'user-1';
const REVALIDATED = [['/notifications'], ['/', 'layout']];

beforeEach(() => {
  jest.resetAllMocks();
  permissionMock.mockResolvedValue({ id: USER_ID });
});

describe('markNotificationReadAction', () => {
  it('marks the digest read for the current user and revalidates', async () => {
    const data = { id: ID, readAt: '2026-11-08T00:00:00.000Z' };
    markMock.mockResolvedValue(data);

    await expect(markNotificationReadAction(ID)).resolves.toEqual({ success: true, data });
    expect(permissionMock).toHaveBeenCalledWith('notification:read');
    expect(markMock).toHaveBeenCalledWith(USER_ID, ID);
    expect(revalidateMock.mock.calls).toEqual(REVALIDATED);
  });

  it('returns FORBIDDEN without writing', async () => {
    permissionMock.mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'Denied.'));

    await expect(markNotificationReadAction(ID)).resolves.toMatchObject({
      success: false,
      error: { code: 'FORBIDDEN' },
    });
    expect(markMock).not.toHaveBeenCalled();
    expect(revalidateMock).not.toHaveBeenCalled();
  });

  it('rejects a malformed ID', async () => {
    await expect(markNotificationReadAction('not-a-uuid')).resolves.toMatchObject({
      success: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(markMock).not.toHaveBeenCalled();
  });

  it('returns NOT_FOUND for a missing or empty digest', async () => {
    markMock.mockRejectedValue(notFound());

    await expect(markNotificationReadAction(ID)).resolves.toMatchObject({
      success: false,
      error: { code: 'NOT_FOUND' },
    });
    expect(revalidateMock).not.toHaveBeenCalled();
  });
});

describe('markAllNotificationsReadAction', () => {
  it('marks all read for the current user and revalidates', async () => {
    markAllMock.mockResolvedValue({ count: 3 });

    await expect(markAllNotificationsReadAction()).resolves.toEqual({
      success: true,
      data: { count: 3 },
    });
    expect(permissionMock).toHaveBeenCalledWith('notification:read');
    expect(markAllMock).toHaveBeenCalledWith(USER_ID);
    expect(revalidateMock.mock.calls).toEqual(REVALIDATED);
  });

  it('returns FORBIDDEN without writing', async () => {
    permissionMock.mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'Denied.'));

    await expect(markAllNotificationsReadAction()).resolves.toMatchObject({
      success: false,
      error: { code: 'FORBIDDEN' },
    });
    expect(markAllMock).not.toHaveBeenCalled();
  });
});
