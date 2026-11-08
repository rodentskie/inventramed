export type BatchExpiryStatus = 'SAFE' | 'NEAR_EXPIRY' | 'EXPIRED';

export interface Medicine {
  id: string;
  name: string;
  genericName: string | null;
  strength: string | null;
  dosageForm: string | null;
  unit: string;
  barcode: string;
  productBarcode: string | null;
  totalStock: number;
  createdAt: string;
  updatedAt: string;
}

export interface MedicineBatch {
  id: string;
  medicineId: string;
  batchNumber: string;
  barcode: string;
  expirationDate: string;
  quantity: number;
  status: BatchExpiryStatus;
  daysToExpiry: number;
  receivedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface MedicineDetail extends Medicine {
  batches: MedicineBatch[];
}

export interface MedicineList {
  items: Medicine[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ReceiveStockResult {
  batch: MedicineBatch;
  created: boolean;
}

export interface BatchLabel {
  medicineName: string;
  strength: string | null;
  batchNumber: string;
  expirationDate: string;
  barcode: string;
}

/** What a scanned code resolved to. A batch result also carries its medicine. */
export type ScanResult =
  | { kind: 'medicine' | 'product'; medicine: MedicineDetail }
  | { kind: 'batch'; batchId: string; medicine: MedicineDetail };

/** What a movement form needs to name a medicine and count its stock. */
export type MovementMedicine = Pick<Medicine, 'id' | 'name' | 'strength' | 'unit'>;
