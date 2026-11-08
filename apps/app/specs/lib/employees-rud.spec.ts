/** @jest-environment node */
import { Prisma } from '../../src/generated/prisma/client';
import {
  getEmployee,
  listEmployees,
  softDeleteEmployee,
  updateEmployee,
} from '../../src/lib/employees';
import { prisma } from '../../src/lib/prisma';

jest.mock('bcrypt', () => ({ hash: jest.fn() }));
jest.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: jest.fn(),
    user: { findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn() },
  },
}));

const ACTOR_ID = 'actor-user';
const EMPLOYEE_ID = 'employee-1';
const USER_ID = 'user-1';
const ROLE_ID = 'role-staff';
const NEW_ROLE_ID = 'role-collaborator';
const AT = new Date('2026-11-06T02:00:00.000Z');

const employeeRow = {
  id: EMPLOYEE_ID,
  firstName: 'Maria',
  middleName: null,
  lastName: 'Reyes',
  email: 'maria@example.com',
  contactNumber: '+639171234567',
  position: null,
  receivesSmsAlerts: true,
  isActive: true,
  createdAt: AT,
  updatedAt: AT,
};

const userRow = {
  id: USER_ID,
  username: 'mreyes',
  roleId: ROLE_ID,
  isActive: true,
  createdAt: AT,
  role: { name: 'staff' },
};

const expected = {
  ...employeeRow,
  createdAt: AT.toISOString(),
  updatedAt: AT.toISOString(),
  user: {
    id: USER_ID,
    username: 'mreyes',
    roleId: ROLE_ID,
    role: 'staff',
    isActive: true,
    createdAt: AT.toISOString(),
  },
};

const ADMIN_PERMISSIONS = [{ permission: '*' }];

function target(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    username: 'mreyes',
    roleId: ROLE_ID,
    isActive: true,
    role: { permissions: [] as { permission: string }[] },
    employee: {
      email: 'maria@example.com',
      contactNumber: '+639171234567',
      receivesSmsAlerts: true,
      isActive: true,
    },
    ...overrides,
  };
}

const tx = {
  $executeRaw: jest.fn(),
  $queryRaw: jest.fn(),
  role: { findUnique: jest.fn() },
  employee: { findUnique: jest.fn(), update: jest.fn() },
  user: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  smsMessage: { updateMany: jest.fn() },
};

const transactionMock = prisma.$transaction as jest.Mock;
const findManyMock = prisma.user.findMany as jest.Mock;
const findFirstMock = prisma.user.findFirst as jest.Mock;
const countMock = prisma.user.count as jest.Mock;

function expectNothingWritten() {
  expect(tx.employee.update).not.toHaveBeenCalled();
  expect(tx.user.update).not.toHaveBeenCalled();
  expect(tx.smsMessage.updateMany).not.toHaveBeenCalled();
}

beforeEach(() => {
  jest.resetAllMocks();
  transactionMock.mockImplementation((arg: unknown) =>
    typeof arg === 'function' ? arg(tx) : Promise.all(arg as unknown[]),
  );
  tx.user.findFirst.mockResolvedValue(target());
  tx.user.findUnique.mockResolvedValue(null);
  tx.employee.findUnique.mockResolvedValue(null);
  tx.role.findUnique.mockResolvedValue({ permissions: [] });
  tx.user.count.mockResolvedValue(1);
  tx.employee.update.mockResolvedValue(employeeRow);
  tx.user.update.mockResolvedValue(userRow);
});

describe('listEmployees', () => {
  beforeEach(() => {
    findManyMock.mockResolvedValue([{ ...userRow, employee: employeeRow }]);
    countMock.mockResolvedValue(1);
  });

  it('returns mapped items with paging', async () => {
    await expect(listEmployees({ page: 1, pageSize: 20, status: 'all' })).resolves.toEqual({
      items: [expected],
      total: 1,
      page: 1,
      pageSize: 20,
    });
  });

  it('excludes soft-deleted employees', async () => {
    await listEmployees({ page: 1, pageSize: 20, status: 'all' });

    expect(findManyMock.mock.calls[0][0].where).toEqual({
      employee: { deletedAt: null },
    });
  });

  it('lists only active employees for the active status', async () => {
    await listEmployees({ page: 1, pageSize: 20, status: 'active' });

    const { where } = findManyMock.mock.calls[0][0];
    expect(where).toEqual({ employee: { deletedAt: null, isActive: true } });
    expect(countMock).toHaveBeenCalledWith({ where });
  });

  it('skips the earlier pages', async () => {
    await listEmployees({ page: 3, pageSize: 10, status: 'all' });

    expect(findManyMock.mock.calls[0][0]).toMatchObject({ skip: 20, take: 10 });
  });

  it('never selects the password hash', async () => {
    await listEmployees({ page: 1, pageSize: 20, status: 'all' });

    expect(findManyMock.mock.calls[0][0].select.passwordHash).toBeUndefined();
  });

  it('escapes search and uses the same filter for the count', async () => {
    await listEmployees({ search: '50%_x', page: 1, pageSize: 20, status: 'all' });

    const { where } = findManyMock.mock.calls[0][0];
    expect(where.OR[0].username.contains).toBe('50\\%\\_x');
    expect(where.OR[0].username.mode).toBe('insensitive');
    expect(where.OR).toHaveLength(5);
    expect(countMock).toHaveBeenCalledWith({ where });
  });
});

describe('getEmployee', () => {
  it('returns the employee and never selects the password hash', async () => {
    findFirstMock.mockResolvedValue({ ...userRow, employee: employeeRow });

    await expect(getEmployee(EMPLOYEE_ID)).resolves.toEqual(expected);
    const query = findFirstMock.mock.calls[0][0];
    expect(query.where).toEqual({
      employeeId: EMPLOYEE_ID,
      employee: { deletedAt: null },
    });
    expect(query.select.passwordHash).toBeUndefined();
  });

  it('fails with 404 when missing', async () => {
    findFirstMock.mockResolvedValue(null);

    await expect(getEmployee(EMPLOYEE_ID)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('updateEmployee', () => {
  const update = (input: Record<string, unknown>) =>
    updateEmployee(ACTOR_ID, EMPLOYEE_ID, input);

  it('writes only the fields sent', async () => {
    await expect(update({ position: 'Pharmacist' })).resolves.toEqual(expected);

    expect(tx.employee.update.mock.calls[0][0].data).toEqual({
      position: 'Pharmacist',
    });
    expect(tx.user.update.mock.calls[0][0].data).toEqual({
      username: undefined,
      roleId: undefined,
      isActive: undefined,
    });
  });

  it('writes isActive to both rows', async () => {
    await update({ isActive: true });

    expect(tx.employee.update.mock.calls[0][0].data).toEqual({ isActive: true });
    expect(tx.user.update.mock.calls[0][0].data.isActive).toBe(true);
  });

  it('splits user fields from employee fields', async () => {
    await update({ username: 'new.name', roleId: NEW_ROLE_ID, position: 'x' });

    expect(tx.employee.update.mock.calls[0][0].data).toEqual({ position: 'x' });
    expect(tx.user.update.mock.calls[0][0].data).toMatchObject({
      username: 'new.name',
      roleId: NEW_ROLE_ID,
    });
  });

  it('fails with 404 and writes nothing when missing', async () => {
    tx.user.findFirst.mockResolvedValue(null);

    await expect(update({ position: 'x' })).rejects.toMatchObject({
      status: 404,
    });
    expectNothingWritten();
  });

  it('locks the employee row', async () => {
    await update({ position: 'x' });

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('only takes the admin lock for admin-affecting changes', async () => {
    await update({ position: 'x' });
    expect(tx.$executeRaw).not.toHaveBeenCalled();

    await update({ isActive: true });
    expect(tx.$executeRaw).not.toHaveBeenCalled();

    await update({ isActive: false });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);

    await update({ roleId: NEW_ROLE_ID });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it('takes the admin lock before locking the employee', async () => {
    await update({ isActive: false });

    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.$queryRaw.mock.invocationCallOrder[0],
    );
  });

  it('fails with 400 and writes nothing for an unknown role', async () => {
    tx.role.findUnique.mockResolvedValue(null);

    await expect(update({ roleId: NEW_ROLE_ID })).rejects.toMatchObject({
      status: 400,
      fields: { roleId: expect.any(Array) },
    });
    expectNothingWritten();
  });

  describe('email and username', () => {
    it('fails with 409 when another employee has the email', async () => {
      tx.employee.findUnique.mockResolvedValue({ id: 'other' });

      await expect(update({ email: 'taken@example.com' })).rejects.toMatchObject(
        { status: 409, code: 'EMPLOYEE_DUPLICATE', fields: { email: expect.any(Array) } },
      );
      expectNothingWritten();
    });

    it('fails with 409 when another user has the username', async () => {
      tx.user.findUnique.mockResolvedValue({ id: 'other' });

      await expect(update({ username: 'taken' })).rejects.toMatchObject({
        status: 409,
        fields: { username: expect.any(Array) },
      });
      expectNothingWritten();
    });

    it('allows saving your own values without checking them', async () => {
      await update({ email: 'maria@example.com', username: 'mreyes' });

      expect(tx.employee.findUnique).not.toHaveBeenCalled();
      expect(tx.user.findUnique).not.toHaveBeenCalled();
      expect(tx.employee.update).toHaveBeenCalled();
    });

    it('allows clearing the email', async () => {
      await update({ email: null });

      expect(tx.employee.findUnique).not.toHaveBeenCalled();
      expect(tx.employee.update.mock.calls[0][0].data).toEqual({ email: null });
    });

    it('turns a unique violation into a 409 without fields', async () => {
      tx.user.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      const error = await update({ username: 'race' }).catch((e: unknown) => e);

      expect(error).toMatchObject({ status: 409, code: 'EMPLOYEE_DUPLICATE' });
      expect((error as { fields?: object }).fields).toBeUndefined();
    });

    it('passes other errors through unchanged', async () => {
      const failure = new Error('connection lost');
      tx.user.update.mockRejectedValue(failure);

      await expect(update({ position: 'x' })).rejects.toBe(failure);
    });
  });

  describe('SMS contact rule', () => {
    it('rejects clearing the number while alerts stay on', async () => {
      await expect(update({ contactNumber: null })).rejects.toMatchObject({
        status: 400,
        fields: { contactNumber: expect.any(Array) },
      });
      expectNothingWritten();
    });

    it('rejects turning alerts on with no stored number', async () => {
      tx.user.findFirst.mockResolvedValue(
        target({
          employee: {
            email: null,
            contactNumber: null,
            receivesSmsAlerts: false,
            isActive: true,
          },
        }),
      );

      await expect(update({ receivesSmsAlerts: true })).rejects.toMatchObject({
        status: 400,
      });
      expectNothingWritten();
    });

    it('allows turning alerts on with a stored number', async () => {
      await update({ receivesSmsAlerts: true });

      expect(tx.employee.update).toHaveBeenCalled();
    });

    it('allows clearing the number and turning alerts off together', async () => {
      tx.employee.update.mockResolvedValue({
        ...employeeRow,
        receivesSmsAlerts: false,
      });

      await update({ contactNumber: null, receivesSmsAlerts: false });

      expect(tx.employee.update).toHaveBeenCalled();
    });
  });

  describe('changing your own account', () => {
    const self = () =>
      tx.user.findFirst.mockResolvedValue(target({ id: ACTOR_ID }));

    it('rejects deactivating yourself', async () => {
      self();

      await expect(update({ isActive: false })).rejects.toMatchObject({
        status: 409,
        code: 'EMPLOYEE_SELF_CHANGE',
      });
      expectNothingWritten();
    });

    it('rejects changing your own role', async () => {
      self();

      await expect(update({ roleId: NEW_ROLE_ID })).rejects.toMatchObject({
        code: 'EMPLOYEE_SELF_CHANGE',
      });
      expectNothingWritten();
    });

    it('allows sending your current role and active status', async () => {
      self();

      await update({ roleId: ROLE_ID, isActive: true });

      expect(tx.employee.update).toHaveBeenCalled();
    });

    it('allows editing your own details', async () => {
      self();

      await update({ firstName: 'New', username: 'new.name' });

      expect(tx.employee.update).toHaveBeenCalled();
    });
  });

  describe('last admin', () => {
    const admin = (overrides = {}) =>
      target({ role: { permissions: ADMIN_PERMISSIONS }, ...overrides });

    it.each([
      ['deactivating', { isActive: false }],
      ['moving to another role', { roleId: NEW_ROLE_ID }],
    ])('rejects %s the last admin', async (_name, input) => {
      tx.user.findFirst.mockResolvedValue(admin());
      tx.user.count.mockResolvedValue(0);

      await expect(update(input)).rejects.toMatchObject({
        status: 409,
        code: 'LAST_ADMIN',
      });
      expectNothingWritten();
    });

    it('allows it when another active admin exists', async () => {
      tx.user.findFirst.mockResolvedValue(admin());

      await update({ isActive: false });

      expect(tx.user.count.mock.calls[0][0].where).toEqual({
        id: { not: USER_ID },
        isActive: true,
        employee: { isActive: true, deletedAt: null },
        role: { permissions: { some: { permission: '*' } } },
      });
      expect(tx.employee.update).toHaveBeenCalled();
    });

    it('allows moving an admin to another role that holds *', async () => {
      tx.user.findFirst.mockResolvedValue(admin());
      tx.role.findUnique.mockResolvedValue({ permissions: ADMIN_PERMISSIONS });
      tx.user.count.mockResolvedValue(0);

      await update({ roleId: NEW_ROLE_ID });

      expect(tx.user.count).not.toHaveBeenCalled();
    });

    it('does not count for a non-admin or an inactive admin', async () => {
      tx.user.count.mockResolvedValue(0);

      await update({ isActive: false });
      tx.user.findFirst.mockResolvedValue(admin({ isActive: false }));
      await update({ isActive: false });

      expect(tx.user.count).not.toHaveBeenCalled();
    });
  });

  describe('SMS cancellation', () => {
    it('cancels pending messages when deactivated', async () => {
      await update({ isActive: false });

      expect(tx.smsMessage.updateMany).toHaveBeenCalledWith({
        where: { employeeId: EMPLOYEE_ID, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
    });

    it('cancels pending messages when alerts go off', async () => {
      tx.employee.update.mockResolvedValue({
        ...employeeRow,
        receivesSmsAlerts: false,
      });

      await update({ receivesSmsAlerts: false });

      expect(tx.smsMessage.updateMany).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['an unrelated edit', { position: 'x' }],
      ['a number change', { contactNumber: '+639999999999' }],
      ['a reactivation', { isActive: true }],
    ])('leaves messages alone on %s', async (_name, input) => {
      await update(input);

      expect(tx.smsMessage.updateMany).not.toHaveBeenCalled();
    });
  });
});

describe('softDeleteEmployee', () => {
  const remove = () => softDeleteEmployee(ACTOR_ID, EMPLOYEE_ID);

  it('sets deleted_at and both flags, then cancels SMS', async () => {
    await expect(remove()).resolves.toEqual({ id: EMPLOYEE_ID });

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.employee.update.mock.calls[0][0]).toEqual({
      where: { id: EMPLOYEE_ID },
      data: { deletedAt: expect.any(Date), isActive: false },
    });
    expect(tx.user.update.mock.calls[0][0]).toEqual({
      where: { id: USER_ID },
      data: { isActive: false },
    });
    expect(tx.smsMessage.updateMany).toHaveBeenCalledTimes(1);
  });

  it('fails with 404 when missing or already deleted', async () => {
    tx.user.findFirst.mockResolvedValue(null);

    await expect(remove()).rejects.toMatchObject({ status: 404 });
    expectNothingWritten();
  });

  it('rejects deleting yourself', async () => {
    tx.user.findFirst.mockResolvedValue(target({ id: ACTOR_ID }));

    await expect(remove()).rejects.toMatchObject({
      status: 409,
      code: 'EMPLOYEE_SELF_CHANGE',
    });
    expectNothingWritten();
  });

  it('rejects deleting the last admin', async () => {
    tx.user.findFirst.mockResolvedValue(
      target({ role: { permissions: ADMIN_PERMISSIONS } }),
    );
    tx.user.count.mockResolvedValue(0);

    await expect(remove()).rejects.toMatchObject({
      status: 409,
      code: 'LAST_ADMIN',
    });
    expectNothingWritten();
  });

  it('allows deleting an admin when another exists', async () => {
    tx.user.findFirst.mockResolvedValue(
      target({ role: { permissions: ADMIN_PERMISSIONS } }),
    );

    await expect(remove()).resolves.toEqual({ id: EMPLOYEE_ID });
  });
});
