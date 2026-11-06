/** @jest-environment node */
import { GET } from '../../../src/app/api/roles/route';
import { ApiError } from '../../../src/lib/api-response';
import { requirePermission } from '../../../src/lib/auth';
import { listRoles } from '../../../src/lib/roles';

jest.mock('@/lib/auth', () => ({ requirePermission: jest.fn() }));
jest.mock('@/lib/roles', () => ({ listRoles: jest.fn() }));

const permissionMock = requirePermission as jest.Mock;
const listMock = listRoles as jest.Mock;

describe('GET /api/roles', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    permissionMock.mockResolvedValue({ id: 'user-1' });
  });

  it('requires user:manage', async () => {
    listMock.mockResolvedValue([]);

    await GET();

    expect(permissionMock).toHaveBeenCalledWith('user:manage');
  });

  it.each([
    [401, 'UNAUTHENTICATED'],
    [403, 'FORBIDDEN'],
  ] as const)('returns %i and reads nothing', async (status, code) => {
    permissionMock.mockRejectedValue(new ApiError(status, code, 'Denied.'));

    const response = await GET();

    expect(response.status).toBe(status);
    expect(listMock).not.toHaveBeenCalled();
  });

  it('returns the roles', async () => {
    const roles = [{ id: 'role-1', name: 'staff', description: 'Staff' }];
    listMock.mockResolvedValue(roles);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: roles,
    });
  });
});
