'use client';

import { Button } from '@chakra-ui/react';
import { useState } from 'react';
import { LuPackageMinus, LuTrash2 } from 'react-icons/lu';
import { DispenseDialog } from '@/components/movements/DispenseDialog';
import { DisposeExpiredDialog } from '@/components/movements/DisposeExpiredDialog';
import { getExpiredQuantity } from '@/lib/batch-stock';
import type { MedicineDetail } from '@/types/medicine';

interface MedicineStockActionsProps {
  medicine: MedicineDetail;
}

/** Dispense and Dispose expired, on the medicine detail page. */
export function MedicineStockActions({ medicine }: MedicineStockActionsProps) {
  const [action, setAction] = useState<'dispense' | 'dispose' | null>(null);
  const close = () => setAction(null);

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setAction('dispense')}>
        <LuPackageMinus />
        Dispense
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={getExpiredQuantity(medicine.batches) === 0}
        onClick={() => setAction('dispose')}
      >
        <LuTrash2 />
        Dispose expired
      </Button>
      {action === 'dispense' && <DispenseDialog medicine={medicine} onClose={close} />}
      {action === 'dispose' && (
        <DisposeExpiredDialog medicine={medicine} batches={medicine.batches} onClose={close} />
      )}
    </>
  );
}
