import { HStack, Link, Table } from '@chakra-ui/react';
import { EmptyState, Tag } from '@inventra-med/components';
import NextLink from 'next/link';
import { LuHistory, LuSearchX } from 'react-icons/lu';
import { SignedQuantity } from '@/components/history/SignedQuantity';
import { formatLocalDateTime, formatMedicineName, REASON_LABELS } from '@/lib/format';
import type { InventoryTransaction, InventoryTransactionMedicine } from '@/types/inventory';

interface TransactionTableProps {
  items: InventoryTransaction[];
  /** `settings.timezone`, so times are local. */
  timezone: string;
  /** Any filter is set, which changes the empty state. */
  filtered: boolean;
}

export function MedicineLabel({ medicine }: { medicine: InventoryTransactionMedicine }) {
  return (
    <HStack gap="2" wrap="wrap">
      {formatMedicineName(medicine.name, medicine.strength)}
      {medicine.deleted && (
        <Tag size="sm" variant="outline" colorPalette="gray">
          Deleted
        </Tag>
      )}
    </HStack>
  );
}

function TransactionRow({ item, timezone }: { item: InventoryTransaction; timezone: string }) {
  return (
    <Table.Row>
      <Table.Cell whiteSpace="nowrap">
        <Link asChild color="fg" textDecoration="underline" textUnderlineOffset="3px">
          <NextLink href={`/inventory/transactions/${item.id}`}>
            <time dateTime={item.createdAt}>{formatLocalDateTime(item.createdAt, timezone)}</time>
          </NextLink>
        </Link>
      </Table.Cell>
      <Table.Cell>{REASON_LABELS[item.reason]}</Table.Cell>
      <Table.Cell textAlign="end">
        <SignedQuantity
          direction={item.direction}
          quantity={item.quantity}
          unit={item.medicine.unit}
        />
      </Table.Cell>
      <Table.Cell>
        <MedicineLabel medicine={item.medicine} />
      </Table.Cell>
      <Table.Cell>{item.performedBy.username}</Table.Cell>
    </Table.Row>
  );
}

export function TransactionTable({ items, timezone, filtered }: TransactionTableProps) {
  if (items.length === 0) {
    return (
      <EmptyState
        borderWidth="1px"
        borderColor="border"
        rounded="md"
        icon={filtered ? <LuSearchX /> : <LuHistory />}
        title="No transactions"
        description={filtered ? 'No transactions match these filters.' : undefined}
      />
    );
  }

  return (
    <Table.ScrollArea borderWidth="1px" borderColor="border" rounded="md">
      <Table.Root size="sm" minW="2xl">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader>When</Table.ColumnHeader>
            <Table.ColumnHeader>Reason</Table.ColumnHeader>
            <Table.ColumnHeader textAlign="end">Qty</Table.ColumnHeader>
            <Table.ColumnHeader>Medicine</Table.ColumnHeader>
            <Table.ColumnHeader>By</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {items.map((item) => (
            <TransactionRow key={item.id} item={item} timezone={timezone} />
          ))}
        </Table.Body>
      </Table.Root>
    </Table.ScrollArea>
  );
}
