'use client';

import { BrowserCodeReader, BrowserMultiFormatOneDReader } from '@zxing/browser';
import {
  BarcodeFormat,
  type BinaryBitmap,
  ChecksumException,
  DecodeHintType,
  FormatException,
  NotFoundException,
} from '@zxing/library';
import { useEffect, useRef, useState } from 'react';

/** Linear formats found on medicine boxes, plus Code 128 for the app's own labels. */
const FORMATS = [
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.ITF,
];
const SCAN_DELAY_MS = 300;
// 1D barcodes need more horizontal detail than the browser's default camera resolution.
const IDEAL_WIDTH = 1280;

export const CAMERA_MESSAGES = {
  blocked:
    'Camera access was blocked. Allow it in your browser settings, or type the barcode.',
  missing: 'No camera found. Type the barcode instead.',
  insecure: 'The camera needs HTTPS. Type the barcode, or open the app over HTTPS.',
  failed: "The camera couldn't start. Type the barcode instead.",
};

export function getCameraErrorMessage(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return CAMERA_MESSAGES.blocked;
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return CAMERA_MESSAGES.missing;
  }
  return CAMERA_MESSAGES.failed;
}

/** Browsers hide `mediaDevices` outside a secure context: HTTPS, or `localhost`. */
function hasCameraAccess(): boolean {
  return window.isSecureContext && Boolean(navigator.mediaDevices?.getUserMedia);
}

/**
 * `TRY_HARDER` retries a failed frame rotated 90°, and rotating a browser canvas source throws,
 * which would end the scan on the first frame with no code. So a barcode has to be held level.
 */
export class UprightOneDReader extends BrowserMultiFormatOneDReader {
  public override decodeBitmap(bitmap: BinaryBitmap) {
    bitmap.isRotateSupported = () => false;
    return super.decodeBitmap(bitmap);
  }
}

function createReader() {
  // TRY_HARDER scans more rows of each frame. Webcams are too soft to read a real
  // box without it: frames that all failed by default decoded with it.
  const hints = new Map<DecodeHintType, unknown>([
    [DecodeHintType.POSSIBLE_FORMATS, FORMATS],
    [DecodeHintType.TRY_HARDER, true],
  ]);
  // A 1D reader, because every format is 1D. The general reader in @zxing/library 0.23 logs
  // a console warning for each frame with no code.
  return new UprightOneDReader(hints, { delayBetweenScanAttempts: SCAN_DELAY_MS });
}

function getConstraints(deviceId: string | undefined): MediaStreamConstraints {
  return {
    video: {
      ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'environment' }),
      width: { ideal: IDEAL_WIDTH },
    },
  };
}

function getActiveDeviceId(video: HTMLVideoElement | null): string {
  const stream = video?.srcObject;
  return stream instanceof MediaStream
    ? (stream.getVideoTracks()[0]?.getSettings().deviceId ?? '')
    : '';
}

/** A frame with no readable code throws one of these and the scan carries on. Others end it. */
function endsScan(error: unknown): boolean {
  return (
    Boolean(error) &&
    !(
      error instanceof ChecksumException ||
      error instanceof FormatException ||
      error instanceof NotFoundException
    )
  );
}

/**
 * Runs the camera for as long as the component is mounted, starting with the
 * rear camera. Reports the first code once, then stops the camera.
 */
export function useBarcodeCamera(onDetected: (code: string) => void) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onDetectedRef = useRef(onDetected);
  const detected = useRef(false);
  const lastStart = useRef<Promise<void>>(Promise.resolve());
  const [error, setError] = useState<string | null>(() =>
    hasCameraAccess() ? null : CAMERA_MESSAGES.insecure,
  );
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [requestedId, setRequestedId] = useState<string>();
  const [activeId, setActiveId] = useState('');

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    if (!hasCameraAccess()) {
      return;
    }
    let cancelled = false;
    let stop: (() => void) | undefined;

    async function start() {
      if (cancelled) {
        return;
      }
      const controls = await createReader().decodeFromConstraints(
        getConstraints(requestedId),
        videoRef.current ?? undefined,
        (result, scanError, scanControls) => {
          if (cancelled) {
            return;
          }
          if (endsScan(scanError)) {
            console.error('Barcode scan stopped:', scanError);
            setError(CAMERA_MESSAGES.failed);
            return;
          }
          const code = result?.getText().trim();
          if (!code || detected.current) {
            return;
          }
          detected.current = true;
          scanControls.stop();
          onDetectedRef.current(code);
        },
      );
      if (cancelled) {
        controls.stop();
        return;
      }
      stop = () => controls.stop();
      setActiveId(getActiveDeviceId(videoRef.current));
      // Labels are only available once the user has allowed the camera. The camera
      // already works by now, so a failure here only means there is no picker.
      setDevices(await BrowserCodeReader.listVideoInputDevices().catch(() => []));
    }

    // Stopping a start clears the shared video element, so each start waits for the last to
    // finish. This also means Strict Mode's discarded first effect never opens the camera.
    lastStart.current = lastStart.current.then(start).catch((startError: unknown) => {
      if (!cancelled) {
        setError(getCameraErrorMessage(startError));
      }
    });

    return () => {
      cancelled = true;
      stop?.();
    };
  }, [requestedId]);

  return { videoRef, error, devices, deviceId: activeId, selectDevice: setRequestedId };
}
