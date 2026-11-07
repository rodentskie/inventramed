import { Flex, Text } from '@chakra-ui/react';
import { redirect } from 'next/navigation';
import { SignOutButton } from '@/components/auth/SignOutButton';
import { getActiveUser } from '@/lib/auth';

export default async function Index() {
  const user = await getActiveUser();
  if (!user) {
    redirect('/login');
  }

  return (
    <Flex
      minH="100dvh"
      direction="column"
      align="center"
      justify="center"
      gap="4"
      px="4"
      bg="bg"
    >
      <Text>Signed in as {user.username}</Text>
      <SignOutButton />
    </Flex>
  );
}
