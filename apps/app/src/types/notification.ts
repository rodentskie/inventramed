export type NotificationItemStatus = 'NEAR_EXPIRY' | 'EXPIRED';

export interface NotificationSummary {
  id: string;
  notificationDate: string;
  expiredCount: number;
  nearExpiryCount: number;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationList {
  items: NotificationSummary[];
  total: number;
  unreadCount: number;
  page: number;
  pageSize: number;
}

export interface NotificationItem {
  id: string;
  batchId: string;
  medicineId: string;
  medicineName: string;
  strength: string | null;
  batchNumber: string;
  status: NotificationItemStatus;
  quantity: number;
  expirationDate: string;
  daysToExpiry: number;
}

export interface NotificationDetail extends NotificationSummary {
  items: NotificationItem[];
}

export interface NotificationReadResult {
  id: string;
  readAt: string;
}
