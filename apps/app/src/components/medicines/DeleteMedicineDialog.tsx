'use client';

import { Button, Text } from '@chakra-ui/react';
import { toaster } from '@inventra-med/components';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LuTrash2 } from 'react-icons/lu';
import { deleteMedicineAction } from '@/actions/medicines';
import { FormDialog } from '@/components/common/FormDialog';
import { useActionSubmit } from '@/hooks/use-action-submit';
import { formatMedicineName } from '@/lib/format';
import type { Medicine } from '@/types/medicine';

export function DeleteMedicineDialog({ medicine }: { medicine: Medicine }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { isSubmitting, submit } = useActionSubmit();
  const name = formatMedicineName(medicine.name, medicine.strength);
  const hasStock = medicine.totalStock > 0;

  function handleSubmit() {
    void submit(() => deleteMedicineAction(medicine.id), {
      onSuccess: () => {
        toaster.create({ type: 'success', title: 'Medicine deleted' });
        setOpen(false);
        router.replace('/medicines');
      },
    });
  }

  return (
    <>
      <Button size="sm" variant="outline" colorPalette="red" onClick={() => setOpen(true)}>
        <LuTrash2 />
        Delete
      </Button>
      <FormDialog
        title="Delete medicine"
        open={open}
        onOpenChange={setOpen}
        onSubmit={handleSubmit}
        submitLabel="Delete"
        colorPalette="red"
        isSubmitting={isSubmitting}
        submitDisabled={hasStock}
      >
        {hasStock ? (
          <Text>
            <strong>{name}</strong> still has stock and cannot be deleted. Dispense or
            dispose of its stock first.
          </Text>
        ) : (
          <Text>
            Delete <strong>{name}</strong>? It disappears from lists and scans, and its
            batches and history are kept.
          </Text>
        )}
      </FormDialog>
    </>
  );
}
