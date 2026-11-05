/** @jest-environment node */
import { getServerSession } from 'next-auth';
import { requirePermission } from '../../src/lib/auth';
import { prisma } from '../../src/lib/prisma';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('@/lib/auth-options', () => ({ authOptions: {} }));
jest.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: jest.fn() } },
}));

const sessionMock = getServerSession as jest.Mock;
const findUniqueMock = prisma.user.findUnique as jest.Mock;

function userWith(permissions: string[], overrides = {}) {
  return {
    id: 'user-1',
    isActive: true,
    employee: { isActive: true, deletedAt: null },
    role: { permissions: permissions.map((permission) => ({ permission })) },
    ...overrides,
  };
}

describe('requirePermission', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    sessionMock.mockResolvedValue({ user: { id: 'user-1' } });
  });

  it('fails with 401 without a session', async () => {
    sessionMock.mockResolvedValue(null);

    await expect(requirePermission('medicine:read')).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHENTICATED',
    });
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it.each([
    ['a missing user', null],
    ['an inactive user', userWith(['*'], { isActive: false })],
    [
      'an inactive employee',
      userWith(['*'], { employee: { isActive: false, deletedAt: null } }),
    ],
    [
      'a soft-deleted employee',
      userWith(['*'], { employee: { isActive: true, deletedAt: new Date() } }),
    ],
  ])('fails with 401 for %s', async (_name, user) => {
    findUniqueMock.mockResolvedValue(user);

    await expect(requirePermission('medicine:read')).rejects.toMatchObject({
      status: 401,
    });
  });

  it('fails with 403 when the permission is missing', async () => {
    findUniqueMock.mockResolvedValue(userWith(['medicine:read']));

    await expect(requirePermission('medicine:write')).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
    });
  });

  it('fails with 403 when one of two permissions is missing', async () => {
    findUniqueMock.mockResolvedValue(userWith(['medicine:write']));

    await expect(
      requirePermission('medicine:write', 'inventory:write'),
    ).rejects.toMatchObject({ status: 403 });
  });

  it.each([
    [['*']],
    [['medicine:*', 'inventory:*']],
    [['medicine:write', 'inventory:write']],
  ])('returns the user when granted %j', async (permissions) => {
    findUniqueMock.mockResolvedValue(userWith(permissions));

    await expect(
      requirePermission('medicine:write', 'inventory:write'),
    ).resolves.toEqual({ id: 'user-1' });
  });
});
