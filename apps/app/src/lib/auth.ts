import 'server-only';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { ApiError } from '@/lib/api-response';
import { authOptions } from '@/lib/auth-options';
import { hasPermission, type Permission } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import type { ActiveUser, AuthenticatedUser, CurrentUser } from '@/types/auth';

function unauthenticated(): ApiError {
  return new ApiError(401, 'UNAUTHENTICATED', 'You must be logged in.');
}

interface AccountStatus {
  isActive: boolean;
  employee: { isActive: boolean; deletedAt: Date | null };
}

function isAccountActive(user: AccountStatus): boolean {
  return user.isActive && user.employee.isActive && !user.employee.deletedAt;
}

/**
 * For pages, which redirect instead of returning an API error. Reads the
 * database, so a deactivated user with a valid session gets null.
 */
export async function getActiveUser(): Promise<ActiveUser | null> {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      isActive: true,
      employee: { select: { isActive: true, deletedAt: true } },
    },
  });

  if (!user || !isAccountActive(user)) {
    return null;
  }

  return { id: user.id, username: user.username };
}

/**
 * For pages inside the app shell. Like `getActiveUser`, but also returns the
 * name, role and permissions. `cache` lets the layout and page share one read.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      isActive: true,
      employee: {
        select: {
          firstName: true,
          lastName: true,
          isActive: true,
          deletedAt: true,
        },
      },
      role: {
        select: { name: true, permissions: { select: { permission: true } } },
      },
    },
  });

  if (!user || !isAccountActive(user)) {
    return null;
  }

  return {
    id: user.id,
    username: user.username,
    firstName: user.employee.firstName,
    lastName: user.employee.lastName,
    roleName: user.role.name,
    permissions: user.role.permissions.map((p) => p.permission),
  };
});

/**
 * For pages that need a permission. Redirects to `/login` without a user and
 * to `/` without the permission; the nav already hides the link, so this only
 * catches typed URLs. Actions still check with `requirePermission`.
 */
export async function requirePageUser(permission?: Permission): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }
  if (permission && !hasPermission(user.permissions, permission)) {
    redirect('/');
  }
  return user;
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

  if (!user || !isAccountActive(user)) {
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
