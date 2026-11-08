import { hasPermission } from '@/lib/permissions';
import type { NavGroup, NavItem } from '@/types/dashboard';

/** Items with `enabled: false` are screens from later features. */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: null,
    items: [
      { label: 'Dashboard', href: '/', icon: 'dashboard', permission: null, enabled: true },
    ],
  },
  {
    label: 'Inventory',
    items: [
      { label: 'Medicines', href: '/medicines', icon: 'medicines', permission: 'medicine:read', enabled: false },
      { label: 'Transactions', href: '/inventory/transactions', icon: 'transactions', permission: 'inventory:read', enabled: false },
      { label: 'Scan', href: '/scan', icon: 'scan', permission: 'medicine:read', enabled: false },
    ],
  },
  {
    label: 'People',
    items: [
      { label: 'Employees', href: '/employees', icon: 'employees', permission: 'employee:manage', enabled: false },
      { label: 'Users & roles', href: '/users', icon: 'users', permission: 'user:manage', enabled: false },
    ],
  },
  {
    label: 'System',
    items: [
      { label: 'Settings', href: '/settings', icon: 'settings', permission: 'settings:manage', enabled: false },
      { label: 'Audit logs', href: '/audit-logs', icon: 'audit-logs', permission: 'audit:read', enabled: false },
    ],
  },
];

/** Drops the items the user can't see, then any group left empty. */
export function getVisibleNav(permissions: readonly string[]): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => !item.permission || hasPermission(permissions, item.permission),
    ),
  })).filter((group) => group.items.length > 0);
}

/** `/` only matches itself; other items also match their child routes. */
export function isNavItemActive(href: string, pathname: string): boolean {
  if (href === '/') {
    return pathname === '/';
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The nav item for the path, used for the header's page title. */
export function findNavItem(pathname: string): NavItem | undefined {
  return NAV_GROUPS.flatMap((group) => group.items).find((item) =>
    isNavItemActive(item.href, pathname),
  );
}
