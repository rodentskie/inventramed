import { act, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { markNotificationReadAction } from '../../../src/actions/notifications';
import { DigestItemsTable } from '../../../src/components/notifications/DigestItemsTable';
import { DigestList } from '../../../src/components/notifications/DigestList';
import { MarkAllReadButton } from '../../../src/components/notifications/MarkAllReadButton';
import { MarkAsRead } from '../../../src/components/notifications/MarkAsRead';
import type { NotificationItem, NotificationSummary } from '../../../src/types/notification';
import { renderWithChakra } from '../../test-utils';

const refreshMock = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));
jest.mock('@/actions/notifications', () => ({
  markNotificationReadAction: jest.fn(),
  markAllNotificationsReadAction: jest.fn(),
}));

const markMock = markNotificationReadAction as jest.Mock;

const digest: NotificationSummary = {
  id: 'n-1',
  notificationDate: '2026-11-08',
  expiredCount: 2,
  nearExpiryCount: 7,
  isRead: false,
  createdAt: '2026-11-08T00:00:00.000Z',
};

const item: NotificationItem = {
  id: 'item-1',
  batchId: 'batch-1',
  medicineId: 'medicine-1',
  medicineName: 'Amoxicillin',
  strength: '500 mg',
  unit: 'cap',
  batchNumber: 'A123',
  status: 'EXPIRED',
  quantity: 20,
  expirationDate: '2026-11-01',
  daysToExpiry: -7,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('DigestList', () => {
  it('links each digest and tags the unread ones', () => {
    renderWithChakra(
      <DigestList items={[digest, { ...digest, id: 'n-2', notificationDate: '2026-11-07', isRead: true }]} />,
    );

    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/notifications/n-1',
      '/notifications/n-2',
    ]);
    expect(links[0].textContent).toContain('Unread');
    expect(links[1].textContent).not.toContain('Unread');
    expect(links[0].textContent).toContain('2 expired · 7 near expiry');
  });

  it('has an empty state', () => {
    renderWithChakra(<DigestList items={[]} />);

    expect(screen.getByText('No alerts yet')).toBeTruthy();
    expect(
      screen.getByText('A digest appears here on days a batch is near expiry or expired.'),
    ).toBeTruthy();
  });
});

describe('MarkAllReadButton', () => {
  function button() {
    return screen.getByRole<HTMLButtonElement>('button', { name: 'Mark all as read' });
  }

  it('is disabled with nothing unread', () => {
    renderWithChakra(<MarkAllReadButton unreadCount={0} />);

    expect(button().disabled).toBe(true);
  });

  it('is enabled with something unread', () => {
    renderWithChakra(<MarkAllReadButton unreadCount={2} />);

    expect(button().disabled).toBe(false);
  });
});

describe('DigestItemsTable', () => {
  function renderTable(currentQuantity: number | undefined, canViewMedicines = true) {
    renderWithChakra(
      <DigestItemsTable
        items={[item]}
        currentQuantities={currentQuantity === undefined ? {} : { 'batch-1': currentQuantity }}
        canViewMedicines={canViewMedicines}
      />,
    );
  }

  it('shows the snapshot and status', () => {
    renderTable(20);

    expect(screen.getByText('A123')).toBeTruthy();
    expect(screen.getByText('2026-11-01')).toBeTruthy();
    expect(screen.getByText('Expired 7d ago')).toBeTruthy();
  });

  it('adds the current quantity only when it changed', () => {
    renderTable(0);
    expect(screen.getByText('20 cap (now 0)')).toBeTruthy();
  });

  it.each([20, undefined])('shows only the snapshot when the current quantity is %s', (current) => {
    renderTable(current);
    expect(screen.getByText('20 cap')).toBeTruthy();
  });

  it('links the medicine with medicine:read', () => {
    renderTable(20);

    expect(
      screen.getByRole('link', { name: 'Amoxicillin 500 mg' }).getAttribute('href'),
    ).toBe('/medicines/medicine-1');
  });

  it('shows plain text without medicine:read', () => {
    renderTable(20, false);

    expect(screen.getByText('Amoxicillin 500 mg')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('MarkAsRead', () => {
  async function renderIt() {
    let result!: ReturnType<typeof render>;
    await act(async () => {
      result = render(
        <StrictMode>
          <MarkAsRead id="n-1" />
        </StrictMode>,
      );
    });
    return result;
  }

  it('calls the action once, including under Strict Mode, then refreshes', async () => {
    markMock.mockResolvedValue({ success: true, data: { id: 'n-1', readAt: 'now' } });

    const { container } = await renderIt();

    expect(markMock).toHaveBeenCalledTimes(1);
    expect(markMock).toHaveBeenCalledWith('n-1');
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(container.innerHTML).toBe('');
  });

  it('stays silent and does not refresh when the action fails', async () => {
    markMock.mockResolvedValue({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Not found.' },
    });

    await renderIt();

    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('stays silent when the request rejects', async () => {
    markMock.mockRejectedValue(new Error('offline'));

    await renderIt();

    expect(refreshMock).not.toHaveBeenCalled();
  });
});
