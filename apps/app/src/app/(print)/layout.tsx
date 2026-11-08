import { Box, Theme } from '@chakra-ui/react';
import type { ReactNode } from 'react';

/** No app shell, and always light, so labels print black on white in either color mode. */
export default function PrintLayout({ children }: { children: ReactNode }) {
  return (
    <Theme appearance="light" hasBackground={false}>
      <Box minH="100dvh" bg="white" color="black" p={{ base: '4', _print: '0' }}>
        {children}
      </Box>
    </Theme>
  );
}
