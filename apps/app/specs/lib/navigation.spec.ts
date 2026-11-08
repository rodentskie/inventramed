import {
  findNavItem,
  getVisibleNav,
  isNavItemActive,
  NAV_GROUPS,
} from '../../src/lib/navigation';

function labels(permissions: string[]) {
  return getVisibleNav(permissions).flatMap((group) =>
    group.items.map((item) => item.label),
  );
}

describe('getVisibleNav', () => {
  it('shows every item to admin', () => {
    expect(labels(['*'])).toEqual(
      NAV_GROUPS.flatMap((group) => group.items.map((item) => item.label)),
    );
  });

  it('shows staff the dashboard and the inventory group', () => {
    expect(labels(['medicine:*', 'inventory:*', 'notification:read'])).toEqual([
      'Dashboard',
      'Medicines',
      'Transactions',
      'Scan',
    ]);
  });

  it('shows a collaborator the same read-only items', () => {
    expect(
      labels(['medicine:read', 'inventory:read', 'notification:read']),
    ).toEqual(['Dashboard', 'Medicines', 'Transactions', 'Scan']);
  });

  it('removes groups left empty', () => {
    const groups = getVisibleNav(['audit:read']);

    expect(groups.map((group) => group.label)).toEqual([null, 'System']);
    expect(groups[1].items.map((item) => item.label)).toEqual(['Audit logs']);
  });

  it('always shows the dashboard', () => {
    expect(labels([])).toEqual(['Dashboard']);
  });

  it('keeps the enabled flag of later screens', () => {
    const items = getVisibleNav(['*']).flatMap((group) => group.items);

    expect(items.find((item) => item.label === 'Dashboard')?.enabled).toBe(true);
    expect(items.find((item) => item.label === 'Medicines')?.enabled).toBe(true);
    expect(items.find((item) => item.label === 'Scan')?.enabled).toBe(true);
    expect(items.find((item) => item.label === 'Transactions')?.enabled).toBe(false);
  });
});

describe('isNavItemActive', () => {
  it.each([
    ['/', '/', true],
    ['/', '/medicines', false],
    ['/medicines', '/medicines', true],
    ['/medicines', '/medicines/abc', true],
    ['/medicines', '/medicines-old', false],
  ])('%s on %s is %s', (href, pathname, expected) => {
    expect(isNavItemActive(href, pathname)).toBe(expected);
  });
});

describe('findNavItem', () => {
  it('finds the item for a path and its child routes', () => {
    expect(findNavItem('/')?.label).toBe('Dashboard');
    expect(findNavItem('/settings/sms')?.label).toBe('Settings');
  });

  it('returns undefined for an unknown path', () => {
    expect(findNavItem('/unknown')).toBeUndefined();
  });
});
