import { Table } from '@chakra-ui/react';
import { EmptyState, Status } from '@inventra-med/components';
import { LuPackageOpen } from 'react-icons/lu';
import { BatchRowMenu, type BatchMovements } from '@/components/medicines/BatchRowMenu';
import { getLocalToday } from '@/lib/expiry';
import { formatCount, formatDaysToExpiry } from '@/lib/format';
import type { BatchExpiryStatus, MedicineBatch } from '@/types/medicine';

const STATUS_VALUES: Record<BatchExpiryStatus, 'error' | 'warning' | 'success'> = {
  EXPIRED: 'error',
  NEAR_EXPIRY: 'warning',
  SAFE: 'success',
};

interface BatchTableProps {
  batches: MedicineBatch[];
  unit: string;
  canEdit: boolean;
  /** `settings.timezone`, so the received date is the local day. */
  timezone: string;
  /** A scanned batch, marked so it stands out. */
  highlightId?: string;
  /** Adds the batch movements to each row's menu. */
  movements?: BatchMovements;
}

interface BatchRowProps {
  batch: MedicineBatch;
  unit: string;
  canEdit: boolean;
  timezone: string;
  highlighted: boolean;
  movements?: BatchMovements;
}

function BatchRow({ batch, unit, canEdit, timezone, highlighted, movements }: BatchRowProps) {
  const empty = batch.quantity === 0;
  return (
    <Table.Row
      color={empty ? 'fg.muted' : undefined}
      bg={highlighted ? 'bg.emphasized' : undefined}
      aria-current={highlighted || undefined}
    >
      <Table.Cell fontWeight="medium">{batch.batchNumber}</Table.Cell>
      <Table.Cell fontFamily="mono" textStyle="xs">
        {batch.barcode}
      </Table.Cell>
      <Table.Cell whiteSpace="nowrap">{batch.expirationDate}</Table.Cell>
      <Table.Cell whiteSpace="nowrap">
        <Status value={STATUS_VALUES[batch.status]}>
          {formatDaysToExpiry(batch.daysToExpiry)}
        </Status>
      </Table.Cell>
      <Table.Cell whiteSpace="nowrap">{getLocalToday(timezone, new Date(batch.receivedAt))}</Table.Cell>
      <Table.Cell textAlign="end" whiteSpace="nowrap">
        {formatCount(batch.quantity)} {unit}
      </Table.Cell>
      <Table.Cell textAlign="end" width="1">
        <BatchRowMenu batch={batch} canEdit={canEdit} movements={movements} />
      </Table.Cell>
    </Table.Row>
  );
}

/** Batches in FEFO order, as `getMedicine` returns them. Empty batches stay for their history. */
export function BatchTable({
  batches,
  unit,
  canEdit,
  timezone,
  highlightId,
  movements,
}: BatchTableProps) {
  if (batches.length === 0) {
    return (
      <EmptyState
        borderWidth="1px"
        borderColor="border"
        rounded="md"
        icon={<LuPackageOpen />}
        title="No stock received yet"
      />
    );
  }

  return (
    <Table.ScrollArea borderWidth="1px" borderColor="border" rounded="md">
      <Table.Root size="sm" minW="3xl">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader>Batch</Table.ColumnHeader>
            <Table.ColumnHeader>Barcode</Table.ColumnHeader>
            <Table.ColumnHeader>Expires</Table.ColumnHeader>
            <Table.ColumnHeader>Status</Table.ColumnHeader>
            <Table.ColumnHeader>Received</Table.ColumnHeader>
            <Table.ColumnHeader textAlign="end">Qty</Table.ColumnHeader>
            <Table.ColumnHeader>
              <span hidden>Actions</span>
            </Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {batches.map((batch) => (
            <BatchRow
              key={batch.id}
              batch={batch}
              unit={unit}
              canEdit={canEdit}
              timezone={timezone}
              highlighted={batch.id === highlightId}
              movements={movements}
            />
          ))}
        </Table.Body>
      </Table.Root>
    </Table.ScrollArea>
  );
}
