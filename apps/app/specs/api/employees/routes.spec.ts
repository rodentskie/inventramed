/** @jest-environment node */
import { NextRequest } from 'next/server';
import { POST } from '../../../src/app/api/employees/route';
import { ApiError } from '../../../src/lib/api-response';
import { requirePermission } from '../../../src/lib/auth';
import { createEmployee } from '../../../src/lib/employees';

jest.mock('@/lib/auth', () => ({ requirePermission: jest.fn() }));
jest.mock('@/lib/employees', () => ({ createEmployee: jest.fn() }));

const permissionMock = requirePermission as jest.Mock;
const createMock = createEmployee as jest.Mock;

const URL_BASE = 'http://localhost/api/employees';

const body = {
  firstName: 'Maria',
  lastName: 'Reyes',
  username: 'mreyes',
  password: 'a-strong-password',
  roleId: '3f2b7c1e-8a4d-4e6f-9b1a-2c3d4e5f6a7b',
};

const post = (value: unknown) =>
  POST(
    new NextRequest(URL_BASE, { method: 'POST', body: JSON.stringify(value) }),
  );

describe('POST /api/employees', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    permissionMock.mockResolvedValue({ id: 'user-1' });
  });

  it('requires both manage permissions', async () => {
    await post(body);

    expect(permissionMock).toHaveBeenCalledWith(
      'employee:manage',
      'user:manage',
    );
  });

  it.each([
    [401, 'UNAUTHENTICATED'],
    [403, 'FORBIDDEN'],
  ] as const)('returns %i and creates nothing', async (status, code) => {
    permissionMock.mockRejectedValue(new ApiError(status, code, 'Denied.'));

    const response = await post(body);

    expect(response.status).toBe(status);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid JSON', async () => {
    const response = await POST(
      new NextRequest(URL_BASE, { method: 'POST', body: '{' }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('INVALID_JSON');
  });

  it('returns 400 with field errors for an invalid body', async () => {
    const response = await post({ ...body, contactNumber: '09171234567' });

    expect(response.status).toBe(400);
    const { error } = await response.json();
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.fields.contactNumber).toHaveLength(1);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('does not echo the password in validation errors', async () => {
    const response = await post({
      ...body,
      password: 'short',
    });

    expect(await response.text()).not.toContain('"short"');
  });

  it('returns 201 with the created employee', async () => {
    const created = { id: 'employee-1', user: { id: 'user-1' } };
    createMock.mockResolvedValue(created);

    const response = await post(body);

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: created,
    });
    expect(createMock).toHaveBeenCalledWith({
      ...body,
      receivesSmsAlerts: false,
    });
  });

  it('returns 409 for a duplicate', async () => {
    createMock.mockRejectedValue(
      new ApiError(409, 'EMPLOYEE_DUPLICATE', 'Taken.', {
        username: ['Taken.'],
      }),
    );

    const response = await post(body);

    expect(response.status).toBe(409);
    expect((await response.json()).error.fields.username).toEqual(['Taken.']);
  });
});
