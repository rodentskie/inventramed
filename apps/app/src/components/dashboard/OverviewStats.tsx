import { SimpleGrid, Stack, Text } from '@chakra-ui/react';
import {
  StatLabel,
  StatRoot,
  StatValueText,
  StatValueUnit,
} from '@inventra-med/components';
import { SectionHeading } from '@/components/dashboard/SectionHeading';
import { formatCount } from '@/lib/format';
import type { DashboardOverview } from '@/types/dashboard';

interface StatCardProps {
  label: string;
  value: number;
  unit?: string;
  color?: string;
}

function StatCard({ label, value, unit, color }: StatCardProps) {
  return (
    <StatRoot borderWidth="1px" borderColor="border" rounded="md" p="4">
      <StatLabel>{label}</StatLabel>
      <StatValueText color={color}>
        {formatCount(value)}
        {unit && <StatValueUnit>{unit}</StatValueUnit>}
      </StatValueText>
    </StatRoot>
  );
}

export function OverviewStats({ overview }: { overview: DashboardOverview }) {
  return (
    <Stack as="section" gap="3">
      <SectionHeading title="Overview" />
      <SimpleGrid columns={{ base: 2, md: 4 }} gap="4">
        <StatCard label="Medicines" value={overview.medicineCount} />
        <StatCard label="Units in stock" value={overview.unitsInStock} />
        <StatCard
          label="Near expiry"
          value={overview.nearExpiryBatches}
          unit="batches"
          color={overview.nearExpiryBatches > 0 ? 'orange.fg' : undefined}
        />
        <StatCard
          label="Expired"
          value={overview.expiredBatches}
          unit="batches"
          color={overview.expiredBatches > 0 ? 'red.fg' : undefined}
        />
      </SimpleGrid>
      <Text textStyle="sm" color="fg.muted">
        Near expiry means expiring within {overview.threshold} days.
      </Text>
    </Stack>
  );
}
