import { screen } from '@testing-library/react';
import { notFound, redirect } from 'next/navigation';
import DigestPage, { generateMetadata } from '../../src/app/(app)/notifications/[id]/page';
import NotificationsPage from '../../src/app/(app)/notifications/page';
import { notFound as apiNotFound } from '../../src/lib/api-response';
import { getCurrentUser, requirePageUser } from '../../src/lib/auth';
import {
  getCurrentBatchQuantities,
  getNotification,
  listNotifications,
} from '../../src/lib/notifications';
import { getSettings } from '../../src/lib/settings';
import { renderWithChakra } from '../test-utils';

jest.mock('next/navigation', () => ({
  redirect: jest.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
  notFound: jest.fn(() => {
    throw new Error('notFound');
  }),
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
  usePathname: () => '/notifications',
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/lib/auth', () => ({ requirePageUser: jest.fn(), getCurrentUser: jest.fn() }));
jest.mock('@/lib/notifications', () => ({
  listNotifications: jest.fn(),
  getNotification: jest.fn(),
  getCurrentBatchQuantities: jest.fn(),
}));
jest.mock('@/lib/settings', () => ({ getSettings: jest.fn() }));
jest.mock('@/actions/notifications', () => ({
  markNotificationReadAction: jest.fn().mockResolvedValue({ success: false, error: {} }),
  markAllNotificationsReadAction: jest.fn(),
}));

const pageUserMock = requirePageUser as jest.Mock;
const listMock = listNotifications as jest.Mock;
const getMock = getNotification as jest.Mock;

const USER_ID = 'user-1';
const ID = '3f2b7c1e-8a4d-4e6f-9b1a-2c3d4e5f6a7b';

const detail = {
  id: ID,
  notificationDate: '2026-11-08',
  expiredCount: 1,
  nearExpiryCount: 0,
  isRead: true,
  // 08:00 in Manila.
  createdAt: '2026-11-08T00:00:00.000Z',
  items: [
    {
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
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  pageUserMock.mockResolvedValue({ id: USER_ID, permissions: ['*'] });
  (getCurrentUser as jest.Mock).mockResolvedValue({ id: USER_ID, permissions: ['*'] });
  (getSettings as jest.Mock).mockResolvedValue({ timezone: 'Asia/Manila' });
  (getCurrentBatchQuantities as jest.Mock).mockResolvedValue({ 'batch-1': 0 });
});

describe('/notifications', () => {
  async function renderPage(searchParams: Record<string, string> = {}) {
    renderWithChakra(await NotificationsPage({ searchParams: Promise.resolve(searchParams) }));
  }

  it('requires notification:read', async () => {
    pageUserMock.mockRejectedValue(new Error('redirect:/'));

    await expect(renderPage()).rejects.toThrow('redirect:/');
    expect(pageUserMock).toHaveBeenCalledWith('notification:read');
    expect(listMock).not.toHaveBeenCalled();
  });

  it('lists the current user’s digests with the query', async () => {
    listMock.mockResolvedValue({
      items: [{ ...detail, isRead: false }],
      total: 1,
      unreadCount: 1,
      page: 2,
      pageSize: 20,
    });

    await renderPage({ page: '2' });

    expect(listMock).toHaveBeenCalledWith(USER_ID, { page: 2, pageSize: 20 });
    expect(screen.getByRole('link', { name: /Daily digest for 2026-11-08/ })).toBeTruthy();
  });

  it('goes to the last page when past the end', async () => {
    listMock.mockResolvedValue({ items: [], total: 31, unreadCount: 0, page: 9, pageSize: 20 });

    await expect(renderPage({ page: '9' })).rejects.toThrow('redirect:');
    expect(redirect).toHaveBeenCalledWith('/notifications?page=2&pageSize=20');
  });
});

describe('/notifications/[id]', () => {
  async function renderPage(id = ID) {
    renderWithChakra(await DigestPage({ params: Promise.resolve({ id }) }));
  }

  it('requires notification:read', async () => {
    pageUserMock.mockRejectedValue(new Error('redirect:/'));

    await expect(renderPage()).rejects.toThrow('redirect:/');
    expect(pageUserMock).toHaveBeenCalledWith('notification:read');
    expect(getMock).not.toHaveBeenCalled();
  });

  it('shows the digest as of its time in the settings timezone, with live quantities', async () => {
    getMock.mockResolvedValue(detail);

    await renderPage();

    expect(getMock).toHaveBeenCalledWith(USER_ID, ID);
    expect(screen.getByRole('heading', { name: 'Daily digest for 2026-11-08' })).toBeTruthy();
    expect(screen.getByText('1 expired · 0 near expiry · As of 2026-11-08 08:00')).toBeTruthy();
    expect(getCurrentBatchQuantities).toHaveBeenCalledWith(['batch-1']);
    expect(screen.getByText('20 cap (now 0)')).toBeTruthy();
  });

  it('hides medicine links without medicine:read', async () => {
    pageUserMock.mockResolvedValue({ id: USER_ID, permissions: ['notification:read'] });
    getMock.mockResolvedValue(detail);

    await renderPage();

    expect(screen.queryByRole('link', { name: 'Amoxicillin 500 mg' })).toBeNull();
  });

  it('shows not-found for a malformed ID', async () => {
    await expect(renderPage('not-a-uuid')).rejects.toThrow('notFound');
    expect(notFound).toHaveBeenCalled();
    expect(getMock).not.toHaveBeenCalled();
  });

  it('shows not-found for a missing or empty digest', async () => {
    getMock.mockRejectedValue(apiNotFound());

    await expect(renderPage()).rejects.toThrow('notFound');
    expect(notFound).toHaveBeenCalled();
  });

  it('titles the page with the digest date', async () => {
    getMock.mockResolvedValue(detail);

    await expect(generateMetadata({ params: Promise.resolve({ id: ID }) })).resolves.toEqual({
      title: 'Digest 2026-11-08',
    });
  });
});
