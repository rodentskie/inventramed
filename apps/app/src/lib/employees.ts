import 'server-only';
import { hash } from 'bcrypt';
import { Prisma } from '@/generated/prisma/client';
import { ApiError, type ApiFieldErrors } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import type { CreateEmployeeInput } from '@/lib/validations/employee';
import type { EmployeeWithUser } from '@/types/employee';

// Matches prisma/seed.ts and the dummy hash in auth-options.ts. A different cost
// would let login response time reveal which usernames exist.
const BCRYPT_SALT_ROUNDS = 12;

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
  isActive: true,
  createdAt: true,
  role: { select: { name: true } },
} satisfies Prisma.UserSelect;

function duplicateEmployee(fields?: ApiFieldErrors): ApiError {
  return new ApiError(
    409,
    'EMPLOYEE_DUPLICATE',
    'This email or username is already in use.',
    fields,
  );
}

async function assertRoleExists(
  tx: Prisma.TransactionClient,
  roleId: string,
): Promise<void> {
  const role = await tx.role.findUnique({
    where: { id: roleId },
    select: { id: true },
  });
  if (!role) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'The request is invalid.', {
      roleId: ['This role does not exist.'],
    });
  }
}

/**
 * Names the taken fields. Soft-deleted employees count, because the unique
 * index on email still includes them.
 */
async function assertAvailable(
  tx: Prisma.TransactionClient,
  email: string | null | undefined,
  username: string,
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

  const owner = await tx.user.findUnique({
    where: { username },
    select: { id: true },
  });
  if (owner) {
    fields.username = ['This username is already in use.'];
  }

  if (Object.keys(fields).length > 0) {
    throw duplicateEmployee(fields);
  }
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
      await assertRoleExists(tx, roleId);
      await assertAvailable(tx, employeeData.email, username);

      const employee = await tx.employee.create({
        data: employeeData,
        select: EMPLOYEE_SELECT,
      });
      const user = await tx.user.create({
        data: { employeeId: employee.id, username, passwordHash, roleId },
        select: USER_SELECT,
      });

      return {
        ...employee,
        createdAt: employee.createdAt.toISOString(),
        updatedAt: employee.updatedAt.toISOString(),
        user: {
          id: user.id,
          username: user.username,
          role: user.role.name,
          isActive: user.isActive,
          createdAt: user.createdAt.toISOString(),
        },
      };
    });
  } catch (error) {
    // Two requests can both pass assertAvailable. The unique index stops the
    // second one, and this driver adapter doesn't report which field collided.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw duplicateEmployee();
    }
    throw error;
  }
}
