import 'server-only';
import { hash } from 'bcrypt';
import { Prisma } from '@/generated/prisma/client';
import { ApiError, notFound, type ApiFieldErrors } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { escapeLikePattern } from '@/lib/search';
import type {
  CreateEmployeeInput,
  EmployeeListQuery,
  UpdateEmployeeInput,
} from '@/lib/validations/employee';
import type { EmployeeList, EmployeeWithUser } from '@/types/employee';

type Tx = Prisma.TransactionClient;

// Matches prisma/seed.ts and the dummy hash in auth-options.ts. A different cost
// would let login response time reveal which usernames exist.
const BCRYPT_SALT_ROUNDS = 12;

const ADMIN_PERMISSION = '*';
const ADMIN_LOCK_KEY = 'employee-admin-guard';

const EMPLOYEE_SELECT = {
  id: true,
  firstName: true,
  middleName: true,
  lastName: true,
  email: true,
  contactNumber: true,
  position: true,
  receivesSmsAlerts: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.EmployeeSelect;

const USER_SELECT = {
  id: true,
  username: true,
  roleId: true,
  isActive: true,
  createdAt: true,
  role: { select: { name: true } },
} satisfies Prisma.UserSelect;

// Reads start from users, because User.employee is required while
// Employee.user is optional.
const USER_WITH_EMPLOYEE_SELECT = {
  ...USER_SELECT,
  employee: { select: EMPLOYEE_SELECT },
} satisfies Prisma.UserSelect;

const ADMIN_PERMISSIONS_SELECT = {
  permissions: {
    where: { permission: ADMIN_PERMISSION },
    select: { permission: true },
  },
} satisfies Prisma.RoleSelect;

const TARGET_SELECT = {
  id: true,
  username: true,
  roleId: true,
  isActive: true,
  role: { select: ADMIN_PERMISSIONS_SELECT },
  employee: {
    select: {
      email: true,
      contactNumber: true,
      receivesSmsAlerts: true,
      isActive: true,
    },
  },
} satisfies Prisma.UserSelect;

type EmployeeRow = Prisma.EmployeeGetPayload<{ select: typeof EMPLOYEE_SELECT }>;
type UserRow = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;
type Target = Prisma.UserGetPayload<{ select: typeof TARGET_SELECT }>;

function toEmployeeWithUser(
  employee: EmployeeRow,
  user: UserRow,
): EmployeeWithUser {
  return {
    ...employee,
    createdAt: employee.createdAt.toISOString(),
    updatedAt: employee.updatedAt.toISOString(),
    user: {
      id: user.id,
      username: user.username,
      roleId: user.roleId,
      role: user.role.name,
      isActive: user.isActive,
      createdAt: user.createdAt.toISOString(),
    },
  };
}

function duplicateEmployee(fields?: ApiFieldErrors): ApiError {
  return new ApiError(
    409,
    'EMPLOYEE_DUPLICATE',
    'This email or username is already in use.',
    fields,
  );
}

/**
 * Two requests can both pass assertAvailable. The unique index stops the second
 * one, and this driver adapter doesn't report which field collided.
 */
function mapUniqueViolation(error: unknown): unknown {
  return error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
    ? duplicateEmployee()
    : error;
}

function invalidField(field: string, message: string): ApiError {
  return new ApiError(400, 'VALIDATION_ERROR', 'The request is invalid.', {
    [field]: [message],
  });
}

function findRole(tx: Tx, roleId: string) {
  return tx.role
    .findUnique({ where: { id: roleId }, select: ADMIN_PERMISSIONS_SELECT })
    .then((role) => {
      if (!role) {
        throw invalidField('roleId', 'This role does not exist.');
      }
      return role;
    });
}

/**
 * Names the taken fields. Soft-deleted employees count, because the unique
 * indexes still include them.
 */
async function assertAvailable(
  tx: Tx,
  email: string | null | undefined,
  username: string | undefined,
): Promise<void> {
  const fields: ApiFieldErrors = {};

  if (email) {
    const owner = await tx.employee.findUnique({
      where: { email },
      select: { id: true },
    });
    if (owner) {
      fields.email = ['This email is already in use.'];
    }
  }

  if (username) {
    const owner = await tx.user.findUnique({
      where: { username },
      select: { id: true },
    });
    if (owner) {
      fields.username = ['This username is already in use.'];
    }
  }

  if (Object.keys(fields).length > 0) {
    throw duplicateEmployee(fields);
  }
}

/**
 * Serializes changes that can remove an admin. Without it, two admins
 * deactivating each other at the same moment could both succeed.
 */
async function lockAdminChanges(tx: Tx): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${ADMIN_LOCK_KEY}::text, 0))`;
}

async function lockTarget(tx: Tx, id: string): Promise<Target> {
  await tx.$queryRaw`SELECT id FROM employees
    WHERE id = ${id}::uuid AND deleted_at IS NULL
    FOR UPDATE`;
  const target = await tx.user.findFirst({
    where: { employeeId: id, employee: { deletedAt: null } },
    select: TARGET_SELECT,
  });
  if (!target) {
    throw notFound();
  }
  return target;
}

function selfChangeError(): ApiError {
  return new ApiError(
    409,
    'EMPLOYEE_SELF_CHANGE',
    'You cannot change your own role, deactivate yourself or delete yourself.',
  );
}

function isActiveAdmin(target: Target): boolean {
  return (
    target.isActive &&
    target.employee.isActive &&
    target.role.permissions.length > 0
  );
}

async function assertAnotherAdminExists(tx: Tx, userId: string): Promise<void> {
  const others = await tx.user.count({
    where: {
      id: { not: userId },
      isActive: true,
      employee: { isActive: true, deletedAt: null },
      role: { permissions: { some: { permission: ADMIN_PERMISSION } } },
    },
  });
  if (others === 0) {
    throw new ApiError(
      409,
      'LAST_ADMIN',
      'This is the last active admin and cannot be removed.',
    );
  }
}

/** Checks the rules that protect admins, and that any new role exists. */
async function assertRoleAndStatusChange(
  tx: Tx,
  actorId: string,
  target: Target,
  input: UpdateEmployeeInput,
): Promise<void> {
  const roleChanges =
    input.roleId !== undefined && input.roleId !== target.roleId;
  if (
    target.id === actorId &&
    (input.isActive === false || roleChanges)
  ) {
    throw selfChangeError();
  }

  const newRole = input.roleId ? await findRole(tx, input.roleId) : null;
  const losesAdmin =
    input.isActive === false ||
    (newRole !== null && newRole.permissions.length === 0);
  if (losesAdmin && isActiveAdmin(target)) {
    await assertAnotherAdminExists(tx, target.id);
  }
}

function assertSmsHasContact(target: Target, input: UpdateEmployeeInput): void {
  const receivesSms =
    input.receivesSmsAlerts ?? target.employee.receivesSmsAlerts;
  const contact =
    input.contactNumber === undefined
      ? target.employee.contactNumber
      : input.contactNumber;
  if (receivesSms && !contact) {
    throw invalidField(
      'contactNumber',
      'A contact number is required to receive SMS alerts.',
    );
  }
}

async function cancelPendingSms(tx: Tx, employeeId: string): Promise<void> {
  await tx.smsMessage.updateMany({
    where: { employeeId, status: 'PENDING' },
    data: { status: 'CANCELLED' },
  });
}

export async function listEmployees({
  search,
  page,
  pageSize,
  status,
}: EmployeeListQuery): Promise<EmployeeList> {
  const contains = search
    ? { contains: escapeLikePattern(search), mode: 'insensitive' as const }
    : undefined;
  const where: Prisma.UserWhereInput = {
    employee: { deletedAt: null, ...(status === 'active' && { isActive: true }) },
    ...(contains && {
      OR: [
        { username: contains },
        { employee: { firstName: contains } },
        { employee: { middleName: contains } },
        { employee: { lastName: contains } },
        { employee: { email: contains } },
      ],
    }),
  };

  const [rows, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      select: USER_WITH_EMPLOYEE_SELECT,
      orderBy: [
        { employee: { lastName: 'asc' } },
        { employee: { firstName: 'asc' } },
        { id: 'asc' },
      ],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  return {
    items: rows.map((row) => toEmployeeWithUser(row.employee, row)),
    total,
    page,
    pageSize,
  };
}

export async function getEmployee(id: string): Promise<EmployeeWithUser> {
  const row = await prisma.user.findFirst({
    where: { employeeId: id, employee: { deletedAt: null } },
    select: USER_WITH_EMPLOYEE_SELECT,
  });
  if (!row) {
    throw notFound();
  }
  return toEmployeeWithUser(row.employee, row);
}

/**
 * Creates the employee and their login together. Every employee must have an
 * account, so a failure on either insert rolls back both.
 */
export async function createEmployee(
  input: CreateEmployeeInput,
): Promise<EmployeeWithUser> {
  const { username, password, roleId, ...employeeData } = input;
  // Hashing is slow, so it stays outside the transaction.
  const passwordHash = await hash(password, BCRYPT_SALT_ROUNDS);

  try {
    return await prisma.$transaction(async (tx) => {
      await findRole(tx, roleId);
      await assertAvailable(tx, employeeData.email, username);

      const employee = await tx.employee.create({
        data: employeeData,
        select: EMPLOYEE_SELECT,
      });
      const user = await tx.user.create({
        data: { employeeId: employee.id, username, passwordHash, roleId },
        select: USER_SELECT,
      });

      return toEmployeeWithUser(employee, user);
    });
  } catch (error) {
    throw mapUniqueViolation(error);
  }
}

/** Edits the employee and their login together. `isActive` applies to both. */
export async function updateEmployee(
  actorId: string,
  id: string,
  input: UpdateEmployeeInput,
): Promise<EmployeeWithUser> {
  const { username, roleId, ...employeeData } = input;

  try {
    return await prisma.$transaction(async (tx) => {
      if (input.isActive === false || roleId) {
        await lockAdminChanges(tx);
      }
      const target = await lockTarget(tx, id);

      await assertRoleAndStatusChange(tx, actorId, target, input);
      await assertAvailable(
        tx,
        input.email === target.employee.email ? undefined : input.email,
        username === target.username ? undefined : username,
      );
      assertSmsHasContact(target, input);

      const employee = await tx.employee.update({
        where: { id },
        data: employeeData,
        select: EMPLOYEE_SELECT,
      });
      const user = await tx.user.update({
        where: { id: target.id },
        data: { username, roleId, isActive: input.isActive },
        select: USER_SELECT,
      });

      if (
        input.isActive === false ||
        (target.employee.receivesSmsAlerts && !employee.receivesSmsAlerts)
      ) {
        await cancelPendingSms(tx, id);
      }

      return toEmployeeWithUser(employee, user);
    });
  } catch (error) {
    throw mapUniqueViolation(error);
  }
}

/**
 * Hard delete can't work, because the immutable inventory ledger references
 * users. Clearing is_active also keeps them out of the daily SMS digest.
 */
export async function softDeleteEmployee(
  actorId: string,
  id: string,
): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    await lockAdminChanges(tx);
    const target = await lockTarget(tx, id);

    if (target.id === actorId) {
      throw selfChangeError();
    }
    if (isActiveAdmin(target)) {
      await assertAnotherAdminExists(tx, target.id);
    }

    await tx.employee.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    await tx.user.update({
      where: { id: target.id },
      data: { isActive: false },
    });
    await cancelPendingSms(tx, id);

    return { id };
  });
}
