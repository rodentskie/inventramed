import { Box, Flex, Heading, Stack, Text } from '@chakra-ui/react';
import { ColorModeButton } from '@inventra-med/components';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/auth/LoginForm';
import { getActiveUser } from '@/lib/auth';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage() {
  if (await getActiveUser()) {
    redirect('/');
  }

  return (
    <Flex
      position="relative"
      minH="100dvh"
      align="center"
      justify="center"
      px="4"
      py="16"
      bg="bg"
    >
      <Box position="absolute" top="4" right="4">
        <ColorModeButton />
      </Box>
      <Stack width="full" maxW="sm" gap="6">
        <Stack gap="1" textAlign="center">
          <Heading as="h1" size="2xl">
            InventraMed
          </Heading>
          <Text color="fg.muted">Sign in to your account</Text>
        </Stack>
        <Box
          p="6"
          bg="bg.panel"
          borderWidth="1px"
          borderColor="border"
          rounded="md"
        >
          <LoginForm />
        </Box>
      </Stack>
    </Flex>
  );
}
