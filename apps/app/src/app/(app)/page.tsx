import { Heading, Separator, Stack, Text } from '@chakra-ui/react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AttentionTable } from '@/components/dashboard/AttentionTable';
import { LatestAlert } from '@/components/dashboard/LatestAlert';
import { OverviewStats } from '@/components/dashboard/OverviewStats';
import { RecentActivity } from '@/components/dashboard/RecentActivity';
import { WorkerStatusAlert } from '@/components/dashboard/WorkerStatusAlert';
import { getCurrentUser } from '@/lib/auth';
import {
  getAttentionBatches,
  getLatestDigest,
  getOverview,
  getRecentActivity,
  getWorkerStatus,
} from '@/lib/dashboard';
import { hasPermission, type Permission } from '@/lib/permissions';
import type { CurrentUser } from '@/types/auth';

export const metadata: Metadata = { title: 'Dashboard' };

/** Each section loads only when the user may see it; `undefined` means hidden. */
async function loadDashboard(user: CurrentUser) {
  const can = (permission: Permission) => hasPermission(user.permissions, permission);
  const [worker, overview, attention, digest, activity] = await Promise.all([
    can('settings:manage') ? getWorkerStatus() : undefined,
    can('medicine:read') ? getOverview() : undefined,
    can('medicine:read') ? getAttentionBatches() : undefined,
    can('notification:read') ? getLatestDigest(user.id) : undefined,
    can('inventory:read') ? getRecentActivity() : undefined,
  ]);
  return { worker, overview, attention, digest, activity };
}

function NoAccess({ firstName }: { firstName: string }) {
  return (
    <Stack gap="1">
      <Text fontWeight="medium">Welcome, {firstName}.</Text>
      <Text color="fg.muted">
        Your role has no dashboard access. Ask an admin for permissions.
      </Text>
    </Stack>
  );
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const { worker, overview, attention, digest, activity } = await loadDashboard(user);
  const hasSections = [worker, overview, attention, digest, activity].some(
    (section) => section !== undefined,
  );

  return (
    <Stack gap="8">
      <Stack gap="4">
        <Heading as="h1" size="2xl" fontWeight="normal">
          Dashboard
        </Heading>
        <Separator />
      </Stack>
      {!hasSections && <NoAccess firstName={user.firstName} />}
      {worker && <WorkerStatusAlert status={worker} />}
      {overview && <OverviewStats overview={overview} />}
      {attention && <AttentionTable list={attention} />}
      {digest !== undefined && <LatestAlert digest={digest} />}
      {activity && <RecentActivity items={activity} />}
    </Stack>
  );
}
