import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { getCurrentUser } from '@/lib/auth';
import { getLatestDigest } from '@/lib/dashboard';
import { hasPermission } from '@/lib/permissions';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const digest = hasPermission(user.permissions, 'notification:read')
    ? await getLatestDigest(user.id)
    : undefined;
  const hasUnread = digest === undefined ? null : digest !== null && !digest.isRead;

  return (
    <AppShell user={user} hasUnread={hasUnread}>
      {children}
    </AppShell>
  );
}
