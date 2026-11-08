import { Box, Flex, HStack, IconButton, Link, Text } from '@chakra-ui/react';
import { ColorModeButton } from '@inventra-med/components';
import NextLink from 'next/link';
import { LuBell, LuPill } from 'react-icons/lu';
import { MobileNav } from '@/components/layout/MobileNav';
import { PageTitle } from '@/components/layout/PageTitle';
import { UserMenu } from '@/components/layout/UserMenu';
import type { NavGroup } from '@/types/dashboard';

interface AppHeaderProps {
  groups: NavGroup[];
  fullName: string;
  username: string;
  /** `null` hides the bell, for roles without `notification:read`. */
  hasUnread: boolean | null;
}

function NotificationBell({ hasUnread }: { hasUnread: boolean }) {
  return (
    <IconButton
      asChild
      variant="outline"
      size="sm"
      position="relative"
      aria-label={hasUnread ? 'Notifications, unread' : 'Notifications'}
    >
      <NextLink href="/#alerts">
        <LuBell />
        {hasUnread && (
          <Box
            position="absolute"
            top="-1"
            right="-1"
            boxSize="2.5"
            rounded="full"
            bg="teal.solid"
            borderWidth="2px"
            borderColor="bg.subtle"
          />
        )}
      </NextLink>
    </IconButton>
  );
}

export function AppHeader({ groups, fullName, username, hasUnread }: AppHeaderProps) {
  return (
    <Flex
      as="header"
      align="center"
      justify="space-between"
      gap="3"
      h="16"
      px="4"
      bg="bg.subtle"
      borderBottomWidth="1px"
      borderColor="border"
    >
      <HStack gap="3" minW="0">
        <MobileNav groups={groups} />
        <Link asChild color="fg" fontWeight="bold" textDecoration="none">
          <NextLink href="/">
            <LuPill aria-hidden />
            <Text as="span">InventraMed</Text>
          </NextLink>
        </Link>
        <PageTitle />
      </HStack>
      <HStack gap="2">
        <ColorModeButton />
        {hasUnread !== null && <NotificationBell hasUnread={hasUnread} />}
        <UserMenu fullName={fullName} username={username} />
      </HStack>
    </Flex>
  );
}
