'use client';

import { Button, Flex, Text } from '@chakra-ui/react';
import { BatchMovementDialog } from '@/components/movements/BatchMovementDialog';
import { DispenseDialog } from '@/components/movements/DispenseDialog';
import { getBatchActions, getExpiredQuantity, type MovementPermissions } from '@/lib/batch-stock';
import { formatCount } from '@/lib/format';
import { useScanStore } from '@/stores/scan-store';
import type { BatchMovementAction } from '@/types/inventory';
import type { MedicineBatch, MedicineDetail } from '@/types/medicine';

interface ScanActionsProps extends MovementPermissions {
  medicine: MedicineDetail;
  /** The scanned batch. Without one, the actions are for the whole medicine. */
  batch?: MedicineBatch;
  onMoved: () => void;
}

const BATCH_ACTION_LABELS: Record<BatchMovementAction, string> = {
  receive: 'Receive more',
  count: 'Count',
  damaged: 'Damaged',
  lost: 'Lost',
  returned: 'Returned',
  dispose: 'Dispose expired',
};

/** The movements that fit what was scanned. A `collaborator` sees none of them. */
export function ScanActions({ medicine, batch, canMove, canReceive, onMoved }: ScanActionsProps) {
  const openAction = useScanStore((state) => state.openAction);
  const setOpenAction = useScanStore((state) => state.setOpenAction);
  const close = () => setOpenAction(null);
  const expired = getExpiredQuantity(medicine.batches);
  const batchActions = batch ? getBatchActions(batch, { canMove, canReceive }) : [];

  return (
    <>
      {!batch && expired > 0 && (
        <Text textStyle="sm" color="fg.warning">
          {formatCount(expired)} {medicine.unit} expired, not dispensable.
        </Text>
      )}
      <Flex gap="2" wrap="wrap">
        {!batch && canMove && (
          <Button size="sm" onClick={() => setOpenAction('dispense')}>
            Dispense
          </Button>
        )}
        {batchActions.map((action) => (
          <Button key={action} size="sm" variant="outline" onClick={() => setOpenAction(action)}>
            {BATCH_ACTION_LABELS[action]}
          </Button>
        ))}
      </Flex>
      {!batch && canMove && openAction === 'dispense' && (
        <DispenseDialog medicine={medicine} onClose={close} onMoved={onMoved} />
      )}
      {batch && openAction && openAction !== 'dispense' && (
        <BatchMovementDialog
          action={openAction}
          medicine={medicine}
          batch={batch}
          onClose={close}
          onMoved={onMoved}
        />
      )}
    </>
  );
}
