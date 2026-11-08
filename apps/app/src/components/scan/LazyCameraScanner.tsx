'use client';

import { Skeleton } from '@chakra-ui/react';
import dynamic from 'next/dynamic';

/** The scanner and its WASM polyfill use browser APIs, so they never render on the server. */
export const LazyCameraScanner = dynamic(() => import('./CameraScanner'), {
  ssr: false,
  loading: () => <Skeleton width="full" height="48" rounded="md" />,
});
