import { screen } from '@testing-library/react';
import { AttentionTable } from '../../../src/components/dashboard/AttentionTable';
import { LatestAlert } from '../../../src/components/dashboard/LatestAlert';
import { OverviewStats } from '../../../src/components/dashboard/OverviewStats';
import { RecentActivity } from '../../../src/components/dashboard/RecentActivity';
import { WorkerStatusAlert } from '../../../src/components/dashboard/WorkerStatusAlert';
import type { ActivityItem, AttentionBatch } from '../../../src/types/dashboard';
import { renderWithChakra } from '../../test-utils';

const NOW = new Date('2026-11-08T04:00:00.000Z');

const batch: AttentionBatch = {
  id: 'b-1',
  medicineName: 'Amoxicillin',
  strength: '500 mg',
  unit: 'cap',
  batchNumber: 'A123',
  expirationDate: '2026-11-01',
  quantity: 20,
  status: 'EXPIRED',
  daysToExpiry: -7,
};

const activity: ActivityItem = {
  id: 'tx-1',
  direction: 'IN',
  reason: 'RECEIVED',
  quantity: 100,
  unit: 'pc',
  medicineName: 'Paracetamol',
  strength: '500 mg',
  performedBy: 'admin',
  createdAt: new Date(NOW.getTime() - 10 * 60_000).toISOString(),
  exactTime: 'Nov 8, 2026, 11:50 AM',
};

describe('WorkerStatusAlert', () => {
  it('renders nothing while the worker is online', () => {
    const { container } = renderWithChakra(
      <WorkerStatusAlert status={{ smsEnabled: true, lastSeenAt: NOW.toISOString(), online: true }} />,
    );

    expect(container.textContent).toBe('');
  });

  it('warns when the worker was last seen a while ago', () => {
    const lastSeenAt = new Date(NOW.getTime() - 2 * 3_600_000).toISOString();
    renderWithChakra(
      <WorkerStatusAlert status={{ smsEnabled: true, lastSeenAt, online: false }} now={NOW} />,
    );

    expect(screen.getByText('SMS worker offline')).toBeTruthy();
    expect(screen.getByText(/last seen 2 h ago/)).toBeTruthy();
  });

  it('warns when the worker never connected', () => {
    renderWithChakra(
      <WorkerStatusAlert status={{ smsEnabled: true, lastSeenAt: null, online: false }} />,
    );

    expect(screen.getByText(/never connected/)).toBeTruthy();
  });

  it('says SMS is off instead of warning', () => {
    renderWithChakra(
      <WorkerStatusAlert status={{ smsEnabled: false, lastSeenAt: null, online: false }} />,
    );

    expect(screen.getByText('SMS alerts are turned off.')).toBeTruthy();
    expect(screen.queryByText('SMS worker offline')).toBeNull();
  });
});

describe('OverviewStats', () => {
  it('shows the counts and the threshold', () => {
    renderWithChakra(
      <OverviewStats
        overview={{
          medicineCount: 128,
          unitsInStock: 4512,
          nearExpiryBatches: 7,
          expiredBatches: 2,
          threshold: 30,
        }}
      />,
    );

    expect(screen.getByText('128')).toBeTruthy();
    expect(screen.getByText('4,512')).toBeTruthy();
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('Near expiry means expiring within 30 days.')).toBeTruthy();
  });
});

describe('AttentionTable', () => {
  it('lists the batches', () => {
    renderWithChakra(<AttentionTable list={{ items: [batch], total: 1, threshold: 30 }} />);

    expect(screen.getByText('Amoxicillin 500 mg')).toBeTruthy();
    expect(screen.getByText('A123')).toBeTruthy();
    expect(screen.getByText('Expired 7d ago')).toBeTruthy();
    expect(screen.getByText('20 cap')).toBeTruthy();
    expect(screen.queryByText(/Showing/)).toBeNull();
  });

  it('says how many batches are hidden', () => {
    renderWithChakra(<AttentionTable list={{ items: [batch], total: 12, threshold: 30 }} />);

    expect(screen.getByText('Showing 1 of 12 batches.')).toBeTruthy();
  });

  it('shows an empty state', () => {
    renderWithChakra(<AttentionTable list={{ items: [], total: 0, threshold: 30 }} />);

    expect(screen.getByText('All stock is safe')).toBeTruthy();
    expect(screen.getByText('No batch is expired or expiring within 30 days.')).toBeTruthy();
  });
});

describe('LatestAlert', () => {
  const digest = {
    id: 'n-1',
    notificationDate: '2026-11-08',
    expiredCount: 2,
    nearExpiryCount: 7,
    isRead: false,
    createdAt: NOW.toISOString(),
  };

  it('shows the digest with an unread tag', () => {
    renderWithChakra(<LatestAlert digest={digest} />);

    expect(screen.getByText('Daily digest for 2026-11-08')).toBeTruthy();
    expect(screen.getByText('2 expired, 7 near expiry')).toBeTruthy();
    expect(screen.getByText('Unread')).toBeTruthy();
  });

  it('hides the tag once read', () => {
    renderWithChakra(<LatestAlert digest={{ ...digest, isRead: true }} />);

    expect(screen.queryByText('Unread')).toBeNull();
  });

  it('is the #alerts target and has an empty state', () => {
    const { container } = renderWithChakra(<LatestAlert digest={null} />);

    expect(container.querySelector('#alerts')).not.toBeNull();
    expect(screen.getByText('No alerts yet')).toBeTruthy();
  });
});

describe('RecentActivity', () => {
  it('shows each movement', () => {
    renderWithChakra(<RecentActivity items={[activity]} now={NOW} />);

    expect(screen.getByText('Received')).toBeTruthy();
    expect(screen.getByText('+100 pc')).toBeTruthy();
    expect(screen.getByText('Paracetamol 500 mg')).toBeTruthy();
    expect(screen.getByText('by admin')).toBeTruthy();
    expect(screen.getByText('10 min ago').getAttribute('datetime')).toBe(activity.createdAt);
  });

  it('uses a minus sign for stock going out', () => {
    renderWithChakra(
      <RecentActivity
        items={[{ ...activity, direction: 'OUT', reason: 'DISPENSED', quantity: 20 }]}
        now={NOW}
      />,
    );

    expect(screen.getByText('Dispensed')).toBeTruthy();
    expect(screen.getByText('−20 pc')).toBeTruthy();
  });

  it('shows an empty state', () => {
    renderWithChakra(<RecentActivity items={[]} />);

    expect(screen.getByText('No stock movement yet')).toBeTruthy();
  });
});
