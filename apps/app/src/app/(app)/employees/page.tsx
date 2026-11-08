import { Button, Flex, Stack } from '@chakra-ui/react';
import type { Metadata } from 'next';
import NextLink from 'next/link';
import { redirect } from 'next/navigation';
import { LuPlus } from 'react-icons/lu';
import { ListPagination } from '@/components/common/ListPagination';
import { SearchInput } from '@/components/common/SearchInput';
import { StatusSwitch } from '@/components/common/StatusSwitch';
import { EmployeeTable } from '@/components/employees/EmployeeTable';
import { PageHeader } from '@/components/layout/PageHeader';
import { requirePageUser } from '@/lib/auth';
import { listEmployees } from '@/lib/employees';
import { parseListQuery, type SearchParams } from '@/lib/list-query';
import { EMPLOYEE_PERMISSIONS } from '@/lib/permissions';
import { employeeListQuerySchema } from '@/lib/validations/employee';

export const metadata: Metadata = { title: 'Employees' };

interface EmployeesPageProps {
  searchParams: Promise<SearchParams>;
}

export default async function EmployeesPage({ searchParams }: EmployeesPageProps) {
  await requirePageUser(...EMPLOYEE_PERMISSIONS);
  const query = parseListQuery(employeeListQuerySchema, await searchParams);
  const list = await listEmployees(query);

  // A page past the end, e.g. after deletes, goes to the last page instead of looking empty.
  if (list.items.length === 0 && list.total > 0) {
    const params = new URLSearchParams();
    if (query.search) {
      params.set('search', query.search);
    }
    if (query.status === 'all') {
      params.set('status', 'all');
    }
    params.set('page', String(Math.ceil(list.total / list.pageSize)));
    redirect(`/employees?${params}`);
  }

  return (
    <Stack gap="6">
      <PageHeader
        title="Employees"
        actions={
          <Button asChild size="sm" colorPalette="teal">
            <NextLink href="/employees/new">
              <LuPlus />
              New employee
            </NextLink>
          </Button>
        }
      />
      <Flex justify="space-between" align="center" gap="4" wrap="wrap">
        <SearchInput
          label="Search employees"
          placeholder="Search by name, email or username…"
        />
        <StatusSwitch label="Show inactive" />
      </Flex>
      <EmployeeTable items={list.items} search={query.search} />
      <ListPagination total={list.total} page={list.page} pageSize={list.pageSize} />
    </Stack>
  );
}
