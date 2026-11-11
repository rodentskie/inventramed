'use client';

import { Flex, Tag } from '@chakra-ui/react';
import { Field, NativeSelectField, NativeSelectRoot } from '@inventra-med/components';
import { useListFilters } from '@/hooks/use-list-filters';
import { REASON_LABELS } from '@/lib/format';

interface TransactionFiltersProps {
  /** The medicine and batch filters as text, or null when neither is set. */
  medicineLabel: string | null;
}

const REASON_ITEMS = [
  { value: '', label: 'All' },
  ...Object.entries(REASON_LABELS).map(([value, label]) => ({ value, label })),
];

const DIRECTION_ITEMS = [
  { value: '', label: 'All' },
  { value: 'IN', label: 'In' },
  { value: 'OUT', label: 'Out' },
];

/** The medicine filter comes from links on the medicine page, so it can only be removed here. */
export function TransactionFilters({ medicineLabel }: TransactionFiltersProps) {
  const { get, setFilters } = useListFilters();

  return (
    <Flex align="flex-end" gap="4" wrap="wrap">
      {medicineLabel && (
        // Chakra's parts directly, because the Tag snippet's close button has no label.
        <Tag.Root size="lg" variant="outline" colorPalette="teal">
          <Tag.Label>Medicine: {medicineLabel}</Tag.Label>
          <Tag.EndElement>
            <Tag.CloseTrigger
              aria-label="Remove medicine filter"
              onClick={() => setFilters({ medicineId: null, batchId: null })}
            />
          </Tag.EndElement>
        </Tag.Root>
      )}
      <Field label="Reason" width="48">
        <NativeSelectRoot size="sm">
          <NativeSelectField
            items={REASON_ITEMS}
            value={get('reason')}
            onChange={(event) => setFilters({ reason: event.currentTarget.value })}
          />
        </NativeSelectRoot>
      </Field>
      <Field label="Direction" width="32">
        <NativeSelectRoot size="sm">
          <NativeSelectField
            items={DIRECTION_ITEMS}
            value={get('direction')}
            onChange={(event) => setFilters({ direction: event.currentTarget.value })}
          />
        </NativeSelectRoot>
      </Field>
    </Flex>
  );
}
