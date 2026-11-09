'use client';

import { useFilter, useListCollection } from '@chakra-ui/react';
import {
  ComboboxContent,
  ComboboxControl,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxRoot,
} from '@inventra-med/components';

interface TimezoneSelectProps {
  value: string;
  onChange: (value: string) => void;
}

/** A saved name the runtime lists under another alias, such as `UTC`, stays selectable. */
function getTimezones(current: string): string[] {
  const zones = Intl.supportedValuesOf('timeZone');
  return zones.includes(current) ? zones : [current, ...zones];
}

/** Lists IANA names only, so a UTC offset can't be picked. */
export function TimezoneSelect({ value, onChange }: TimezoneSelectProps) {
  const { contains } = useFilter({ sensitivity: 'base' });
  const { collection, filter } = useListCollection({
    initialItems: getTimezones(value),
    filter: contains,
  });

  return (
    <ComboboxRoot
      collection={collection}
      value={[value]}
      openOnClick
      lazyMount
      unmountOnExit
      onValueChange={(details) => {
        // Clearing the text empties the selection; a timezone is always required.
        if (details.value[0]) {
          onChange(details.value[0]);
        }
      }}
      onInputValueChange={(details) => {
        // Only typing filters, so reopening shows every timezone and not just the selected one.
        filter(details.reason === 'input-change' ? details.inputValue : '');
      }}
    >
      <ComboboxControl>
        <ComboboxInput placeholder="Search timezones" />
      </ComboboxControl>
      <ComboboxContent maxH="xs" overflowY="auto">
        <ComboboxEmpty>No matching timezone</ComboboxEmpty>
        {collection.items.map((item) => (
          <ComboboxItem key={item} item={item}>
            {item}
          </ComboboxItem>
        ))}
      </ComboboxContent>
    </ComboboxRoot>
  );
}
