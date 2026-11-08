'use client';

import { Skeleton } from '@chakra-ui/react';
import dynamic from 'next/dynamic';

/** The scanner uses browser APIs and a large decoder, so it only loads in the browser, on demand. */
export const LazyCameraScanner = dynamic(() => import('./CameraScanner'), {
  ssr: false,
  loading: () => <Skeleton width="full" height="48" rounded="md" />,
});
