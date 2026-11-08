import type { InventoryDirection, InventoryReason } from '@/types/inventory';
import type { BatchExpiryStatus } from '@/types/medicine';
import type { Permission } from '@/lib/permissions';

export interface DashboardOverview {
  medicineCount: number;
  unitsInStock: number;
  nearExpiryBatches: number;
  expiredBatches: number;
  threshold: number;
}

export interface AttentionBatch {
  id: string;
  medicineName: string;
  strength: string | null;
  unit: string;
  batchNumber: string;
  expirationDate: string;
  quantity: number;
  status: BatchExpiryStatus;
  daysToExpiry: number;
}

export interface AttentionList {
  items: AttentionBatch[];
  total: number;
  threshold: number;
}

export interface ActivityItem {
  id: string;
  direction: InventoryDirection;
  reason: InventoryReason;
  quantity: number;
  unit: string;
  medicineName: string;
  strength: string | null;
  performedBy: string;
  createdAt: string;
  /** `createdAt` in `settings.timezone`, for the tooltip. */
  exactTime: string;
}

export interface WorkerStatus {
  smsEnabled: boolean;
  lastSeenAt: string | null;
  online: boolean;
}

export type NavIcon =
  | 'dashboard'
  | 'medicines'
  | 'transactions'
  | 'scan'
  | 'employees'
  | 'users'
  | 'settings'
  | 'audit-logs';

export interface NavItem {
  label: string;
  href: string;
  icon: NavIcon;
  permission: Permission | null;
  enabled: boolean;
}

export interface NavGroup {
  label: string | null;
  items: NavItem[];
}
