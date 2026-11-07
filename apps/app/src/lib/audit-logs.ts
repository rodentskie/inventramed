import 'server-only';
import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import type { AuditLogListQuery } from '@/lib/validations/audit-log';
import type {
  AuditAction,
  AuditLog,
  AuditLogActor,
  AuditLogChanges,
  AuditLogList,
} from '@/types/audit-log';

type AuditLogRow = Prisma.AuditLogGetPayload<object>;

/** actor_id has no foreign key, so Prisma has no relation to include. */
async function findActors(
  rows: AuditLogRow[],
): Promise<Map<string, AuditLogActor>> {
  const ids = [
    ...new Set(rows.flatMap((row) => (row.actorId ? [row.actorId] : []))),
  ];
  if (ids.length === 0) {
    return new Map();
  }

  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, username: true },
  });
  return new Map(users.map((user) => [user.id, user]));
}

function toAuditLog(
  row: AuditLogRow,
  actors: Map<string, AuditLogActor>,
): AuditLog {
  return {
    id: row.id,
    entityType: row.entityType,
    entityId: row.entityId,
    action: row.action as AuditAction,
    changes: row.changes as unknown as AuditLogChanges | null,
    actor: (row.actorId && actors.get(row.actorId)) || null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listAuditLogs({
  entityType,
  entityId,
  action,
  actorId,
  from,
  to,
  page,
  pageSize,
}: AuditLogListQuery): Promise<AuditLogList> {
  const where: Prisma.AuditLogWhereInput = {
    entityType,
    entityId,
    action,
    actorId,
    createdAt: { gte: from, lt: to },
  };

  const [rows, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  const actors = await findActors(rows);
  return {
    items: rows.map((row) => toAuditLog(row, actors)),
    total,
    page,
    pageSize,
  };
}
