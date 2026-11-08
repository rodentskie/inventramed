'use client';

import { IconButton } from '@chakra-ui/react';
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuSeparator,
  MenuTrigger,
} from '@inventra-med/components';
import { useState } from 'react';
import { LuEllipsis, LuPencil, LuPrinter } from 'react-icons/lu';
import { EditBatchDialog } from '@/components/medicines/EditBatchDialog';
import { BatchMovementDialog } from '@/components/movements/BatchMovementDialog';
import { getBatchActions, type MovementPermissions } from '@/lib/batch-stock';
import type { BatchMovementAction } from '@/types/inventory';
import type { MedicineBatch, MovementMedicine } from '@/types/medicine';

export interface BatchMovements extends MovementPermissions {
  medicine: MovementMedicine;
}

interface BatchRowMenuProps {
  batch: MedicineBatch;
  canEdit: boolean;
  /** Absent where the row is read-only, such as the `/scan` result. */
  movements?: BatchMovements;
}

const ACTION_LABELS: Record<BatchMovementAction, string> = {
  receive: 'Receive more',
  count: 'Count',
  damaged: 'Damaged',
  lost: 'Lost',
  returned: 'Returned',
  dispose: 'Dispose',
};

export function BatchRowMenu({ batch, canEdit, movements }: BatchRowMenuProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [action, setAction] = useState<BatchMovementAction | null>(null);
  const actions = movements ? getBatchActions(batch, movements) : [];

  return (
    <>
      <MenuRoot positioning={{ placement: 'bottom-end' }}>
        <MenuTrigger asChild>
          <IconButton
            aria-label={`Actions for batch ${batch.batchNumber}`}
            variant="ghost"
            size="xs"
          >
            <LuEllipsis />
          </IconButton>
        </MenuTrigger>
        <MenuContent minW="40">
          {actions.map((item) => (
            <MenuItem key={item} value={item} onSelect={() => setAction(item)}>
              {ACTION_LABELS[item]}
            </MenuItem>
          ))}
          {actions.length > 0 && <MenuSeparator />}
          <MenuItem value="print" asChild>
            <a href={`/labels/batches/${batch.id}`} target="_blank" rel="noopener noreferrer">
              <LuPrinter />
              Print label
            </a>
          </MenuItem>
          {canEdit && (
            <MenuItem value="edit" onSelect={() => setEditOpen(true)}>
              <LuPencil />
              Edit batch
            </MenuItem>
          )}
        </MenuContent>
      </MenuRoot>
      {canEdit && (
        <EditBatchDialog batch={batch} open={editOpen} onOpenChange={setEditOpen} />
      )}
      {action && movements && (
        <BatchMovementDialog
          action={action}
          medicine={movements.medicine}
          batch={batch}
          onClose={() => setAction(null)}
        />
      )}
    </>
  );
}
