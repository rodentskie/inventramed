import { Stack } from '@chakra-ui/react';
import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/PageHeader';
import { ScanView } from '@/components/scan/ScanView';
import { requirePageUser } from '@/lib/auth';
import { getExpiryContext } from '@/lib/medicines';
import { hasPermission } from '@/lib/permissions';

export const metadata: Metadata = { title: 'Scan' };

export default async function ScanPage() {
  const user = await requirePageUser('medicine:read');
  const { timezone } = await getExpiryContext();

  return (
    <Stack gap="6">
      <PageHeader title="Scan" />
      <ScanView
        timezone={timezone}
        canCreate={hasPermission(user.permissions, 'medicine:write')}
      />
    </Stack>
  );
}
