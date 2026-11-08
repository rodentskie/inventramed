import { Stack } from '@chakra-ui/react';
import type { Metadata } from 'next';
import { EmployeeForm } from '@/components/employees/EmployeeForm';
import { PageHeader } from '@/components/layout/PageHeader';
import { requirePageUser } from '@/lib/auth';
import { EMPLOYEE_PERMISSIONS } from '@/lib/permissions';
import { listRoles } from '@/lib/roles';

export const metadata: Metadata = { title: 'New employee' };

export default async function NewEmployeePage() {
  await requirePageUser(...EMPLOYEE_PERMISSIONS);
  const roles = await listRoles();

  return (
    <Stack gap="6">
      <PageHeader title="New employee" />
      <EmployeeForm roles={roles} />
    </Stack>
  );
}
