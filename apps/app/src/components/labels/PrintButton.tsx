'use client';

import { Button } from '@chakra-ui/react';
import { LuPrinter } from 'react-icons/lu';

/** Hidden when printing, so only the label is on the page. */
export function PrintButton() {
  return (
    <Button size="sm" colorPalette="teal" onClick={() => window.print()} _print={{ display: 'none' }}>
      <LuPrinter />
      Print
    </Button>
  );
}
