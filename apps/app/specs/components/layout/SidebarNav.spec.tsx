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

    expect(screen.queryByRole('link', { name: /Medicines/ })).toBeNull();
    const medicines = screen.getByText('Medicines').closest('[aria-disabled]');
    expect(medicines?.textContent).toContain('Soon');
    expect(screen.getAllByText('Soon')).toHaveLength(7);
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
