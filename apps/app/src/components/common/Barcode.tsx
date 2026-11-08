'use client';

import { Box } from '@chakra-ui/react';
import ReactBarcode from 'react-barcode';

interface BarcodeProps {
  value: string;
  /** Bar height in px. */
  height?: number;
  /** Width of the narrowest bar in px. */
  barWidth?: number;
}

/**
 * A Code 128 SVG with the text under it. Always black on white, in both color
 * modes, because scanners need dark bars on a light background.
 */
export function Barcode({ value, height = 48, barWidth = 1.5 }: BarcodeProps) {
  return (
    <Box display="inline-block" bg="white" rounded="sm" maxW="full" overflowX="auto">
      <ReactBarcode
        value={value}
        format="CODE128"
        renderer="svg"
        height={height}
        width={barWidth}
        fontSize={14}
        font="monospace"
        margin={8}
        background="#ffffff"
        lineColor="#000000"
      />
    </Box>
  );
}
