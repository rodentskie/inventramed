import 'server-only';
import { prisma } from '@/lib/prisma';
import type { RoleSummary } from '@/types/role';

export function listRoles(): Promise<RoleSummary[]> {
  return prisma.role.findMany({
    select: { id: true, name: true, description: true },
    orderBy: { name: 'asc' },
  });
}
