import { Stack, Text } from '@chakra-ui/react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { DigestItemsTable } from '@/components/notifications/DigestItemsTable';
import { MarkAsRead } from '@/components/notifications/MarkAsRead';
import { ApiError } from '@/lib/api-response';
import { getCurrentUser, requirePageUser } from '@/lib/auth';
import { getLocalTime, getLocalToday } from '@/lib/expiry';
import { getCurrentBatchQuantities, getNotification } from '@/lib/notifications';
import { hasPermission } from '@/lib/permissions';
import { getSettings } from '@/lib/settings';
import { idSchema } from '@/lib/validations/common';
import type { NotificationDetail } from '@/types/notification';

interface DigestPageProps {
  params: Promise<{ id: string }>;
}

/** Shared by the metadata and the page. `null` for a bad ID, or a missing or empty digest. */
const loadDigest = cache(async (userId: string, id: string): Promise<NotificationDetail | null> => {
  if (!idSchema.safeParse(id).success) {
    return null;
  }
  try {
    return await getNotification(userId, id);
  } catch (error) {
    if (error instanceof ApiError && error.code === 'NOT_FOUND') {
      return null;
    }
    throw error;
  }
});

export async function generateMetadata({ params }: DigestPageProps): Promise<Metadata> {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.permissions, 'notification:read')) {
    return { title: 'Notifications' };
  }
  const digest = await loadDigest(user.id, (await params).id);
  return { title: digest ? `Digest ${digest.notificationDate}` : 'Not found' };
}

export default async function DigestPage({ params }: DigestPageProps) {
  const user = await requirePageUser('notification:read');
  const digest = await loadDigest(user.id, (await params).id);
  if (!digest) {
    notFound();
  }

  const [settings, currentQuantities] = await Promise.all([
    getSettings(),
    getCurrentBatchQuantities(digest.items.map((item) => item.batchId)),
  ]);
  const createdAt = new Date(digest.createdAt);
  const asOf = `${getLocalToday(settings.timezone, createdAt)} ${getLocalTime(settings.timezone, createdAt)}`;

  return (
    <Stack gap="6">
      {!digest.isRead && <MarkAsRead id={digest.id} />}
      <PageHeader title={`Daily digest for ${digest.notificationDate}`} />
      <Text color="fg.muted">
        {digest.expiredCount} expired · {digest.nearExpiryCount} near expiry · As of {asOf}
      </Text>
      <DigestItemsTable
        items={digest.items}
        currentQuantities={currentQuantities}
        canViewMedicines={hasPermission(user.permissions, 'medicine:read')}
      />
    </Stack>
  );
}
