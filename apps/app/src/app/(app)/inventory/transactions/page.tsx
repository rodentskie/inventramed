import { Stack } from '@chakra-ui/react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ListPagination } from '@/components/common/ListPagination';
import { TransactionFilters } from '@/components/history/TransactionFilters';
import { TransactionTable } from '@/components/history/TransactionTable';
import { PageHeader } from '@/components/layout/PageHeader';
import { requirePageUser } from '@/lib/auth';
import { getTransactionFilterLabel, listTransactions } from '@/lib/inventory';
import { parseListQuery, type SearchParams } from '@/lib/list-query';
import { getSettings } from '@/lib/settings';
import { transactionListQuerySchema } from '@/lib/validations/inventory';

export const metadata: Metadata = { title: 'Transactions' };

interface TransactionsPageProps {
  searchParams: Promise<SearchParams>;
}

const FILTER_KEYS = ['medicineId', 'batchId', 'reason', 'direction'] as const;

export default async function TransactionsPage({ searchParams }: TransactionsPageProps) {
  await requirePageUser('inventory:read');
  const query = parseListQuery(transactionListQuerySchema, await searchParams);
  const [list, settings, medicineLabel] = await Promise.all([
    listTransactions(query),
    getSettings(),
    getTransactionFilterLabel(query.medicineId, query.batchId),
  ]);

  const filters = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const value = query[key];
    if (value) {
      filters.set(key, value);
    }
  }

  // A hand-edited page past the end goes to the last page instead of looking empty.
  if (list.items.length === 0 && list.total > 0) {
    filters.set('page', String(Math.ceil(list.total / list.pageSize)));
    redirect(`/inventory/transactions?${filters}`);
  }

  return (
    <Stack gap="6">
      <PageHeader title="Transactions" />
      <TransactionFilters medicineLabel={medicineLabel} />
      <TransactionTable
        items={list.items}
        timezone={settings.timezone}
        filtered={filters.size > 0}
      />
      <ListPagination total={list.total} page={list.page} pageSize={list.pageSize} />
    </Stack>
  );
}
