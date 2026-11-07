'use client';

import { Button } from '@chakra-ui/react';
import { toaster } from '@inventra-med/components';
import { signOut } from 'next-auth/react';

export function SignOutButton() {
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
    <Button variant="outline" onClick={handleSignOut}>
      Sign out
    </Button>
  );
}
