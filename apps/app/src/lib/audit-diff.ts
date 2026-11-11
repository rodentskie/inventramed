import { formatCount, REASON_LABELS } from '@/lib/format';
import type { AuditLog } from '@/types/audit-log';
import type { InventoryReason } from '@/types/inventory';

export interface FieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

export interface AuditRecord {
  label: string;
  /** Null when the snapshot doesn't say where the record lives. */
  href: string | null;
}

export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  medicines: 'Medicine',
  medicine_batches: 'Batch',
  inventory_transactions: 'Transaction',
  inventory_entries: 'Transaction entry',
};

/** Prisma maintains it on every write, so on its own it isn't a change worth showing. */
const UPDATED_AT = 'updated_at';
const SHORT_ID_LENGTH = 8;

type Snapshot = Record<string, unknown>;

function isSnapshot(value: unknown): value is Snapshot {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Like JSON.stringify, but with object keys sorted, so key order never counts as a change. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (isSnapshot(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

/**
 * The fields whose values differ between two row snapshots, in the row's column order.
 * A missing snapshot counts as empty, so every field of the other one is listed.
 */
export function diffSnapshots(before: unknown, after: unknown): FieldChange[] {
  const old = isSnapshot(before) ? before : {};
  const next = isSnapshot(after) ? after : {};
  const fields = [...new Set([...Object.keys(old), ...Object.keys(next)])];

  const changes = fields
    .filter((field) => stableStringify(old[field]) !== stableStringify(next[field]))
    .map((field) => ({ field, before: old[field] ?? null, after: next[field] ?? null }));

  if (changes.length === 1 && changes[0].field === UPDATED_AT) {
    return [];
  }
  return changes;
}

/** A snapshot value as display text. Strings stay as they are; everything else is JSON. */
export function formatAuditValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function readText(snapshot: Snapshot, field: string): string | null {
  const value = snapshot[field];
  if (typeof value === 'string') {
    return value;
  }
  return typeof value === 'number' ? String(value) : null;
}

function describeTransaction(snapshot: Snapshot): string | null {
  const reason = readText(snapshot, 'reason');
  const quantity = snapshot.quantity;
  if (!reason || typeof quantity !== 'number') {
    return null;
  }
  const label = REASON_LABELS[reason as InventoryReason] ?? reason;
  const sign = snapshot.direction === 'IN' ? '+' : '−';
  return `${label} ${sign}${formatCount(quantity)}`;
}

function describeEntry(snapshot: Snapshot): string | null {
  const quantity = snapshot.quantity;
  return typeof quantity === 'number' ? `Qty ${formatCount(quantity)}` : null;
}

function linkFor(entry: AuditLog, snapshot: Snapshot): string | null {
  switch (entry.entityType) {
    case 'medicines':
      return `/medicines/${entry.entityId}`;
    case 'medicine_batches': {
      const medicineId = readText(snapshot, 'medicine_id');
      return medicineId ? `/medicines/${medicineId}` : null;
    }
    case 'inventory_transactions':
      return `/inventory/transactions/${entry.entityId}`;
    case 'inventory_entries': {
      const transactionId = readText(snapshot, 'transaction_id');
      return transactionId ? `/inventory/transactions/${transactionId}` : null;
    }
    default:
      return null;
  }
}

function labelFor(entityType: string, snapshot: Snapshot): string | null {
  switch (entityType) {
    case 'medicines':
      return readText(snapshot, 'name');
    case 'medicine_batches':
      return readText(snapshot, 'batch_number');
    case 'inventory_transactions':
      return describeTransaction(snapshot);
    case 'inventory_entries':
      return describeEntry(snapshot);
    default:
      return null;
  }
}

/**
 * A short label and link for the audited row, from its `after` snapshot, or `before`
 * for a delete. Falls back to the start of the ID when the snapshot is missing.
 */
export function describeAuditRecord(entry: AuditLog): AuditRecord {
  const { before, after } = entry.changes ?? {};
  const snapshot = isSnapshot(after) ? after : isSnapshot(before) ? before : {};
  return {
    label: labelFor(entry.entityType, snapshot) ?? entry.entityId.slice(0, SHORT_ID_LENGTH),
    href: linkFor(entry, snapshot),
  };
}
