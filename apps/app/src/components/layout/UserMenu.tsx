'use client';

import { Box, IconButton, Text } from '@chakra-ui/react';
import {
  Avatar,
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuSeparator,
  MenuTrigger,
  toaster,
} from '@inventra-med/components';
import { signOut } from 'next-auth/react';
import { LuLogOut } from 'react-icons/lu';

interface UserMenuProps {
  fullName: string;
  username: string;
}

export function UserMenu({ fullName, username }: UserMenuProps) {
  async function handleSignOut() {
    try {
      await signOut({ callbackUrl: '/login' });
    } catch {
      toaster.create({
        type: 'error',
        title: 'Something went wrong. Please try again.',
      });
    }
  }

  return (
    <MenuRoot positioning={{ placement: 'bottom-end' }}>
      <MenuTrigger asChild>
        <IconButton aria-label="Open user menu" variant="ghost" rounded="full" size="sm">
          <Avatar name={fullName} size="xs" />
        </IconButton>
      </MenuTrigger>
      <MenuContent minW="48">
        <Box px="2" py="1.5">
          <Text textStyle="sm" fontWeight="semibold">
            {fullName}
          </Text>
          <Text textStyle="xs" color="fg.muted">
            {username}
          </Text>
        </Box>
        <MenuSeparator />
        <MenuItem value="sign-out" onSelect={handleSignOut}>
          <LuLogOut />
          Sign out
        </MenuItem>
      </MenuContent>
    </MenuRoot>
  );
}
