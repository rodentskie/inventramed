import { Stack, Table, Text } from '@chakra-ui/react';
import { EmptyState, Status } from '@inventra-med/components';
import { LuShieldCheck } from 'react-icons/lu';
import { SectionHeading } from '@/components/dashboard/SectionHeading';
import { formatCount, formatDaysToExpiry, formatMedicineName } from '@/lib/format';
import type { AttentionBatch, AttentionList } from '@/types/dashboard';

function AttentionRow({ batch }: { batch: AttentionBatch }) {
  return (
    <Table.Row>
      <Table.Cell fontWeight="medium">
        {formatMedicineName(batch.medicineName, batch.strength)}
      </Table.Cell>
      <Table.Cell>{batch.batchNumber}</Table.Cell>
      <Table.Cell>{batch.expirationDate}</Table.Cell>
      <Table.Cell>
        <Status value={batch.status === 'EXPIRED' ? 'error' : 'warning'}>
          {formatDaysToExpiry(batch.daysToExpiry)}
        </Status>
      </Table.Cell>
      <Table.Cell textAlign="end">
        {formatCount(batch.quantity)} {batch.unit}
      </Table.Cell>
    </Table.Row>
  );
}

export function AttentionTable({ list }: { list: AttentionList }) {
  return (
    <Stack as="section" gap="3">
      <SectionHeading
        title="Needs attention"
        description="Expired and near-expiry batches still in stock, oldest expiry first."
      />
      {list.items.length === 0 ? (
        <EmptyState
          borderWidth="1px"
          borderColor="border"
          rounded="md"
          icon={<LuShieldCheck />}
          title="All stock is safe"
          description={`No batch is expired or expiring within ${list.threshold} days.`}
        />
      ) : (
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
              {list.items.map((batch) => (
                <AttentionRow key={batch.id} batch={batch} />
              ))}
            </Table.Body>
          </Table.Root>
        </Table.ScrollArea>
      )}
      {list.total > list.items.length && (
        <Text textStyle="sm" color="fg.muted">
          Showing {list.items.length} of {formatCount(list.total)} batches.
        </Text>
      )}
    </Stack>
  );
}
