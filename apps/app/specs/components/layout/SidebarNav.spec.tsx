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

  it('renders later screens as disabled entries, not links', () => {
    renderWithChakra(<SidebarNav groups={getVisibleNav(['*'])} />);

    expect(screen.queryByRole('link', { name: /Transactions/ })).toBeNull();
    const transactions = screen.getByText('Transactions').closest('[aria-disabled]');
    expect(transactions?.textContent).toContain('Soon');
    expect(screen.getAllByText('Soon')).toHaveLength(3);
  });

  it('renders Medicines and Scan as links', () => {
    renderWithChakra(<SidebarNav groups={getVisibleNav(['*'])} />);

    expect(screen.getByRole('link', { name: 'Medicines' }).getAttribute('href')).toBe('/medicines');
    expect(screen.getByRole('link', { name: 'Scan' }).getAttribute('href')).toBe('/scan');
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
