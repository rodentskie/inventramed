import type { MedicineBatch, MedicineDetail } from '../../../src/types/medicine';

export const MEDICINE_ID = '3f2b7c1e-8a4d-4e6f-9b1a-2c3d4e5f6a7b';
const AT = '2026-10-01T02:00:00.000Z';

export function batch(overrides: Partial<MedicineBatch> = {}): MedicineBatch {
  return {
    id: 'batch-1',
    medicineId: MEDICINE_ID,
    batchNumber: 'P778',
    barcode: 'BAT-91XZ4KD0Q7M2',
    expirationDate: '2026-11-12',
    quantity: 150,
    status: 'NEAR_EXPIRY',
    daysToExpiry: 4,
    receivedAt: AT,
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

export function medicine(overrides: Partial<MedicineDetail> = {}): MedicineDetail {
  return {
    id: MEDICINE_ID,
    name: 'Paracetamol',
    genericName: 'paracetamol',
    strength: '500 mg',
    dosageForm: 'tablet',
    unit: 'pc',
    barcode: 'MED-7Q2K0000AAAA',
    productBarcode: '4800123456789',
    totalStock: 150,
    createdAt: AT,
    updatedAt: AT,
    batches: [batch()],
    ...overrides,
  };
}
