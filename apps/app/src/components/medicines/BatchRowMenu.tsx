'use client';

import { IconButton } from '@chakra-ui/react';
import { MenuContent, MenuItem, MenuRoot, MenuTrigger } from '@inventra-med/components';
import { useState } from 'react';
import { LuEllipsis, LuPencil, LuPrinter } from 'react-icons/lu';
import { EditBatchDialog } from '@/components/medicines/EditBatchDialog';
import type { MedicineBatch } from '@/types/medicine';

interface BatchRowMenuProps {
  batch: MedicineBatch;
  canEdit: boolean;
}

export function BatchRowMenu({ batch, canEdit }: BatchRowMenuProps) {
  const [editOpen, setEditOpen] = useState(false);

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
    </>
  );
}
