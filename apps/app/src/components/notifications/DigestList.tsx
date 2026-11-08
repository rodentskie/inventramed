import { Box, Link, Stack, Text } from '@chakra-ui/react';
import { EmptyState, Tag } from '@inventra-med/components';
import NextLink from 'next/link';
import { LuBellOff } from 'react-icons/lu';
import type { NotificationSummary } from '@/types/notification';

function DigestRow({ digest }: { digest: NotificationSummary }) {
  return (
    <Box as="li" borderTopWidth="1px" borderColor="border" _first={{ borderTopWidth: '0' }}>
      <Link
        asChild
        display="flex"
        alignItems="center"
        flexWrap="wrap"
        gap="3"
        px="4"
        py="3"
        color="fg"
        textDecoration="none"
        _hover={{ bg: 'bg.muted', textDecoration: 'none' }}
      >
        <NextLink href={`/notifications/${digest.id}`}>
          <Box
            aria-hidden
            boxSize="2"
            flexShrink="0"
            rounded="full"
            bg={digest.isRead ? 'transparent' : 'teal.solid'}
          />
          <Text as="span" flex="1" minW="48" fontWeight={digest.isRead ? 'normal' : 'semibold'}>
            Daily digest for {digest.notificationDate}
          </Text>
          <Text as="span" textStyle="sm" color="fg.muted">
            {digest.expiredCount} expired · {digest.nearExpiryCount} near expiry
          </Text>
          {!digest.isRead && <Tag colorPalette="teal">Unread</Tag>}
        </NextLink>
      </Link>
    </Box>
  );
}

export function DigestList({ items }: { items: NotificationSummary[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        borderWidth="1px"
        borderColor="border"
        rounded="md"
        icon={<LuBellOff />}
        title="No alerts yet"
        description="A digest appears here on days a batch is near expiry or expired."
      />
    );
  }

  return (
    <Stack
      as="ul"
      gap="0"
      listStyleType="none"
      overflow="hidden"
      borderWidth="1px"
      borderColor="border"
      rounded="md"
    >
      {items.map((digest) => (
        <DigestRow key={digest.id} digest={digest} />
      ))}
    </Stack>
  );
}
