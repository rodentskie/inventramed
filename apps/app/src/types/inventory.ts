import type { MedicineBatch } from '@/types/medicine';

export type InventoryDirection = 'IN' | 'OUT';

export type InventoryReason =
  | 'RECEIVED'
  | 'DISPENSED'
  | 'COUNT_ADJUSTMENT'
  | 'RETURNED'
  | 'DAMAGED'
  | 'LOST'
  | 'EXPIRED_DISPOSAL';

export interface InventoryEntry {
  id: string;
  batchId: string;
  batchNumber: string;
  expirationDate: string;
  quantity: number;
}

export interface InventoryTransaction {
  id: string;
  medicineId: string;
  direction: InventoryDirection;
  reason: InventoryReason;
  quantity: number;
  notes: string | null;
  performedBy: { id: string; username: string };
  createdAt: string;
  entries: InventoryEntry[];
}

export interface InventoryTransactionList {
  items: InventoryTransaction[];
  total: number;
  page: number;
  pageSize: number;
}

export interface BatchMovementResult {
  /** Null when a count matched the batch, so there was nothing to record. */
  transaction: InventoryTransaction | null;
  batch: MedicineBatch;
}
