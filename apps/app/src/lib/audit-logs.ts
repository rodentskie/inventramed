import 'server-only';
import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { addDays, startOfLocalDay } from '@/lib/expiry';
import {
  auditLogListQuerySchema,
  type AuditLogListQuery,
  type AuditLogPageQuery,
} from '@/lib/validations/audit-log';
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

export type AuditLogQueryResult =
  | { query: AuditLogListQuery; toError: null }
  | { query: null; toError: string };

/**
 * Turns the page's local dates into the list query. `from` is the start of its day in
 * the timezone, and `to` the start of the next day, so the chosen `to` day is included.
 */
export function buildAuditLogQuery(
  { from, to, ...rest }: AuditLogPageQuery,
  timezone: string,
): AuditLogQueryResult {
  const result = auditLogListQuerySchema.safeParse({
    ...rest,
    from: from && startOfLocalDay(from, timezone).toISOString(),
    to: to && startOfLocalDay(addDays(to, 1), timezone).toISOString(),
  });
  if (result.success) {
    return { query: result.data, toError: null };
  }
  const issue = result.error.issues.find((item) => item.path[0] === 'to');
  return { query: null, toError: issue?.message ?? 'Invalid date range.' };
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
