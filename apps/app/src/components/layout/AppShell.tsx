import { Box, Container, Flex, HStack, Stack, Text } from '@chakra-ui/react';
import { Avatar } from '@inventra-med/components';
import type { ReactNode } from 'react';
import { AppHeader } from '@/components/layout/AppHeader';
import { SidebarNav } from '@/components/layout/SidebarNav';
import { capitalize } from '@/lib/format';
import { getVisibleNav } from '@/lib/navigation';
import type { CurrentUser } from '@/types/auth';

interface AppShellProps {
  user: CurrentUser;
  hasUnread: boolean | null;
  children: ReactNode;
}

export function AppShell({ user, hasUnread, children }: AppShellProps) {
  const groups = getVisibleNav(user.permissions);
  const fullName = `${user.firstName} ${user.lastName}`;

  return (
    <Box minH="100dvh" bg="bg">
      <AppHeader
        groups={groups}
        fullName={fullName}
        username={user.username}
        hasUnread={hasUnread}
      />
      <Container maxW="7xl" px={{ base: '4', md: '8' }} py={{ base: '6', md: '8' }}>
        <HStack gap="4" mb={{ base: '6', md: '8' }}>
          <Avatar name={fullName} size="xl" />
          <Stack gap="0" minW="0">
            <Text textStyle="xl" fontWeight="semibold" truncate>
              {fullName}{' '}
              <Text as="span" color="fg.muted" fontWeight="normal">
                ({user.username})
              </Text>
            </Text>
            <Text color="fg.muted">{capitalize(user.roleName)}</Text>
          </Stack>
        </HStack>
        <Flex gap="8" align="flex-start">
          <Box w="72" flexShrink="0" display={{ base: 'none', lg: 'block' }}>
            <SidebarNav groups={groups} />
          </Box>
          <Box as="main" flex="1" minW="0">
            {children}
          </Box>
        </Flex>
      </Container>
    </Box>
  );
}
