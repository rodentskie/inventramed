import { Stack, Text } from '@chakra-ui/react';
import { Status } from '@inventra-med/components';
import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/PageHeader';
import { SettingsForm } from '@/components/settings/SettingsForm';
import { requirePageUser } from '@/lib/auth';
import { getWorkerStatus } from '@/lib/dashboard';
import { formatRelativeTime } from '@/lib/format';
import { getSettings } from '@/lib/settings';
import type { WorkerStatus } from '@/types/dashboard';

export const metadata: Metadata = { title: 'Settings' };

function WorkerStatusLine({ status }: { status: WorkerStatus }) {
  if (!status.smsEnabled) {
    return <Status colorPalette="gray">SMS is off</Status>;
  }
  const lastSeen = status.lastSeenAt
    ? `last seen ${formatRelativeTime(status.lastSeenAt)}`
    : 'never connected';

  return status.online ? (
    <Status value="success">Online · {lastSeen}</Status>
  ) : (
    <Status value="error">Offline · {lastSeen}</Status>
  );
}

export default async function SettingsPage() {
  await requirePageUser('settings:manage');
  const [settings, workerStatus] = await Promise.all([getSettings(), getWorkerStatus()]);

  return (
    <Stack gap="6">
      <PageHeader title="Settings" />
      {settings.updatedBy && (
        <Text textStyle="sm" color="fg.muted">
          Last changed by {settings.updatedBy.username}, {formatRelativeTime(settings.updatedAt)}
        </Text>
      )}
      <SettingsForm settings={settings} workerStatus={<WorkerStatusLine status={workerStatus} />} />
    </Stack>
  );
}
