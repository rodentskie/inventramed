import { Link, Table } from '@chakra-ui/react';
import { EmptyState } from '@inventra-med/components';
import NextLink from 'next/link';
import type { ReactNode } from 'react';
import { LuPill, LuSearchX } from 'react-icons/lu';
import { formatCount } from '@/lib/format';
import type { Medicine } from '@/types/medicine';

interface MedicineTableProps {
  items: Medicine[];
  search?: string;
  /** Shown in the empty state when there are no medicines at all, e.g. the New button. */
  emptyAction?: ReactNode;
}

const DASH = '—';

function MedicineRow({ medicine }: { medicine: Medicine }) {
  return (
    <Table.Row>
      <Table.Cell fontWeight="medium">
        <Link asChild color="fg" textDecoration="underline" textUnderlineOffset="3px">
          <NextLink href={`/medicines/${medicine.id}`}>{medicine.name}</NextLink>
        </Link>
      </Table.Cell>
      <Table.Cell color="fg.muted">{medicine.genericName ?? DASH}</Table.Cell>
      <Table.Cell>{medicine.strength ?? DASH}</Table.Cell>
      <Table.Cell>{medicine.dosageForm ?? DASH}</Table.Cell>
      <Table.Cell textAlign="end" whiteSpace="nowrap">
        {formatCount(medicine.totalStock)} {medicine.unit}
      </Table.Cell>
    </Table.Row>
  );
}

export function MedicineTable({ items, search, emptyAction }: MedicineTableProps) {
  if (items.length === 0) {
    return search ? (
      <EmptyState
        borderWidth="1px"
        borderColor="border"
        rounded="md"
        icon={<LuSearchX />}
        title={`No medicines match "${search}"`}
        description="Try a different name or generic name."
      />
    ) : (
      <EmptyState
        borderWidth="1px"
        borderColor="border"
        rounded="md"
        icon={<LuPill />}
        title="No medicines yet"
        description="Medicines you add appear here."
      >
        {emptyAction}
      </EmptyState>
    );
  }

  return (
    <Table.ScrollArea borderWidth="1px" borderColor="border" rounded="md">
      <Table.Root size="sm" minW="xl">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader>Name</Table.ColumnHeader>
            <Table.ColumnHeader>Generic name</Table.ColumnHeader>
            <Table.ColumnHeader>Strength</Table.ColumnHeader>
            <Table.ColumnHeader>Form</Table.ColumnHeader>
            <Table.ColumnHeader textAlign="end">Stock</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {items.map((medicine) => (
            <MedicineRow key={medicine.id} medicine={medicine} />
          ))}
        </Table.Body>
      </Table.Root>
    </Table.ScrollArea>
  );
}
