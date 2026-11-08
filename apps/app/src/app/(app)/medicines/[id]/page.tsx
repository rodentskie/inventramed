import { Flex, Stack } from '@chakra-ui/react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { SectionHeading } from '@/components/dashboard/SectionHeading';
import { PageHeader } from '@/components/layout/PageHeader';
import { BatchTable } from '@/components/medicines/BatchTable';
import { DeleteMedicineDialog } from '@/components/medicines/DeleteMedicineDialog';
import { MedicineDetails } from '@/components/medicines/MedicineDetails';
import { MedicineFormDialog } from '@/components/medicines/MedicineFormDialog';
import { ReceiveStockDialog } from '@/components/medicines/ReceiveStockDialog';
import { ApiError } from '@/lib/api-response';
import { getCurrentUser, requirePageUser } from '@/lib/auth';
import { formatMedicineName } from '@/lib/format';
import { getExpiryContext, getMedicine } from '@/lib/medicines';
import { hasPermission } from '@/lib/permissions';
import { idSchema } from '@/lib/validations/medicine';
import type { MedicineDetail } from '@/types/medicine';

interface MedicinePageProps {
  params: Promise<{ id: string }>;
}

/** Shared by the metadata and the page. `null` for a bad ID or a deleted medicine. */
const loadMedicine = cache(async (id: string): Promise<MedicineDetail | null> => {
  if (!idSchema.safeParse(id).success) {
    return null;
  }
  try {
    return await getMedicine(id);
  } catch (error) {
    if (error instanceof ApiError && error.code === 'NOT_FOUND') {
      return null;
    }
    throw error;
  }
});

export async function generateMetadata({ params }: MedicinePageProps): Promise<Metadata> {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.permissions, 'medicine:read')) {
    return { title: 'Medicines' };
  }
  const medicine = await loadMedicine((await params).id);
  return { title: medicine ? formatMedicineName(medicine.name, medicine.strength) : 'Not found' };
}

export default async function MedicinePage({ params }: MedicinePageProps) {
  const user = await requirePageUser('medicine:read');
  const [medicine, context] = await Promise.all([
    loadMedicine((await params).id),
    getExpiryContext(),
  ]);
  if (!medicine) {
    notFound();
  }

  const canWrite = hasPermission(user.permissions, 'medicine:write');
  const canReceive = canWrite && hasPermission(user.permissions, 'inventory:write');

  return (
    <Stack gap="8">
      <PageHeader
        title={formatMedicineName(medicine.name, medicine.strength)}
        actions={
          canWrite && (
            <>
              <MedicineFormDialog medicine={medicine} />
              <DeleteMedicineDialog medicine={medicine} />
            </>
          )
        }
      />
      <MedicineDetails medicine={medicine} />
      <Stack as="section" gap="3">
        <Flex justify="space-between" align="center" gap="3" wrap="wrap">
          <SectionHeading
            title="Batches"
            description="First-expired, first-out order. Empty batches stay for their history."
          />
          {canReceive && <ReceiveStockDialog medicineId={medicine.id} today={context.today} />}
        </Flex>
        <BatchTable
          batches={medicine.batches}
          unit={medicine.unit}
          canEdit={canWrite}
          timezone={context.timezone}
        />
      </Stack>
    </Stack>
  );
}
