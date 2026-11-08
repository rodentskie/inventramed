'use client';

import { Button, Group, Input, Stack } from '@chakra-ui/react';
import { Field } from '@inventra-med/components';
import { useState } from 'react';
import { LuScanBarcode, LuX } from 'react-icons/lu';
import { LazyCameraScanner } from '@/components/scan/LazyCameraScanner';

interface ProductBarcodeFieldProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

/**
 * The manufacturer's barcode. `Scan` opens the camera inline; the first read
 * fills the field and turns the camera off. Typing and USB scanners work too.
 */
export function ProductBarcodeField({ value, onChange, error }: ProductBarcodeFieldProps) {
  const [scanning, setScanning] = useState(false);

  function handleDetected(code: string) {
    onChange(code);
    setScanning(false);
  }

  return (
    <Field
      label="Product barcode"
      helperText={error ? undefined : 'The barcode printed on the box, if it has one.'}
      invalid={Boolean(error)}
      errorText={error}
    >
      <Stack gap="2" width="full">
        <Group attached width="full">
          <Input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            fontFamily="mono"
          />
          <Button
            variant="outline"
            onClick={() => setScanning((current) => !current)}
            aria-pressed={scanning}
          >
            {scanning ? <LuX /> : <LuScanBarcode />}
            {scanning ? 'Stop' : 'Scan'}
          </Button>
        </Group>
        {scanning && <LazyCameraScanner onDetected={handleDetected} />}
      </Stack>
    </Field>
  );
}
