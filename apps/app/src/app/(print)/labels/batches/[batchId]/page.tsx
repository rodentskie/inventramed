import { Flex, Stack, Text } from '@chakra-ui/react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { Barcode } from '@/components/common/Barcode';
import { PrintButton } from '@/components/labels/PrintButton';
import { ApiError } from '@/lib/api-response';
import { getCurrentUser, requirePageUser } from '@/lib/auth';
import { formatMedicineName } from '@/lib/format';
import { getBatchLabel } from '@/lib/medicines';
import { hasPermission } from '@/lib/permissions';
import { idSchema } from '@/lib/validations/medicine';
import type { BatchLabel } from '@/types/medicine';

interface LabelPageProps {
  params: Promise<{ batchId: string }>;
}

const loadLabel = cache(async (batchId: string): Promise<BatchLabel | null> => {
  if (!idSchema.safeParse(batchId).success) {
    return null;
  }
  try {
    return await getBatchLabel(batchId);
  } catch (error) {
    if (error instanceof ApiError && error.code === 'NOT_FOUND') {
      return null;
    }
    throw error;
  }
});

export async function generateMetadata({ params }: LabelPageProps): Promise<Metadata> {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.permissions, 'medicine:read')) {
    return { title: 'Label' };
  }
  const label = await loadLabel((await params).batchId);
  return { title: label ? `Label ${label.batchNumber}` : 'Not found' };
}

export default async function BatchLabelPage({ params }: LabelPageProps) {
  await requirePageUser('medicine:read');
  const label = await loadLabel((await params).batchId);
  if (!label) {
    notFound();
  }

  return (
    <Stack gap="4" align="flex-start">
      <Stack gap="1" width="fit-content" maxW="full">
        <Text fontWeight="semibold" textStyle="md">
          {formatMedicineName(label.medicineName, label.strength)}
        </Text>
        <Text textStyle="sm">
          Batch {label.batchNumber} · Exp {label.expirationDate}
        </Text>
        <Barcode value={label.barcode} height={56} barWidth={1.6} />
      </Stack>
      <Flex>
        <PrintButton />
      </Flex>
    </Stack>
  );
}
