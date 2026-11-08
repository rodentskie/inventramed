import { Stack } from '@chakra-ui/react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ListPagination } from '@/components/common/ListPagination';
import { PageHeader } from '@/components/layout/PageHeader';
import { DigestList } from '@/components/notifications/DigestList';
import { MarkAllReadButton } from '@/components/notifications/MarkAllReadButton';
import { requirePageUser } from '@/lib/auth';
import { parseListQuery, type SearchParams } from '@/lib/list-query';
import { listNotifications } from '@/lib/notifications';
import { notificationListQuerySchema } from '@/lib/validations/notification';

export const metadata: Metadata = { title: 'Notifications' };

interface NotificationsPageProps {
  searchParams: Promise<SearchParams>;
}

export default async function NotificationsPage({ searchParams }: NotificationsPageProps) {
  const user = await requirePageUser('notification:read');
  const query = parseListQuery(notificationListQuerySchema, await searchParams);
  const list = await listNotifications(user.id, query);

  // A hand-edited page past the end goes to the last page instead of looking empty.
  if (list.items.length === 0 && list.total > 0) {
    const params = new URLSearchParams({
      page: String(Math.ceil(list.total / list.pageSize)),
      pageSize: String(list.pageSize),
    });
    redirect(`/notifications?${params}`);
  }

  return (
    <Stack gap="6">
      <PageHeader
        title="Notifications"
        actions={<MarkAllReadButton unreadCount={list.unreadCount} />}
      />
      <DigestList items={list.items} />
      <ListPagination total={list.total} page={list.page} pageSize={list.pageSize} />
    </Stack>
  );
}
