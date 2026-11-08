'use client';

import { Box, Text } from '@chakra-ui/react';
import { useRef, useState } from 'react';
import { BarcodeScanner, type DetectedBarcode } from 'react-barcode-scanner';
import 'react-barcode-scanner/polyfill';

/** Linear formats found on medicine boxes, plus Code 128 for the app's own labels. */
const FORMATS = ['code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf'];

export const CAMERA_MESSAGES = {
  blocked:
    'Camera access was blocked. Allow it in your browser settings, or type the barcode.',
  missing: 'No camera found. Type the barcode instead.',
  insecure: 'The camera needs HTTPS. Type the barcode, or open the app over HTTPS.',
  failed: "The camera couldn't start. Type the barcode instead.",
};

export function getCameraErrorMessage(error: Error): string {
  if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
    return CAMERA_MESSAGES.blocked;
  }
  if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') {
    return CAMERA_MESSAGES.missing;
  }
  // react-barcode-scanner throws plain errors for an insecure origin or a missing getUserMedia.
  if (/secure origin|getUserMedia/i.test(error.message)) {
    return CAMERA_MESSAGES.insecure;
  }
  return CAMERA_MESSAGES.failed;
}

export interface CameraScannerProps {
  /** Called once with the first code read. Unmount the scanner to turn the camera off. */
  onDetected: (code: string) => void;
}

/** Loaded through `LazyCameraScanner`, because the scanner only runs in the browser. */
export default function CameraScanner({ onDetected }: CameraScannerProps) {
  const [error, setError] = useState<string | null>(null);
  const detected = useRef(false);

  function handleCapture(barcodes: DetectedBarcode[]) {
    const code = barcodes[0]?.rawValue.trim();
    if (detected.current || !code) {
      return;
    }
    detected.current = true;
    onDetected(code);
  }

  if (error) {
    return (
      <Text role="alert" textStyle="sm" color="fg.error">
        {error}
      </Text>
    );
  }

  return (
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
      <BarcodeScanner
        aria-label="Camera preview"
        options={{ formats: FORMATS, delay: 300 }}
        onCapture={handleCapture}
        onCameraError={(cameraError) => setError(getCameraErrorMessage(cameraError))}
        onScanError={(scanError) => setError(getCameraErrorMessage(scanError))}
        muted
        playsInline
      />
    </Box>
  );
}
