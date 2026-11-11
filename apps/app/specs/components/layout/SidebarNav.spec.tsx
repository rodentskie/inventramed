import { screen } from '@testing-library/react';
import { SidebarNav } from '../../../src/components/layout/SidebarNav';
import { getVisibleNav } from '../../../src/lib/navigation';
import { renderWithChakra } from '../../test-utils';

const usePathnameMock = jest.fn();

jest.mock('next/navigation', () => ({
  usePathname: () => usePathnameMock(),
}));

describe('SidebarNav', () => {
  beforeEach(() => {
    usePathnameMock.mockReturnValue('/');
  });

  it('marks the active item', () => {
    renderWithChakra(<SidebarNav groups={getVisibleNav(['*'])} />);

    const dashboard = screen.getByRole('link', { name: 'Dashboard' });
    expect(dashboard.getAttribute('href')).toBe('/');
    expect(dashboard.getAttribute('aria-current')).toBe('page');
  });

  it('renders a later screen as a disabled entry, not a link', () => {
    renderWithChakra(
      <SidebarNav
        groups={[
          {
            label: null,
            items: [
              { label: 'Later', href: '/later', icon: 'dashboard', permissions: [], enabled: false },
            ],
          },
        ]}
      />,
    );

    expect(screen.queryByRole('link', { name: /Later/ })).toBeNull();
    const later = screen.getByText('Later').closest('[aria-disabled]');
    expect(later?.textContent).toContain('Soon');
  });

  it('renders every screen as a link', () => {
    renderWithChakra(<SidebarNav groups={getVisibleNav(['*'])} />);

    expect(screen.getByRole('link', { name: 'Medicines' }).getAttribute('href')).toBe('/medicines');
    expect(screen.getByRole('link', { name: 'Scan' }).getAttribute('href')).toBe('/scan');
    expect(screen.getByRole('link', { name: 'Transactions' }).getAttribute('href')).toBe(
      '/inventory/transactions',
    );
    expect(screen.getByRole('link', { name: 'Audit logs' }).getAttribute('href')).toBe(
      '/audit-logs',
    );
    expect(screen.queryByText('Soon')).toBeNull();
  });

  it('shows group headings only for visible groups', () => {
    renderWithChakra(
      <SidebarNav groups={getVisibleNav(['medicine:read', 'inventory:read'])} />,
    );

    expect(screen.getByText('Inventory')).toBeTruthy();
    expect(screen.queryByText('People')).toBeNull();
    expect(screen.queryByText('System')).toBeNull();
  });

  it('calls onNavigate when a link is chosen', () => {
    const onNavigate = jest.fn();
    renderWithChakra(
      <SidebarNav groups={getVisibleNav([])} onNavigate={onNavigate} />,
    );

    screen.getByRole('link', { name: 'Dashboard' }).click();

    expect(onNavigate).toHaveBeenCalled();
  });
});
