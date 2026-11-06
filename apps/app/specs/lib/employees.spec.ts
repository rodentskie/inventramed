/** @jest-environment node */
import { hash } from 'bcrypt';
import { Prisma } from '../../src/generated/prisma/client';
import { createEmployee } from '../../src/lib/employees';
import { prisma } from '../../src/lib/prisma';
import type { CreateEmployeeInput } from '../../src/lib/validations/employee';

jest.mock('bcrypt', () => ({ hash: jest.fn() }));
jest.mock('@/lib/prisma', () => ({
  prisma: { $transaction: jest.fn() },
}));

const CREATED_AT = new Date('2026-11-06T02:00:00.000Z');
const ROLE_ID = '3f2b7c1e-8a4d-4e6f-9b1a-2c3d4e5f6a7b';

const input: CreateEmployeeInput = {
  firstName: 'Maria',
  lastName: 'Reyes',
  email: 'maria@example.com',
  receivesSmsAlerts: false,
  username: 'mreyes',
  password: 'a-strong-password',
  roleId: ROLE_ID,
};

const hashMock = hash as jest.Mock;
const transactionMock = prisma.$transaction as jest.Mock;

const tx = {
  role: { findUnique: jest.fn() },
  employee: { findUnique: jest.fn(), create: jest.fn() },
  user: { findUnique: jest.fn(), create: jest.fn() },
};

describe('createEmployee', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    hashMock.mockResolvedValue('hashed');
    transactionMock.mockImplementation((fn: (client: typeof tx) => unknown) =>
      fn(tx),
    );
    tx.role.findUnique.mockResolvedValue({ id: ROLE_ID });
    tx.employee.findUnique.mockResolvedValue(null);
    tx.user.findUnique.mockResolvedValue(null);
    tx.employee.create.mockResolvedValue({
      id: 'employee-1',
      firstName: 'Maria',
      middleName: null,
      lastName: 'Reyes',
      email: 'maria@example.com',
      contactNumber: null,
      position: null,
      receivesSmsAlerts: false,
      isActive: true,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    });
    tx.user.create.mockResolvedValue({
      id: 'user-1',
      username: 'mreyes',
      isActive: true,
      createdAt: CREATED_AT,
      role: { name: 'staff' },
    });
  });

  it('creates the employee, then the user linked to it', async () => {
    await createEmployee(input);

    expect(tx.employee.create.mock.calls[0][0].data).toEqual({
      firstName: 'Maria',
      lastName: 'Reyes',
      email: 'maria@example.com',
      receivesSmsAlerts: false,
    });
    expect(tx.user.create.mock.calls[0][0].data).toEqual({
      employeeId: 'employee-1',
      username: 'mreyes',
      passwordHash: 'hashed',
      roleId: ROLE_ID,
    });
    expect(tx.employee.create.mock.invocationCallOrder[0]).toBeLessThan(
      tx.user.create.mock.invocationCallOrder[0],
    );
  });

  it('hashes with cost 12 before opening the transaction', async () => {
    await createEmployee(input);

    expect(hashMock).toHaveBeenCalledWith('a-strong-password', 12);
    expect(hashMock.mock.invocationCallOrder[0]).toBeLessThan(
      transactionMock.mock.invocationCallOrder[0],
    );
  });

  it('returns the role name and no password data', async () => {
    const result = await createEmployee(input);

    expect(result).toEqual({
      id: 'employee-1',
      firstName: 'Maria',
      middleName: null,
      lastName: 'Reyes',
      email: 'maria@example.com',
      contactNumber: null,
      position: null,
      receivesSmsAlerts: false,
      isActive: true,
      createdAt: '2026-11-06T02:00:00.000Z',
      updatedAt: '2026-11-06T02:00:00.000Z',
      user: {
        id: 'user-1',
        username: 'mreyes',
        role: 'staff',
        isActive: true,
        createdAt: '2026-11-06T02:00:00.000Z',
      },
    });
    expect(JSON.stringify(result)).not.toMatch(/password|hashed/i);
    expect(tx.user.create.mock.calls[0][0].select.passwordHash).toBeUndefined();
  });

  it('fails with 400 and creates nothing for an unknown role', async () => {
    tx.role.findUnique.mockResolvedValue(null);

    await expect(createEmployee(input)).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      fields: { roleId: expect.any(Array) },
    });
    expect(tx.employee.create).not.toHaveBeenCalled();
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it('skips the email check when no email is given', async () => {
    await createEmployee({ ...input, email: null });

    expect(tx.employee.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    ['email', true, false, ['email']],
    ['username', false, true, ['username']],
    ['email and username', true, true, ['email', 'username']],
  ])(
    'fails with 409 and creates nothing when the %s is taken',
    async (_name, emailTaken, usernameTaken, fields) => {
      tx.employee.findUnique.mockResolvedValue(emailTaken ? { id: 'x' } : null);
      tx.user.findUnique.mockResolvedValue(usernameTaken ? { id: 'x' } : null);

      const error = await createEmployee(input).catch((e: unknown) => e);

      expect(error).toMatchObject({ status: 409, code: 'EMPLOYEE_DUPLICATE' });
      expect(Object.keys((error as { fields: object }).fields)).toEqual(fields);
      expect(tx.employee.create).not.toHaveBeenCalled();
      expect(tx.user.create).not.toHaveBeenCalled();
    },
  );

  it('turns a unique violation into a 409 without fields', async () => {
    tx.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    const error = await createEmployee(input).catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 409, code: 'EMPLOYEE_DUPLICATE' });
    expect((error as { fields?: object }).fields).toBeUndefined();
  });

  it('passes other database errors through unchanged', async () => {
    const failure = new Error('connection lost');
    tx.user.create.mockRejectedValue(failure);

    await expect(createEmployee(input)).rejects.toBe(failure);
  });
});
