import { Text } from '@chakra-ui/react';
import { Alert } from '@inventra-med/components';
import { formatRelativeTime } from '@/lib/format';
import type { WorkerStatus } from '@/types/dashboard';

interface WorkerStatusAlertProps {
  status: WorkerStatus;
  now?: Date;
}

export function WorkerStatusAlert({ status, now = new Date() }: WorkerStatusAlertProps) {
  if (!status.smsEnabled) {
    return (
      <Text textStyle="sm" color="fg.muted">
        SMS alerts are turned off.
      </Text>
    );
  }
  if (status.online) {
    return null;
  }

  const lastSeen = status.lastSeenAt
    ? `SMS worker last seen ${formatRelativeTime(status.lastSeenAt, now)}.`
    : 'SMS worker has never connected.';

  return (
    <Alert status="warning" title="SMS worker offline">
      {lastSeen} SMS alerts are not being sent.
    </Alert>
  );
}
