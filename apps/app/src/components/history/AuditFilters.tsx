'use client';

import { Flex, Input } from '@chakra-ui/react';
import { Field, NativeSelectField, NativeSelectRoot } from '@inventra-med/components';
import { useListFilters } from '@/hooks/use-list-filters';
import { AUDIT_ENTITY_LABELS } from '@/lib/audit-diff';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '@/lib/validations/audit-log';

interface AuditFiltersProps {
  /** The schema's message when `to` is before `from`. */
  toError: string | null;
}

const TYPE_ITEMS = [
  { value: '', label: 'All' },
  ...AUDIT_ENTITY_TYPES.map((value) => ({ value, label: AUDIT_ENTITY_LABELS[value] })),
];

const ACTION_ITEMS = [
  { value: '', label: 'All' },
  ...AUDIT_ACTIONS.map((value) => ({ value, label: value })),
];

/** Dates are local days in the facility's timezone; the page turns them into a range. */
export function AuditFilters({ toError }: AuditFiltersProps) {
  const { get, setFilters } = useListFilters();

  return (
    <Flex align="flex-start" gap="4" wrap="wrap">
      <Field label="Type" width="48">
        <NativeSelectRoot size="sm">
          <NativeSelectField
            items={TYPE_ITEMS}
            value={get('entityType')}
            onChange={(event) => setFilters({ entityType: event.currentTarget.value })}
          />
        </NativeSelectRoot>
      </Field>
      <Field label="Action" width="32">
        <NativeSelectRoot size="sm">
          <NativeSelectField
            items={ACTION_ITEMS}
            value={get('action')}
            onChange={(event) => setFilters({ action: event.currentTarget.value })}
          />
        </NativeSelectRoot>
      </Field>
      <Field label="From" width="44">
        <Input
          type="date"
          size="sm"
          value={get('from')}
          onChange={(event) => setFilters({ from: event.currentTarget.value })}
        />
      </Field>
      <Field label="To" width="44" invalid={Boolean(toError)} errorText={toError}>
        <Input
          type="date"
          size="sm"
          value={get('to')}
          onChange={(event) => setFilters({ to: event.currentTarget.value })}
        />
      </Field>
    </Flex>
  );
}
