import { Link, Table } from '@chakra-ui/react';
import { EmptyState } from '@inventra-med/components';
import NextLink from 'next/link';
import { LuSearchX, LuUsers } from 'react-icons/lu';
import { EmployeeStatusTag } from '@/components/employees/EmployeeStatusTag';
import { capitalize, formatEmployeeName } from '@/lib/format';
import type { EmployeeWithUser } from '@/types/employee';

interface EmployeeTableProps {
  items: EmployeeWithUser[];
  search?: string;
}

const DASH = '—';

function EmployeeRow({ employee }: { employee: EmployeeWithUser }) {
  return (
    <Table.Row>
      <Table.Cell fontWeight="medium">
        <Link asChild color="fg" textDecoration="underline" textUnderlineOffset="3px">
          <NextLink href={`/employees/${employee.id}`}>{formatEmployeeName(employee)}</NextLink>
        </Link>
      </Table.Cell>
      <Table.Cell>{employee.user.username}</Table.Cell>
      <Table.Cell>{capitalize(employee.user.role)}</Table.Cell>
      <Table.Cell whiteSpace="nowrap">{employee.contactNumber ?? DASH}</Table.Cell>
      <Table.Cell>{employee.receivesSmsAlerts ? 'On' : 'Off'}</Table.Cell>
      <Table.Cell>
        <EmployeeStatusTag isActive={employee.isActive} />
      </Table.Cell>
    </Table.Row>
  );
}

export function EmployeeTable({ items, search }: EmployeeTableProps) {
  if (items.length === 0) {
    return (
      <EmptyState
        borderWidth="1px"
        borderColor="border"
        rounded="md"
        icon={search ? <LuSearchX /> : <LuUsers />}
        title={search ? `No employees match "${search}"` : 'No employees yet'}
        description={
          search ? 'Try a different name, email or username.' : 'Employees you add appear here.'
        }
      />
    );
  }

  return (
    <Table.ScrollArea borderWidth="1px" borderColor="border" rounded="md">
      <Table.Root size="sm" minW="2xl">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader>Name</Table.ColumnHeader>
            <Table.ColumnHeader>Username</Table.ColumnHeader>
            <Table.ColumnHeader>Role</Table.ColumnHeader>
            <Table.ColumnHeader>Contact</Table.ColumnHeader>
            <Table.ColumnHeader>SMS</Table.ColumnHeader>
            <Table.ColumnHeader>Status</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {items.map((employee) => (
            <EmployeeRow key={employee.id} employee={employee} />
          ))}
        </Table.Body>
      </Table.Root>
    </Table.ScrollArea>
  );
}
