import { Button, Flex, Heading, Stack, Text } from '@chakra-ui/react';
import NextLink from 'next/link';
import { LuArrowRight } from 'react-icons/lu';
import { BatchTable } from '@/components/medicines/BatchTable';
import { MedicineDetails } from '@/components/medicines/MedicineDetails';
import { ScanActions } from '@/components/scan/ScanActions';
import type { MovementPermissions } from '@/lib/batch-stock';
import { formatMedicineName } from '@/lib/format';
import type { ScanResult as ScanResultData } from '@/types/medicine';

interface ScanResultProps extends MovementPermissions {
  result: ScanResultData;
  timezone: string;
  onMoved: () => void;
}

/** The scanned medicine and its movements. Editing happens on the medicine's own page. */
export function ScanResult({ result, timezone, canMove, canReceive, onMoved }: ScanResultProps) {
  const { medicine } = result;
  const batch =
    result.kind === 'batch'
      ? medicine.batches.find((candidate) => candidate.id === result.batchId)
      : undefined;

  return (
    <Stack as="section" aria-label="Scan result" gap="5">
      <Flex justify="space-between" align="flex-start" gap="3" wrap="wrap">
        <Stack gap="0.5">
          {batch && (
            <Text textStyle="sm" color="fg.muted">
              Batch {batch.batchNumber} · Expires {batch.expirationDate}
            </Text>
          )}
          <Heading as="h2" size="lg">
            {formatMedicineName(medicine.name, medicine.strength)}
          </Heading>
        </Stack>
        <Button asChild size="sm" variant="outline">
          <NextLink href={`/medicines/${medicine.id}`}>
            Open medicine
            <LuArrowRight />
          </NextLink>
        </Button>
      </Flex>
      <ScanActions
        medicine={medicine}
        batch={batch}
        canMove={canMove}
        canReceive={canReceive}
        onMoved={onMoved}
      />
      <MedicineDetails medicine={medicine} />
      <BatchTable
        batches={medicine.batches}
        unit={medicine.unit}
        canEdit={false}
        timezone={timezone}
        highlightId={batch?.id}
      />
    </Stack>
  );
}
