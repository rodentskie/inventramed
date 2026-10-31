import { z } from 'zod';

export const PERMISSIONS = [
  'medicine:read',
  'medicine:write',
  'inventory:read',
  'inventory:write',
  'notification:read',
  'employee:manage',
  'user:manage',
  'settings:manage',
  'audit:read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

type Resource = Permission extends `${infer R}:${string}` ? R : never;

export type GrantablePermission = Permission | `${Resource}:*` | '*';

const RESOURCES = [
  ...new Set(PERMISSIONS.map((p) => p.split(':')[0])),
] as Resource[];

export const GRANTABLE_PERMISSIONS = [
  ...PERMISSIONS,
  ...RESOURCES.map((r) => `${r}:*` as const),
  '*',
] as GrantablePermission[];

export const permissionSchema = z.enum(
  GRANTABLE_PERMISSIONS as [GrantablePermission, ...GrantablePermission[]],
);

export function hasPermission(
  granted: readonly string[],
  required: Permission,
): boolean {
  const resource = required.split(':')[0];
  return granted.some(
    (g) => g === '*' || g === required || g === `${resource}:*`,
  );
}
