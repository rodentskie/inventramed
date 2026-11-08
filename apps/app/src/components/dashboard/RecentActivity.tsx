import { Flex, Stack, StackSeparator, Text } from '@chakra-ui/react';
import { EmptyState, Tooltip } from '@inventra-med/components';
import { LuHistory } from 'react-icons/lu';
import { SectionHeading } from '@/components/dashboard/SectionHeading';
import {
  formatCount,
  formatMedicineName,
  formatRelativeTime,
  REASON_LABELS,
} from '@/lib/format';
import type { ActivityItem } from '@/types/dashboard';

interface ActivityRowProps {
  item: ActivityItem;
  now: Date;
}

function ActivityRow({ item, now }: ActivityRowProps) {
  const sign = item.direction === 'IN' ? '+' : '−';

  return (
    <Flex wrap="wrap" align="baseline" columnGap="3" rowGap="1" px="4" py="3" textStyle="sm">
      <Text fontWeight="medium" minW="28">
        {REASON_LABELS[item.reason]}
      </Text>
      <Text color={item.direction === 'IN' ? 'green.fg' : 'fg'} fontVariantNumeric="tabular-nums">
        {sign}
        {formatCount(item.quantity)} {item.unit}
      </Text>
      <Text flex="1" minW="0">
        {formatMedicineName(item.medicineName, item.strength)}
      </Text>
      <Text color="fg.muted">by {item.performedBy}</Text>
      <Tooltip content={item.exactTime}>
        <Text asChild color="fg.muted">
          <time dateTime={item.createdAt}>{formatRelativeTime(item.createdAt, now)}</time>
        </Text>
      </Tooltip>
    </Flex>
  );
}

export function RecentActivity({ items, now = new Date() }: { items: ActivityItem[]; now?: Date }) {
  return (
    <Stack as="section" gap="3">
      <SectionHeading title="Recent activity" description="The latest stock movements." />
      {items.length === 0 ? (
        <EmptyState
          borderWidth="1px"
          borderColor="border"
          rounded="md"
          icon={<LuHistory />}
          title="No stock movement yet"
        />
      ) : (
        <Stack
          gap="0"
          separator={<StackSeparator />}
          borderWidth="1px"
          borderColor="border"
          rounded="md"
        >
          {items.map((item) => (
            <ActivityRow key={item.id} item={item} now={now} />
          ))}
        </Stack>
      )}
    </Stack>
  );
}
