import { screen } from '@testing-library/react';
import { redirect } from 'next/navigation';
import DashboardPage from '../src/app/(app)/page';
import { getCurrentUser } from '../src/lib/auth';
import {
  getAttentionBatches,
  getLatestDigest,
  getOverview,
  getRecentActivity,
  getWorkerStatus,
} from '../src/lib/dashboard';
import { renderWithChakra } from './test-utils';

jest.mock('next/navigation', () => ({
  redirect: jest.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));
jest.mock('@/lib/auth', () => ({ getCurrentUser: jest.fn() }));
jest.mock('@/lib/dashboard', () => ({
  getAttentionBatches: jest.fn(),
  getLatestDigest: jest.fn(),
  getOverview: jest.fn(),
  getRecentActivity: jest.fn(),
  getWorkerStatus: jest.fn(),
}));

const getCurrentUserMock = getCurrentUser as jest.Mock;

function userWith(permissions: string[]) {
  return {
    id: 'user-1',
    username: 'rodentskie',
    firstName: 'Rodney',
    lastName: 'Lingganay',
    roleName: 'admin',
    permissions,
  };
}

describe('DashboardPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getWorkerStatus as jest.Mock).mockResolvedValue({
      smsEnabled: true,
      lastSeenAt: null,
      online: false,
    });
    (getOverview as jest.Mock).mockResolvedValue({
      medicineCount: 1,
      unitsInStock: 10,
      nearExpiryBatches: 0,
      expiredBatches: 0,
      threshold: 30,
    });
    (getAttentionBatches as jest.Mock).mockResolvedValue({ items: [], total: 0, threshold: 30 });
    (getLatestDigest as jest.Mock).mockResolvedValue(null);
    (getRecentActivity as jest.Mock).mockResolvedValue([]);
  });

  it('redirects to /login without a current user', async () => {
    getCurrentUserMock.mockResolvedValue(null);

    await expect(DashboardPage()).rejects.toThrow('redirect:/login');
    expect(redirect).toHaveBeenCalledWith('/login');
  });

  it('shows every section to admin', async () => {
    getCurrentUserMock.mockResolvedValue(userWith(['*']));

    renderWithChakra(await DashboardPage());

    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeTruthy();
    expect(screen.getByText('SMS worker offline')).toBeTruthy();
    expect(screen.getByText('Overview')).toBeTruthy();
    expect(screen.getByText('Needs attention')).toBeTruthy();
    expect(screen.getByText('Latest alert')).toBeTruthy();
    expect(screen.getByText('Recent activity')).toBeTruthy();
  });

  it('hides sections and skips their queries without permission', async () => {
    getCurrentUserMock.mockResolvedValue(
      userWith(['medicine:read', 'inventory:read', 'notification:read']),
    );

    renderWithChakra(await DashboardPage());

    expect(getWorkerStatus).not.toHaveBeenCalled();
    expect(screen.queryByText('SMS worker offline')).toBeNull();
    expect(screen.getByText('Overview')).toBeTruthy();
    expect(screen.getByText('Recent activity')).toBeTruthy();
  });

  it('shows only the alert to a notification-only role', async () => {
    getCurrentUserMock.mockResolvedValue(userWith(['notification:read']));

    renderWithChakra(await DashboardPage());

    expect(getOverview).not.toHaveBeenCalled();
    expect(getRecentActivity).not.toHaveBeenCalled();
    expect(screen.getByText('Latest alert')).toBeTruthy();
    expect(screen.queryByText('Overview')).toBeNull();
  });

  it('explains when the role has no dashboard access', async () => {
    getCurrentUserMock.mockResolvedValue(userWith(['audit:read']));

    renderWithChakra(await DashboardPage());

    expect(screen.getByText('Welcome, Rodney.')).toBeTruthy();
    expect(screen.getByText(/Your role has no dashboard access/)).toBeTruthy();
  });
});
