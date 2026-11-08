'use client';

import { Box, Button, Field, Grid, Group, Input, Separator, Stack, Text } from '@chakra-ui/react';
import { EmptyState, toaster } from '@inventra-med/components';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { LuCamera, LuCameraOff, LuSearchX } from 'react-icons/lu';
import { lookupBarcodeAction } from '@/actions/scan';
import { MedicineFormDialog } from '@/components/medicines/MedicineFormDialog';
import { LazyCameraScanner } from '@/components/scan/LazyCameraScanner';
import { ScanResult } from '@/components/scan/ScanResult';
import { GENERIC_ERROR } from '@/hooks/use-action-submit';
import type { MovementPermissions } from '@/lib/batch-stock';
import { OWN_PREFIX_PATTERN } from '@/lib/validations/barcode';
import { useScanStore } from '@/stores/scan-store';

export const NOT_FOUND_MESSAGE = 'No medicine has this barcode.';

interface ScanViewProps extends MovementPermissions {
  timezone: string;
  /** `medicine:write`, which offers to add a medicine for an unknown product code. */
  canCreate: boolean;
}

function NotFound({ code, canCreate }: { code: string; canCreate: boolean }) {
  const isProductCode = !OWN_PREFIX_PATTERN.test(code);
  return (
    <EmptyState
      borderWidth="1px"
      borderColor="border"
      rounded="md"
      icon={<LuSearchX />}
      title={NOT_FOUND_MESSAGE}
      description={code}
    >
      {canCreate && isProductCode && (
        <MedicineFormDialog defaultProductBarcode={code} triggerLabel="Add medicine" />
      )}
    </EmptyState>
  );
}

/** Camera, typed input and result. A USB scanner types into the input and presses Enter. */
export function ScanView({ timezone, canCreate, canMove, canReceive }: ScanViewProps) {
  const cameraOn = useScanStore((state) => state.cameraOn);
  const outcome = useScanStore((state) => state.outcome);
  const setCameraOn = useScanStore((state) => state.setCameraOn);
  const setOutcome = useScanStore((state) => state.setOutcome);
  const latestLookup = useRef(0);
  const [code, setCode] = useState('');
  const [inputError, setInputError] = useState<string>();
  const [isLooking, setIsLooking] = useState(false);

  useEffect(() => useScanStore.getState().reset, []);

  async function lookUp(value: string) {
    const lookup = ++latestLookup.current;
    setIsLooking(true);
    setInputError(undefined);
    try {
      const result = await lookupBarcodeAction(value);
      // A newer scan wins, so stock is never shown or moved for the wrong item.
      if (lookup !== latestLookup.current) {
        return;
      }
      if (result.success) {
        setOutcome({ kind: 'found', code: value, result: result.data });
      } else if (result.error.code === 'NOT_FOUND') {
        setOutcome({ kind: 'not-found', code: value.trim() });
      } else if (result.error.code === 'VALIDATION_ERROR') {
        setInputError(result.error.fields?.code?.[0] ?? result.error.message);
      } else {
        toaster.create({ type: 'error', title: result.error.message });
      }
    } catch {
      toaster.create({ type: 'error', title: GENERIC_ERROR });
    } finally {
      if (lookup === latestLookup.current) {
        setIsLooking(false);
      }
    }
  }

  function refreshResult() {
    if (outcome.kind === 'found') {
      void lookUp(outcome.code);
    }
  }

  function handleDetected(value: string) {
    setCameraOn(false);
    setCode(value);
    void lookUp(value);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isLooking) {
      void lookUp(code);
    }
  }

  return (
    <Stack gap="6">
      <Grid templateColumns={{ base: '1fr', md: 'repeat(2, minmax(0, 1fr))' }} gap="6">
        <Stack gap="3">
          {cameraOn ? (
            <LazyCameraScanner onDetected={handleDetected} />
          ) : (
            <Box
              aspectRatio={4 / 3}
              maxH="xs"
              rounded="md"
              borderWidth="1px"
              borderStyle="dashed"
              borderColor="border"
              display="flex"
              alignItems="center"
              justifyContent="center"
            >
              <Text textStyle="sm" color="fg.muted">
                Camera is off
              </Text>
            </Box>
          )}
          <Box>
            <Button size="sm" variant="outline" onClick={() => setCameraOn(!cameraOn)}>
              {cameraOn ? <LuCameraOff /> : <LuCamera />}
              {cameraOn ? 'Stop camera' : outcome.kind === 'idle' ? 'Start camera' : 'Scan again'}
            </Button>
          </Box>
        </Stack>
        <form onSubmit={handleSubmit} noValidate>
          <Field.Root invalid={Boolean(inputError)}>
            <Field.Label>Or enter a barcode</Field.Label>
            <Group attached width="full">
              <Input
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="MED-, BAT- or product code"
                autoComplete="off"
                spellCheck={false}
                fontFamily="mono"
              />
              <Button type="submit" variant="outline" loading={isLooking}>
                Look up
              </Button>
            </Group>
            <Field.ErrorText>{inputError}</Field.ErrorText>
          </Field.Root>
        </form>
      </Grid>
      {outcome.kind !== 'idle' && <Separator />}
      {outcome.kind === 'found' && (
        <ScanResult
          result={outcome.result}
          timezone={timezone}
          canMove={canMove}
          canReceive={canReceive}
          onMoved={refreshResult}
        />
      )}
      {outcome.kind === 'not-found' && <NotFound code={outcome.code} canCreate={canCreate} />}
    </Stack>
  );
}
