/** @jest-environment node */
import { revalidatePath } from 'next/cache';
import {
  createEmployeeAction,
  deleteEmployeeAction,
  setEmployeeActiveAction,
  updateEmployeeAction,
} from '../../src/actions/employees';
import { ApiError } from '../../src/lib/api-response';
import { requirePermission } from '../../src/lib/auth';
import * as employees from '../../src/lib/employees';

jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('@/lib/auth', () => ({ requirePermission: jest.fn() }));
jest.mock('@/lib/employees', () => ({
  createEmployee: jest.fn(),
  updateEmployee: jest.fn(),
  softDeleteEmployee: jest.fn(),
}));

const permissionMock = requirePermission as jest.Mock;
const revalidateMock = revalidatePath as jest.Mock;
const lib = employees as jest.Mocked<typeof employees>;

const ID = '3f2b7c1e-8a4d-4e6f-9b1a-2c3d4e5f6a7b';
const ROLE_ID = '6c5eaf4b-1d7a-4b9c-8e4d-5f6a7b8c9d0e';
const NEW_EMPLOYEE = {
  firstName: 'Ana',
  lastName: 'Cruz',
  username: 'anacruz',
  password: 'correct horse',
  roleId: ROLE_ID,
};

beforeEach(() => {
  jest.resetAllMocks();
  permissionMock.mockResolvedValue({ id: 'user-1' });
});

const cases = [
  {
    name: 'createEmployeeAction',
    run: () => createEmployeeAction(NEW_EMPLOYEE),
    invalid: () => createEmployeeAction({ ...NEW_EMPLOYEE, password: 'short' }),
    lib: () => lib.createEmployee,
    libArgs: [{ ...NEW_EMPLOYEE, receivesSmsAlerts: false }],
  },
  {
    name: 'updateEmployeeAction',
    run: () => updateEmployeeAction(ID, { position: 'Nurse' }),
    invalid: () => updateEmployeeAction(ID, { contactNumber: '09171234567' }),
    lib: () => lib.updateEmployee,
    libArgs: ['user-1', ID, { position: 'Nurse' }],
  },
  {
    name: 'setEmployeeActiveAction',
    run: () => setEmployeeActiveAction(ID, false),
    invalid: () => setEmployeeActiveAction(ID, 'no'),
    lib: () => lib.updateEmployee,
    libArgs: ['user-1', ID, { isActive: false }],
  },
  {
    name: 'deleteEmployeeAction',
    run: () => deleteEmployeeAction(ID),
    invalid: () => deleteEmployeeAction('not-a-uuid'),
    lib: () => lib.softDeleteEmployee,
    libArgs: ['user-1', ID],
  },
];

describe.each(cases)('$name', ({ run, invalid, lib: libFn, libArgs }) => {
  it('checks both permissions, calls the lib with the actor and revalidates', async () => {
    libFn().mockResolvedValue({ id: ID } as never);

    await expect(run()).resolves.toEqual({ success: true, data: { id: ID } });
    expect(permissionMock).toHaveBeenCalledWith('employee:manage', 'user:manage');
    expect(libFn()).toHaveBeenCalledWith(...libArgs);
    expect(revalidateMock.mock.calls.map(([path]) => path)).toEqual([
      '/employees',
      `/employees/${ID}`,
    ]);
  });

  it('returns FORBIDDEN without calling the lib', async () => {
    permissionMock.mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'Denied.'));

    await expect(run()).resolves.toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
    expect(libFn()).not.toHaveBeenCalled();
    expect(revalidateMock).not.toHaveBeenCalled();
  });

  it('returns VALIDATION_ERROR without calling the lib', async () => {
    await expect(invalid()).resolves.toMatchObject({
      success: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(libFn()).not.toHaveBeenCalled();
  });

  it('passes the lib error and its fields through', async () => {
    const fields = { username: ['This username is already in use.'] };
    libFn().mockRejectedValue(new ApiError(409, 'EMPLOYEE_DUPLICATE', 'Taken.', fields));

    await expect(run()).resolves.toEqual({
      success: false,
      error: { code: 'EMPLOYEE_DUPLICATE', message: 'Taken.', fields },
    });
    expect(revalidateMock).not.toHaveBeenCalled();
  });
});
