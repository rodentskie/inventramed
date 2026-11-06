/** @jest-environment node */
import { NextRequest } from 'next/server';
import { DELETE, GET, PATCH } from '../../../src/app/api/employees/[id]/route';
import { ApiError } from '../../../src/lib/api-response';
import { requirePermission } from '../../../src/lib/auth';
import {
  getEmployee,
  softDeleteEmployee,
  updateEmployee,
} from '../../../src/lib/employees';

jest.mock('@/lib/auth', () => ({ requirePermission: jest.fn() }));
jest.mock('@/lib/employees', () => ({
  getEmployee: jest.fn(),
  softDeleteEmployee: jest.fn(),
  updateEmployee: jest.fn(),
}));

const permissionMock = requirePermission as jest.Mock;
const getMock = getEmployee as jest.Mock;
const updateMock = updateEmployee as jest.Mock;
const deleteMock = softDeleteEmployee as jest.Mock;

const ID = '3f2b7c1e-8a4d-4e6f-9b1a-2c3d4e5f6a7b';
const URL_BASE = `http://localhost/api/employees/${ID}`;

const ctx = (id = ID) => ({ params: Promise.resolve({ id }) });
const request = () => new NextRequest(URL_BASE);
const patchRequest = (body: string) =>
  new NextRequest(URL_BASE, { method: 'PATCH', body });

const routes: [string, (id?: string) => Promise<Response>][] = [
  ['GET', (id) => GET(request(), ctx(id))],
  [
    'PATCH',
    (id) => PATCH(patchRequest(JSON.stringify({ position: 'x' })), ctx(id)),
  ],
  ['DELETE', (id) => DELETE(request(), ctx(id))],
];

describe('/api/employees/:id', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    permissionMock.mockResolvedValue({ id: 'actor-user' });
  });

  describe.each(routes)('%s', (_name, call) => {
    it('requires both manage permissions', async () => {
      await call();

      expect(permissionMock).toHaveBeenCalledWith(
        'employee:manage',
        'user:manage',
      );
    });

    it.each([
      [401, 'UNAUTHENTICATED'],
      [403, 'FORBIDDEN'],
    ] as const)('returns %i and calls no data function', async (status, code) => {
      permissionMock.mockRejectedValue(new ApiError(status, code, 'Denied.'));

      expect((await call()).status).toBe(status);
      expect(getMock).not.toHaveBeenCalled();
      expect(updateMock).not.toHaveBeenCalled();
      expect(deleteMock).not.toHaveBeenCalled();
    });

    it('returns 400 for an invalid ID', async () => {
      const response = await call('not-a-uuid');

      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe('VALIDATION_ERROR');
    });
  });

  it('GET returns the employee', async () => {
    const employee = { id: ID, user: { id: 'user-1' } };
    getMock.mockResolvedValue(employee);

    const response = await GET(request(), ctx());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: employee,
    });
    expect(getMock).toHaveBeenCalledWith(ID);
  });

  it('GET returns 404 when missing', async () => {
    getMock.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'Missing.'));

    expect((await GET(request(), ctx())).status).toBe(404);
  });

  it('PATCH passes the actor, ID and parsed input', async () => {
    updateMock.mockResolvedValue({ id: ID });

    const response = await PATCH(
      patchRequest(JSON.stringify({ position: ' Pharmacist ' })),
      ctx(),
    );

    expect(response.status).toBe(200);
    expect(updateMock.mock.calls[0][0]).toBe('actor-user');
    expect(updateMock.mock.calls[0][1]).toBe(ID);
    expect(updateMock.mock.calls[0][2].position).toBe('Pharmacist');
  });

  it('PATCH returns 400 for invalid JSON', async () => {
    const response = await PATCH(patchRequest('{'), ctx());

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('INVALID_JSON');
  });

  it('PATCH rejects a password', async () => {
    const response = await PATCH(
      patchRequest(JSON.stringify({ password: 'a-strong-password' })),
      ctx(),
    );

    expect(response.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it.each(['EMPLOYEE_SELF_CHANGE', 'LAST_ADMIN'] as const)(
    'PATCH returns 409 for %s',
    async (code) => {
      updateMock.mockRejectedValue(new ApiError(409, code, 'Blocked.'));

      const response = await PATCH(
        patchRequest(JSON.stringify({ isActive: false })),
        ctx(),
      );

      expect(response.status).toBe(409);
      expect((await response.json()).error.code).toBe(code);
    },
  );

  it('DELETE passes the actor and returns the ID', async () => {
    deleteMock.mockResolvedValue({ id: ID });

    const response = await DELETE(request(), ctx());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: { id: ID },
    });
    expect(deleteMock).toHaveBeenCalledWith('actor-user', ID);
  });
});
