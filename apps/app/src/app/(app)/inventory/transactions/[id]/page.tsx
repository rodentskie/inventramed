import { Stack, Table, Text } from '@chakra-ui/react';
import { DataListItem, DataListRoot } from '@inventra-med/components';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { SectionHeading } from '@/components/dashboard/SectionHeading';
import { MedicineLabel } from '@/components/history/TransactionTable';
import { PageHeader } from '@/components/layout/PageHeader';
import { ApiError } from '@/lib/api-response';
import { getCurrentUser, requirePageUser } from '@/lib/auth';
import { formatCount, formatLocalDateTime, REASON_LABELS } from '@/lib/format';
import { getTransaction } from '@/lib/inventory';
import { hasPermission } from '@/lib/permissions';
import { getSettings } from '@/lib/settings';
import { idSchema } from '@/lib/validations/common';
import type { InventoryTransaction } from '@/types/inventory';

interface TransactionPageProps {
  params: Promise<{ id: string }>;
}

const DASH = '—';

/** Shared by the metadata and the page. `null` for a bad ID or a missing transaction. */
const loadTransaction = cache(async (id: string): Promise<InventoryTransaction | null> => {
  if (!idSchema.safeParse(id).success) {
    return null;
  }
  try {
    return await getTransaction(id);
  } catch (error) {
    if (error instanceof ApiError && error.code === 'NOT_FOUND') {
      return null;
    }
    throw error;
  }
});

export async function generateMetadata({ params }: TransactionPageProps): Promise<Metadata> {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.permissions, 'inventory:read')) {
    return { title: 'Transactions' };
  }
  const transaction = await loadTransaction((await params).id);
  return { title: transaction ? REASON_LABELS[transaction.reason] : 'Not found' };
}

/** `Dispensed −20 pc`. */
function formatTransactionTitle({ reason, direction, quantity, medicine }: InventoryTransaction) {
  const sign = direction === 'IN' ? '+' : '−';
  return `${REASON_LABELS[reason]} ${sign}${formatCount(quantity)} ${medicine.unit}`;
}

function EntriesTable({ transaction }: { transaction: InventoryTransaction }) {
  return (
    <Table.ScrollArea borderWidth="1px" borderColor="border" rounded="md">
      <Table.Root size="sm" minW="md">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader>Batch</Table.ColumnHeader>
            <Table.ColumnHeader>Expires</Table.ColumnHeader>
            <Table.ColumnHeader textAlign="end">Qty</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {transaction.entries.map((entry) => (
            <Table.Row key={entry.id}>
              <Table.Cell fontWeight="medium">{entry.batchNumber}</Table.Cell>
              <Table.Cell whiteSpace="nowrap">{entry.expirationDate}</Table.Cell>
              <Table.Cell textAlign="end" whiteSpace="nowrap">
                {formatCount(entry.quantity)} {transaction.medicine.unit}
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </Table.ScrollArea>
  );
}

export default async function TransactionPage({ params }: TransactionPageProps) {
  await requirePageUser('inventory:read');
  const [transaction, settings] = await Promise.all([
    loadTransaction((await params).id),
    getSettings(),
  ]);
  if (!transaction) {
    notFound();
  }

  const { medicine } = transaction;

  return (
    <Stack gap="8">
      <PageHeader title={formatTransactionTitle(transaction)} />
      <DataListRoot
        orientation="vertical"
        size="md"
        display="grid"
        gridTemplateColumns={{ base: 'repeat(1, minmax(0, 1fr))', md: 'repeat(2, minmax(0, 1fr))' }}
        columnGap="6"
        rowGap="4"
      >
        <DataListItem label="Medicine" value={<MedicineLabel medicine={medicine} />} />
        <DataListItem label="By" value={transaction.performedBy.username} />
        <DataListItem
          label="When"
          value={
            <time dateTime={transaction.createdAt}>
              {formatLocalDateTime(transaction.createdAt, settings.timezone)}
            </time>
          }
        />
        <DataListItem
          label="Notes"
          value={
            <Text as="span" whiteSpace="pre-wrap" wordBreak="break-word">
              {transaction.notes ?? DASH}
            </Text>
          }
        />
      </DataListRoot>
      <Stack as="section" gap="3">
        <SectionHeading title="Batches" description="The batches this movement touched." />
        <EntriesTable transaction={transaction} />
      </Stack>
    </Stack>
  );
}
