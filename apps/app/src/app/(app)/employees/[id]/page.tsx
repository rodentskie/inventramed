import { Stack } from '@chakra-ui/react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { EmployeeForm } from '@/components/employees/EmployeeForm';
import { EmployeeStatusActions } from '@/components/employees/EmployeeStatusActions';
import { PageHeader } from '@/components/layout/PageHeader';
import { ApiError } from '@/lib/api-response';
import { getCurrentUser, requirePageUser } from '@/lib/auth';
import { getEmployee } from '@/lib/employees';
import { formatEmployeeName } from '@/lib/format';
import { EMPLOYEE_PERMISSIONS, hasAllPermissions } from '@/lib/permissions';
import { listRoles } from '@/lib/roles';
import { idSchema } from '@/lib/validations/common';
import type { EmployeeWithUser } from '@/types/employee';

interface EmployeePageProps {
  params: Promise<{ id: string }>;
}

/** Shared by the metadata and the page. `null` for a bad ID or a deleted employee. */
const loadEmployee = cache(async (id: string): Promise<EmployeeWithUser | null> => {
  if (!idSchema.safeParse(id).success) {
    return null;
  }
  try {
    return await getEmployee(id);
  } catch (error) {
    if (error instanceof ApiError && error.code === 'NOT_FOUND') {
      return null;
    }
    throw error;
  }
});

export async function generateMetadata({ params }: EmployeePageProps): Promise<Metadata> {
  const user = await getCurrentUser();
  if (!user || !hasAllPermissions(user.permissions, EMPLOYEE_PERMISSIONS)) {
    return { title: 'Employees' };
  }
  const employee = await loadEmployee((await params).id);
  return { title: employee ? formatEmployeeName(employee) : 'Not found' };
}

export default async function EmployeePage({ params }: EmployeePageProps) {
  const user = await requirePageUser(...EMPLOYEE_PERMISSIONS);
  const [employee, roles] = await Promise.all([loadEmployee((await params).id), listRoles()]);
  if (!employee) {
    notFound();
  }

  const isSelf = employee.user.id === user.id;

  return (
    <Stack gap="6">
      <PageHeader
        title={formatEmployeeName(employee)}
        actions={<EmployeeStatusActions employee={employee} isSelf={isSelf} />}
      />
      <EmployeeForm roles={roles} employee={employee} isSelf={isSelf} />
    </Stack>
  );
}
