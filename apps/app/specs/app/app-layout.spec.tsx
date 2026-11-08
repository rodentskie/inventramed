import { screen } from '@testing-library/react';
import AppLayout from '../../src/app/(app)/layout';
import { getCurrentUser } from '../../src/lib/auth';
import { getLatestDigest } from '../../src/lib/dashboard';
import { renderWithChakra } from '../test-utils';

jest.mock('next/navigation', () => ({
  redirect: jest.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
  usePathname: () => '/',
}));
jest.mock('next-auth/react', () => ({ signOut: jest.fn() }));
jest.mock('@/lib/auth', () => ({ getCurrentUser: jest.fn() }));
jest.mock('@/lib/dashboard', () => ({ getLatestDigest: jest.fn() }));
jest.mock('@inventra-med/components', () => ({
  ...jest.requireActual('@inventra-med/components'),
  ColorModeButton: () => <button>Toggle color mode</button>,
}));

const getCurrentUserMock = getCurrentUser as jest.Mock;
const getLatestDigestMock = getLatestDigest as jest.Mock;

function userWith(permissions: string[]) {
  return {
    id: 'user-1',
    username: 'rodentskie',
    firstName: 'Rodney',
    lastName: 'Lingganay',
    roleName: 'collaborator',
    permissions,
  };
}

async function renderLayout() {
  return renderWithChakra(await AppLayout({ children: <p>Page body</p> }));
}

describe('AppLayout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redirects to /login without a current user', async () => {
    getCurrentUserMock.mockResolvedValue(null);

    await expect(AppLayout({ children: null })).rejects.toThrow('redirect:/login');
  });

  it('renders the context header, sidebar and page', async () => {
    getCurrentUserMock.mockResolvedValue(userWith(['medicine:read']));

    await renderLayout();

    expect(screen.getByText('Rodney Lingganay')).toBeTruthy();
    expect(screen.getByText('(rodentskie)')).toBeTruthy();
    expect(screen.getByText('Collaborator')).toBeTruthy();
    expect(screen.getByText('Page body')).toBeTruthy();
    // The desktop sidebar is CSS-hidden at jsdom's default width.
    const dashboardLink = screen.getByRole('link', { name: 'Dashboard', hidden: true });
    expect(dashboardLink.getAttribute('aria-current')).toBe('page');
  });

  it('hides the bell without notification:read', async () => {
    getCurrentUserMock.mockResolvedValue(userWith(['medicine:read']));

    await renderLayout();

    expect(getLatestDigestMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: /Notifications/ })).toBeNull();
  });

  it('marks the bell when the latest digest is unread', async () => {
    getCurrentUserMock.mockResolvedValue(userWith(['notification:read']));
    getLatestDigestMock.mockResolvedValue({ id: 'n-1', isRead: false });

    await renderLayout();

    const bell = screen.getByRole('link', { name: 'Notifications, unread' });
    expect(bell.getAttribute('href')).toBe('/#alerts');
  });

  it('shows a plain bell when there is no unread digest', async () => {
    getCurrentUserMock.mockResolvedValue(userWith(['notification:read']));
    getLatestDigestMock.mockResolvedValue(null);

    await renderLayout();

    expect(screen.getByRole('link', { name: 'Notifications' })).toBeTruthy();
  });
});
