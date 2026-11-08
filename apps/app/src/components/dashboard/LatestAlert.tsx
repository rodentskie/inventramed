import { Link, Stack, Text } from '@chakra-ui/react';
import { EmptyState, Tag } from '@inventra-med/components';
import NextLink from 'next/link';
import { LuBellOff } from 'react-icons/lu';
import { SectionHeading } from '@/components/dashboard/SectionHeading';
import type { NotificationSummary } from '@/types/notification';

export function LatestAlert({ digest }: { digest: NotificationSummary | null }) {
  return (
    <Stack as="section" gap="3">
      <SectionHeading title="Latest alert" />
      {digest ? (
        <Link
          asChild
          display="flex"
          alignItems="center"
          justifyContent="space-between"
          gap="4"
          p="4"
          color="fg"
          textDecoration="none"
          borderWidth="1px"
          borderColor="border"
          rounded="md"
          _hover={{ bg: 'bg.muted', textDecoration: 'none' }}
        >
          <NextLink href={`/notifications/${digest.id}`}>
            <Stack gap="0.5">
              <Text fontWeight="medium">Daily digest for {digest.notificationDate}</Text>
              <Text textStyle="sm" color="fg.muted">
                {digest.expiredCount} expired, {digest.nearExpiryCount} near expiry
              </Text>
            </Stack>
            {!digest.isRead && <Tag colorPalette="teal">Unread</Tag>}
          </NextLink>
        </Link>
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
