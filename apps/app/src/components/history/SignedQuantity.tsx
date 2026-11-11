import { Text } from '@chakra-ui/react';
import { formatCount } from '@/lib/format';
import type { InventoryDirection } from '@/types/inventory';

interface SignedQuantityProps {
  direction: InventoryDirection;
  quantity: number;
  unit: string;
}

/** `+100 pc` in green for stock in, `−20 pc` for stock out, as on the dashboard. */
export function SignedQuantity({ direction, quantity, unit }: SignedQuantityProps) {
  return (
    <Text
      as="span"
      color={direction === 'IN' ? 'green.fg' : 'fg'}
      fontVariantNumeric="tabular-nums"
      whiteSpace="nowrap"
    >
      {direction === 'IN' ? '+' : '−'}
      {formatCount(quantity)} {unit}
    </Text>
  );
}
