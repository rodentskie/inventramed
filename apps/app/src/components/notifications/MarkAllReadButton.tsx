'use client';

import { Button } from '@chakra-ui/react';
import { toaster } from '@inventra-med/components';
import { LuCheckCheck } from 'react-icons/lu';
import { markAllNotificationsReadAction } from '@/actions/notifications';
import { useActionSubmit } from '@/hooks/use-action-submit';

export function MarkAllReadButton({ unreadCount }: { unreadCount: number }) {
  const { isSubmitting, submit } = useActionSubmit();

  function handleClick() {
    void submit(markAllNotificationsReadAction, {
      onSuccess: () =>
        toaster.create({ type: 'success', title: 'All notifications marked as read' }),
    });
  }

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={unreadCount === 0}
      loading={isSubmitting}
      onClick={handleClick}
    >
      <LuCheckCheck />
      Mark all as read
    </Button>
  );
}
