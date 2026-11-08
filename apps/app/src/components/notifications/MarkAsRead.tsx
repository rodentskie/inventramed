'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { markNotificationReadAction } from '@/actions/notifications';

/**
 * Marks the digest read after it opens, because a server render must not write.
 * The ref stops Strict Mode's second effect from repeating the call. A failure
 * stays silent: the digest is still readable and stays unread.
 */
export function MarkAsRead({ id }: { id: string }) {
  const router = useRouter();
  const markedId = useRef<string | null>(null);

  useEffect(() => {
    if (markedId.current === id) {
      return;
    }
    markedId.current = id;

    markNotificationReadAction(id)
      .then((result) => {
        if (result.success) {
          router.refresh();
        }
      })
      .catch(() => undefined);
  }, [id, router]);

  return null;
}
