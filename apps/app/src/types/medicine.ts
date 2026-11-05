export type BatchExpiryStatus = 'SAFE' | 'NEAR_EXPIRY' | 'EXPIRED';

export interface Medicine {
  id: string;
  name: string;
  genericName: string | null;
  strength: string | null;
  dosageForm: string | null;
  unit: string;
  barcode: string;
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
