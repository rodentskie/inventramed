import 'server-only';
import { getServerSession } from 'next-auth';
import { ApiError } from '@/lib/api-response';
import { authOptions } from '@/lib/auth-options';
import { hasPermission, type Permission } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import type { AuthenticatedUser } from '@/types/auth';

function unauthenticated(): ApiError {
  return new ApiError(401, 'UNAUTHENTICATED', 'You must be logged in.');
}

/**
 * Checks the session, then reads the user's status and permissions from the
 * database, so role changes and deactivations apply on the next request.
 */
export async function requirePermission(
  ...required: Permission[]
): Promise<AuthenticatedUser> {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    throw unauthenticated();
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      isActive: true,
      employee: { select: { isActive: true, deletedAt: true } },
      role: { select: { permissions: { select: { permission: true } } } },
    },
  });

  const isActive =
    user?.isActive && user.employee.isActive && !user.employee.deletedAt;
  if (!user || !isActive) {
    throw unauthenticated();
  }

  const granted = user.role.permissions.map((p) => p.permission);
  if (!required.every((permission) => hasPermission(granted, permission))) {
    throw new ApiError(
      403,
      'FORBIDDEN',
      'You do not have permission to do this.',
    );
  }

  return { id: user.id };
}
