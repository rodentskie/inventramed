import { Stack } from '@chakra-ui/react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ListPagination } from '@/components/common/ListPagination';
import { SearchInput } from '@/components/common/SearchInput';
import { PageHeader } from '@/components/layout/PageHeader';
import { MedicineFormDialog } from '@/components/medicines/MedicineFormDialog';
import { MedicineTable } from '@/components/medicines/MedicineTable';
import { requirePageUser } from '@/lib/auth';
import { parseListQuery, type SearchParams } from '@/lib/list-query';
import { listMedicines } from '@/lib/medicines';
import { hasPermission } from '@/lib/permissions';
import { medicineListQuerySchema } from '@/lib/validations/medicine';

export const metadata: Metadata = { title: 'Medicines' };

interface MedicinesPageProps {
  searchParams: Promise<SearchParams>;
}

export default async function MedicinesPage({ searchParams }: MedicinesPageProps) {
  const user = await requirePageUser('medicine:read');
  const query = parseListQuery(medicineListQuerySchema, await searchParams);
  const list = await listMedicines(query);

  // A page past the end, e.g. after deletes, goes to the last page instead of looking empty.
  if (list.items.length === 0 && list.total > 0) {
    const params = new URLSearchParams();
    if (query.search) {
      params.set('search', query.search);
    }
    params.set('page', String(Math.ceil(list.total / list.pageSize)));
    redirect(`/medicines?${params}`);
  }

  const newButton = hasPermission(user.permissions, 'medicine:write') ? (
    <MedicineFormDialog />
  ) : undefined;

  return (
    <Stack gap="6">
      <PageHeader title="Medicines" actions={newButton} />
      <SearchInput
        label="Search medicines"
        placeholder="Search by name or generic name…"
      />
      <MedicineTable items={list.items} search={query.search} emptyAction={newButton} />
      <ListPagination total={list.total} page={list.page} pageSize={list.pageSize} />
    </Stack>
  );
}
