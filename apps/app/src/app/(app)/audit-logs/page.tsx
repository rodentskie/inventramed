import { Stack } from '@chakra-ui/react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ListPagination } from '@/components/common/ListPagination';
import { AuditFilters } from '@/components/history/AuditFilters';
import { AuditLogTable } from '@/components/history/AuditLogTable';
import { PageHeader } from '@/components/layout/PageHeader';
import { buildAuditLogQuery, listAuditLogs } from '@/lib/audit-logs';
import { requirePageUser } from '@/lib/auth';
import { parseListQuery, type SearchParams } from '@/lib/list-query';
import { hasPermission } from '@/lib/permissions';
import { getSettings } from '@/lib/settings';
import { auditLogPageQuerySchema } from '@/lib/validations/audit-log';
import type { AuditLogList } from '@/types/audit-log';

export const metadata: Metadata = { title: 'Audit logs' };

interface AuditLogsPageProps {
  searchParams: Promise<SearchParams>;
}

const FILTER_KEYS = ['entityType', 'action', 'from', 'to'] as const;

/** Which entity types' records the user can open, so the others show as plain text. */
function getLinkableTypes(permissions: string[]): string[] {
  return [
    ...(hasPermission(permissions, 'medicine:read') ? ['medicines', 'medicine_batches'] : []),
    ...(hasPermission(permissions, 'inventory:read')
      ? ['inventory_transactions', 'inventory_entries']
      : []),
  ];
}

export default async function AuditLogsPage({ searchParams }: AuditLogsPageProps) {
  const user = await requirePageUser('audit:read');
  const [pageQuery, settings] = await Promise.all([
    searchParams.then((params) => parseListQuery(auditLogPageQuerySchema, params)),
    getSettings(),
  ]);
  const { query, toError } = buildAuditLogQuery(pageQuery, settings.timezone);
  const list: AuditLogList = query
    ? await listAuditLogs(query)
    : { items: [], total: 0, page: 1, pageSize: pageQuery.pageSize };

  const filters = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const value = pageQuery[key];
    if (value) {
      filters.set(key, value);
    }
  }

  // A hand-edited page past the end goes to the last page instead of looking empty.
  if (list.items.length === 0 && list.total > 0) {
    filters.set('page', String(Math.ceil(list.total / list.pageSize)));
    redirect(`/audit-logs?${filters}`);
  }

  return (
    <Stack gap="6">
      <PageHeader title="Audit logs" />
      <AuditFilters toError={toError} />
      <AuditLogTable
        items={list.items}
        timezone={settings.timezone}
        linkableTypes={getLinkableTypes(user.permissions)}
        filtered={filters.size > 0}
      />
      <ListPagination total={list.total} page={list.page} pageSize={list.pageSize} />
    </Stack>
  );
}
