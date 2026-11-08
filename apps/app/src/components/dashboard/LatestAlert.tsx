import { Flex, Stack, Text } from '@chakra-ui/react';
import { EmptyState, Tag } from '@inventra-med/components';
import { LuBellOff } from 'react-icons/lu';
import { SectionHeading } from '@/components/dashboard/SectionHeading';
import type { NotificationSummary } from '@/types/notification';

export function LatestAlert({ digest }: { digest: NotificationSummary | null }) {
  return (
    <Stack as="section" id="alerts" gap="3" scrollMarginTop="4">
      <SectionHeading title="Latest alert" />
      {digest ? (
        <Flex
          align="center"
          justify="space-between"
          gap="4"
          p="4"
          borderWidth="1px"
          borderColor="border"
          rounded="md"
        >
          <Stack gap="0.5">
            <Text fontWeight="medium">Daily digest for {digest.notificationDate}</Text>
            <Text textStyle="sm" color="fg.muted">
              {digest.expiredCount} expired, {digest.nearExpiryCount} near expiry
            </Text>
          </Stack>
          {!digest.isRead && <Tag colorPalette="teal">Unread</Tag>}
        </Flex>
      ) : (
        <EmptyState
          borderWidth="1px"
          borderColor="border"
          rounded="md"
          icon={<LuBellOff />}
          title="No alerts yet"
        />
      )}
    </Stack>
  );
}
