import { Flex, Heading, Separator, Stack } from '@chakra-ui/react';
import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  actions?: ReactNode;
}

/** Page title, optional buttons on the right, then a divider, as on the dashboard. */
export function PageHeader({ title, actions }: PageHeaderProps) {
  return (
    <Stack gap="4">
      <Flex justify="space-between" align="center" gap="3" wrap="wrap">
        <Heading as="h1" size="2xl" fontWeight="normal" wordBreak="break-word">
          {title}
        </Heading>
        {actions && (
          <Flex gap="2" wrap="wrap">
            {actions}
          </Flex>
        )}
      </Flex>
      <Separator />
    </Stack>
  );
}
