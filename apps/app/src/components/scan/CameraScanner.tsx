'use client';

import { Box, chakra, NativeSelect, Stack, Text } from '@chakra-ui/react';
import { useBarcodeCamera } from '@/hooks/use-barcode-camera';

export interface CameraScannerProps {
  /** Called once with the first code read. The camera stops at that point. */
  onDetected: (code: string) => void;
}

/** Loaded through `LazyCameraScanner`, because the scanner only runs in the browser. */
export default function CameraScanner({ onDetected }: CameraScannerProps) {
  const { videoRef, error, devices, deviceId, selectDevice } = useBarcodeCamera(onDetected);

  if (error) {
    return (
      <Text role="alert" textStyle="sm" color="fg.error">
        {error}
      </Text>
    );
  }

  return (
    <Stack gap="2" width="full">
      <Box
        width="full"
        aspectRatio={4 / 3}
        maxH="xs"
        overflow="hidden"
        rounded="md"
        borderWidth="1px"
        borderColor="border"
        bg="bg.muted"
      >
        <chakra.video
          ref={videoRef}
          aria-label="Camera preview"
          width="full"
          height="full"
          objectFit="cover"
          muted
          playsInline
        />
      </Box>
      {devices.length > 1 && (
        <NativeSelect.Root size="sm">
          <NativeSelect.Field
            aria-label="Camera"
            value={deviceId}
            onChange={(event) => selectDevice(event.target.value)}
          >
            {devices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
      )}
    </Stack>
  );
}
