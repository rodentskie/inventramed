import { EMPLOYEE_PERMISSIONS, hasAllPermissions } from '@/lib/permissions';
import type { NavGroup, NavItem } from '@/types/dashboard';

/** Items with `enabled: false` are screens from later features. */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: null,
    items: [
      { label: 'Dashboard', href: '/', icon: 'dashboard', permissions: [], enabled: true },
      { label: 'Notifications', href: '/notifications', icon: 'notifications', permissions: ['notification:read'], enabled: true },
    ],
  },
  {
    label: 'Inventory',
    items: [
      { label: 'Medicines', href: '/medicines', icon: 'medicines', permissions: ['medicine:read'], enabled: true },
      { label: 'Transactions', href: '/inventory/transactions', icon: 'transactions', permissions: ['inventory:read'], enabled: false },
      { label: 'Scan', href: '/scan', icon: 'scan', permissions: ['medicine:read'], enabled: true },
    ],
  },
  {
    label: 'People',
    items: [
      { label: 'Employees', href: '/employees', icon: 'employees', permissions: [...EMPLOYEE_PERMISSIONS], enabled: true },
    ],
  },
  {
    label: 'System',
    items: [
      { label: 'Settings', href: '/settings', icon: 'settings', permissions: ['settings:manage'], enabled: true },
      { label: 'Audit logs', href: '/audit-logs', icon: 'audit-logs', permissions: ['audit:read'], enabled: false },
    ],
  },
];

/** Drops the items the user can't see, then any group left empty. */
export function getVisibleNav(permissions: readonly string[]): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => hasAllPermissions(permissions, item.permissions)),
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
