import {
  describeAuditRecord,
  diffSnapshots,
  formatAuditValue,
} from '../../src/lib/audit-diff';
import type { AuditLog } from '../../src/types/audit-log';

const ID = '3f2b7c1e-8a4d-4e6f-9b1a-2c3d4e5f6a7b';
const MEDICINE_ID = '4a3c8d2f-9b5e-4f7a-8c2b-3d4e5f6a7b8c';
const TRANSACTION_ID = '5b4d9e3a-0c6f-4a8b-9d3c-4e5f6a7b8c9d';

function entry(overrides: Partial<AuditLog>): AuditLog {
  return {
    id: 'log-1',
    entityType: 'medicines',
    entityId: ID,
    action: 'created',
    changes: null,
    actor: null,
    createdAt: '2026-11-08T03:50:00.000Z',
    ...overrides,
  };
}

describe('diffSnapshots', () => {
  it('lists only the fields that changed', () => {
    expect(
      diffSnapshots(
        { name: 'Paracetamol', strength: '250 mg', updated_at: 'a' },
        { name: 'Paracetamol', strength: '500 mg', updated_at: 'b' },
      ),
    ).toEqual([
      { field: 'strength', before: '250 mg', after: '500 mg' },
      { field: 'updated_at', before: 'a', after: 'b' },
    ]);
  });

  it('hides updated_at when it is the only difference', () => {
    expect(
      diffSnapshots({ name: 'x', updated_at: 'a' }, { name: 'x', updated_at: 'b' }),
    ).toEqual([]);
  });

  it('compares nested values by content, not key order', () => {
    expect(diffSnapshots({ meta: { a: 1, b: [1, 2] } }, { meta: { b: [1, 2], a: 1 } })).toEqual(
      [],
    );
    expect(diffSnapshots({ meta: { a: 1 } }, { meta: { a: 2 } })).toEqual([
      { field: 'meta', before: { a: 1 }, after: { a: 2 } },
    ]);
  });

  it('treats a value becoming null as a change', () => {
    expect(diffSnapshots({ deleted_at: null }, { deleted_at: '2026-11-08' })).toEqual([
      { field: 'deleted_at', before: null, after: '2026-11-08' },
    ]);
    expect(diffSnapshots({ strength: '5 mg' }, { strength: null })).toEqual([
      { field: 'strength', before: '5 mg', after: null },
    ]);
  });

  it('lists every field when one side is missing', () => {
    expect(diffSnapshots(null, { name: 'x', unit: 'pc' })).toEqual([
      { field: 'name', before: null, after: 'x' },
      { field: 'unit', before: null, after: 'pc' },
    ]);
    expect(diffSnapshots({ name: 'x' }, null)).toEqual([
      { field: 'name', before: 'x', after: null },
    ]);
  });
});

describe('formatAuditValue', () => {
  it('keeps strings as text and shows other values as JSON', () => {
    expect(formatAuditValue('<script>alert(1)</script>')).toBe('<script>alert(1)</script>');
    expect(formatAuditValue(15)).toBe('15');
    expect(formatAuditValue(false)).toBe('false');
    expect(formatAuditValue({ a: 1 })).toBe('{"a":1}');
    expect(formatAuditValue(null)).toBe('null');
  });
});

describe('describeAuditRecord', () => {
  it('names a medicine and links to it', () => {
    expect(
      describeAuditRecord(
        entry({ changes: { before: null, after: { name: 'Paracetamol' } } }),
      ),
    ).toEqual({ label: 'Paracetamol', href: `/medicines/${ID}` });
  });

  it('names a batch by its number and links to its medicine', () => {
    expect(
      describeAuditRecord(
        entry({
          entityType: 'medicine_batches',
          action: 'updated',
          changes: {
            before: { batch_number: 'P778', medicine_id: MEDICINE_ID, quantity: 35 },
            after: { batch_number: 'P778', medicine_id: MEDICINE_ID, quantity: 15 },
          },
        }),
      ),
    ).toEqual({ label: 'P778', href: `/medicines/${MEDICINE_ID}` });
  });

  it('describes a transaction by reason and signed quantity', () => {
    const out = describeAuditRecord(
      entry({
        entityType: 'inventory_transactions',
        changes: { before: null, after: { reason: 'DISPENSED', direction: 'OUT', quantity: 20 } },
      }),
    );
    expect(out).toEqual({ label: 'Dispensed −20', href: `/inventory/transactions/${ID}` });

    const received = describeAuditRecord(
      entry({
        entityType: 'inventory_transactions',
        changes: { before: null, after: { reason: 'RECEIVED', direction: 'IN', quantity: 100 } },
      }),
    );
    expect(received.label).toBe('Received +100');
  });

  it('links a transaction entry to its transaction', () => {
    expect(
      describeAuditRecord(
        entry({
          entityType: 'inventory_entries',
          changes: { before: null, after: { transaction_id: TRANSACTION_ID, quantity: 5 } },
        }),
      ),
    ).toEqual({ label: 'Qty 5', href: `/inventory/transactions/${TRANSACTION_ID}` });
  });

  it('uses the before snapshot for a delete', () => {
    expect(
      describeAuditRecord(
        entry({
          entityType: 'medicine_batches',
          action: 'deleted',
          changes: { before: { batch_number: 'Q120', medicine_id: MEDICINE_ID }, after: null },
        }),
      ),
    ).toEqual({ label: 'Q120', href: `/medicines/${MEDICINE_ID}` });
  });

  it('falls back to the short ID without a snapshot', () => {
    expect(describeAuditRecord(entry({ changes: null }))).toEqual({
      label: '3f2b7c1e',
      href: `/medicines/${ID}`,
    });
    expect(
      describeAuditRecord(entry({ entityType: 'inventory_entries', changes: null })),
    ).toEqual({ label: '3f2b7c1e', href: null });
  });
});
