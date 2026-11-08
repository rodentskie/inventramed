'use client';

import { Text } from '@chakra-ui/react';
import { usePathname } from 'next/navigation';
import { findNavItem } from '@/lib/navigation';

/** The current page's name next to the app name, like GitHub's header. */
export function PageTitle() {
  const item = findNavItem(usePathname());
  if (!item) {
    return null;
  }

  return (
    <Text
      as="span"
      fontWeight="semibold"
      color="fg"
      display={{ base: 'none', md: 'inline' }}
    >
      {item.label}
    </Text>
  );
}
