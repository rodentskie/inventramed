import { Link, Table } from '@chakra-ui/react';
import { Status } from '@inventra-med/components';
import NextLink from 'next/link';
import { formatCount, formatDaysToExpiry, formatMedicineName } from '@/lib/format';
import type { NotificationItem } from '@/types/notification';

interface DigestItemsTableProps {
  items: NotificationItem[];
  /** Live quantity by batch ID. Rows show it next to the snapshot when they differ. */
  currentQuantities: Record<string, number>;
  /** The user has `medicine:read`, so the medicine page is open to them. */
  canViewMedicines: boolean;
}

interface DigestItemRowProps {
  item: NotificationItem;
  currentQuantity: number | undefined;
  canViewMedicines: boolean;
}

function DigestItemRow({ item, currentQuantity, canViewMedicines }: DigestItemRowProps) {
  const name = formatMedicineName(item.medicineName, item.strength);
  const changed = currentQuantity !== undefined && currentQuantity !== item.quantity;

  return (
    <Table.Row>
      <Table.Cell fontWeight="medium">
        {canViewMedicines ? (
          <Link asChild color="fg" textDecoration="underline" textUnderlineOffset="3px">
            <NextLink href={`/medicines/${item.medicineId}`}>{name}</NextLink>
          </Link>
        ) : (
          name
        )}
      </Table.Cell>
      <Table.Cell>{item.batchNumber}</Table.Cell>
      <Table.Cell>{item.expirationDate}</Table.Cell>
      <Table.Cell>
        <Status value={item.status === 'EXPIRED' ? 'error' : 'warning'}>
          {formatDaysToExpiry(item.daysToExpiry)}
        </Status>
      </Table.Cell>
      <Table.Cell textAlign="end" whiteSpace="nowrap">
        {formatCount(item.quantity)} {item.unit}
        {changed && ` (now ${formatCount(currentQuantity)})`}
      </Table.Cell>
    </Table.Row>
  );
}

export function DigestItemsTable({
  items,
  currentQuantities,
  canViewMedicines,
}: DigestItemsTableProps) {
  return (
    <Table.ScrollArea borderWidth="1px" borderColor="border" rounded="md">
      <Table.Root size="sm" minW="xl">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader>Medicine</Table.ColumnHeader>
            <Table.ColumnHeader>Batch</Table.ColumnHeader>
            <Table.ColumnHeader>Expires</Table.ColumnHeader>
            <Table.ColumnHeader>Status</Table.ColumnHeader>
            <Table.ColumnHeader textAlign="end">Qty</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {items.map((item) => (
            <DigestItemRow
              key={item.id}
              item={item}
              currentQuantity={currentQuantities[item.batchId]}
              canViewMedicines={canViewMedicines}
            />
          ))}
        </Table.Body>
      </Table.Root>
    </Table.ScrollArea>
  );
}
