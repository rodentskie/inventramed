import { Stack, Text } from '@chakra-ui/react';
import { DataListItem, DataListRoot } from '@inventra-med/components';
import { Barcode } from '@/components/common/Barcode';
import { formatCount } from '@/lib/format';
import type { Medicine } from '@/types/medicine';

const DASH = '—';

export function MedicineDetails({ medicine }: { medicine: Medicine }) {
  return (
    <Stack gap="6">
      <DataListRoot
        orientation="vertical"
        size="md"
        display="grid"
        gridTemplateColumns={{ base: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))' }}
        columnGap="6"
        rowGap="4"
      >
        <DataListItem label="Generic name" value={medicine.genericName ?? DASH} />
        <DataListItem label="Strength" value={medicine.strength ?? DASH} />
        <DataListItem label="Form" value={medicine.dosageForm ?? DASH} />
        <DataListItem label="Unit" value={medicine.unit} />
        <DataListItem
          label="Total stock"
          value={`${formatCount(medicine.totalStock)} ${medicine.unit}`}
        />
        <DataListItem
          label="Product barcode"
          value={
            medicine.productBarcode ? (
              <Text as="span" fontFamily="mono" wordBreak="break-all">
                {medicine.productBarcode}
              </Text>
            ) : (
              DASH
            )
          }
        />
      </DataListRoot>
      <DataListRoot orientation="vertical" size="md">
        <DataListItem label="Barcode" value={<Barcode value={medicine.barcode} />} />
      </DataListRoot>
    </Stack>
  );
}
