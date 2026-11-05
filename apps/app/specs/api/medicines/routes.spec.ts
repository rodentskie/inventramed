/** @jest-environment node */
import { NextRequest } from 'next/server';
import { ApiError } from '../../../src/lib/api-response';
import { requirePermission } from '../../../src/lib/auth';
import * as medicines from '../../../src/lib/medicines';
import {
  POST as receiveStockRoute,
} from '../../../src/app/api/medicines/[id]/batches/route';
import {
  GET as getBatchRoute,
  PATCH as patchBatchRoute,
} from '../../../src/app/api/medicines/[id]/batches/[batchId]/route';
import {
  DELETE as deleteMedicineRoute,
  GET as getMedicineRoute,
  PATCH as patchMedicineRoute,
} from '../../../src/app/api/medicines/[id]/route';
import {
  GET as listMedicinesRoute,
  POST as createMedicineRoute,
} from '../../../src/app/api/medicines/route';

jest.mock('@/lib/auth', () => ({ requirePermission: jest.fn() }));
jest.mock('@/lib/medicines', () => ({
  listMedicines: jest.fn(),
  createMedicine: jest.fn(),
  getMedicine: jest.fn(),
  updateMedicine: jest.fn(),
  softDeleteMedicine: jest.fn(),
  receiveStock: jest.fn(),
  getBatch: jest.fn(),
  updateBatch: jest.fn(),
}));

const permissionMock = requirePermission as jest.Mock;
const mocked = medicines as jest.Mocked<typeof medicines>;

const ID = '3f2b7c1e-8a4d-4e6f-9b1a-2c3d4e5f6a7b';
const BATCH_ID = '4a3c8d2f-9b5e-4f7a-8c2b-3d4e5f6a7b8c';
const URL_BASE = 'http://localhost/api/medicines';

const medicineCtx = (id = ID) => ({ params: Promise.resolve({ id }) });
const batchCtx = (id = ID, batchId = BATCH_ID) => ({
  params: Promise.resolve({ id, batchId }),
});

function jsonRequest(method: string, body: unknown): NextRequest {
  return new NextRequest(URL_BASE, { method, body: JSON.stringify(body) });
}

function rawRequest(method: string, body: string): NextRequest {
  return new NextRequest(URL_BASE, { method, body });
}

const receiveBody = {
  batchNumber: 'A123',
  expirationDate: '2027-06-30',
  quantity: 10,
};

// Every route, called with a valid request.
const routes: [string, string[], () => Promise<Response>][] = [
  [
    'GET list',
    ['medicine:read'],
    () => listMedicinesRoute(new NextRequest(URL_BASE)),
  ],
  [
    'POST medicine',
    ['medicine:write'],
    () => createMedicineRoute(jsonRequest('POST', { name: 'x' })),
  ],
  [
    'GET medicine',
    ['medicine:read'],
    () => getMedicineRoute(new NextRequest(URL_BASE), medicineCtx()),
  ],
  [
    'PATCH medicine',
    ['medicine:write'],
    () => patchMedicineRoute(jsonRequest('PATCH', { name: 'x' }), medicineCtx()),
  ],
  [
    'DELETE medicine',
    ['medicine:write'],
    () => deleteMedicineRoute(new NextRequest(URL_BASE), medicineCtx()),
  ],
  [
    'POST batch',
    ['medicine:write', 'inventory:write'],
    () => receiveStockRoute(jsonRequest('POST', receiveBody), medicineCtx()),
  ],
  [
    'GET batch',
    ['medicine:read'],
    () => getBatchRoute(new NextRequest(URL_BASE), batchCtx()),
  ],
  [
    'PATCH batch',
    ['medicine:write'],
    () => patchBatchRoute(jsonRequest('PATCH', { batchNumber: 'B' }), batchCtx()),
  ],
];

describe('medicine routes', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    permissionMock.mockResolvedValue({ id: 'user-1' });
  });

  describe.each(routes)('%s', (_name, permissions, call) => {
    it('checks the required permissions', async () => {
      await call();

      expect(permissionMock).toHaveBeenCalledWith(...permissions);
    });

    it('returns 401 without a session', async () => {
      permissionMock.mockRejectedValue(
        new ApiError(401, 'UNAUTHENTICATED', 'You must be logged in.'),
      );

      const response = await call();

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({
        success: false,
        error: { code: 'UNAUTHENTICATED', message: 'You must be logged in.' },
      });
    });

    it('returns 403 without permission', async () => {
      permissionMock.mockRejectedValue(
        new ApiError(403, 'FORBIDDEN', 'No permission.'),
      );

      expect((await call()).status).toBe(403);
    });

    it('calls no data functions when access is denied', async () => {
      permissionMock.mockRejectedValue(
        new ApiError(403, 'FORBIDDEN', 'No permission.'),
      );

      await call();

      [
        mocked.listMedicines,
        mocked.createMedicine,
        mocked.getMedicine,
        mocked.updateMedicine,
        mocked.softDeleteMedicine,
        mocked.receiveStock,
        mocked.getBatch,
        mocked.updateBatch,
      ].forEach((fn) => {
        expect(fn).not.toHaveBeenCalled();
      });
    });
  });

  describe('invalid input', () => {
    it.each<[string, () => Promise<Response>]>([
      [
        'medicine GET',
        () => getMedicineRoute(new NextRequest(URL_BASE), medicineCtx('bad')),
      ],
      [
        'medicine DELETE',
        () => deleteMedicineRoute(new NextRequest(URL_BASE), medicineCtx('bad')),
      ],
      [
        'batch GET with a bad batch ID',
        () => getBatchRoute(new NextRequest(URL_BASE), batchCtx(ID, 'bad')),
      ],
    ])('returns 400 for an invalid ID on %s', async (_name, call) => {
      const response = await call();

      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for invalid JSON', async () => {
      const response = await createMedicineRoute(rawRequest('POST', '{oops'));

      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe('INVALID_JSON');
    });

    it('returns field errors for invalid values', async () => {
      const response = await createMedicineRoute(
        jsonRequest('POST', { name: '' }),
      );

      expect(response.status).toBe(400);
      const { error } = await response.json();
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.fields.name).toHaveLength(1);
    });

    it('names unknown fields in the errors', async () => {
      const response = await patchBatchRoute(
        jsonRequest('PATCH', { batchNumber: 'B', quantity: 5 }),
        batchCtx(),
      );

      expect(response.status).toBe(400);
      expect((await response.json()).error.fields.quantity).toBeDefined();
      expect(mocked.updateBatch).not.toHaveBeenCalled();
    });

    it('returns 400 for an invalid list query', async () => {
      const response = await listMedicinesRoute(
        new NextRequest(`${URL_BASE}?pageSize=500`),
      );

      expect(response.status).toBe(400);
    });
  });

  describe('responses', () => {
    it('returns 201 when creating a medicine', async () => {
      const medicine = { id: ID, name: 'x' } as never;
      mocked.createMedicine.mockResolvedValue(medicine);

      const response = await createMedicineRoute(
        jsonRequest('POST', { name: 'x' }),
      );

      expect(response.status).toBe(201);
      await expect(response.json()).resolves.toEqual({
        success: true,
        data: medicine,
      });
      expect(mocked.createMedicine).toHaveBeenCalledWith('user-1', {
        name: 'x',
        unit: 'pc',
      });
    });

    it('returns 201 for a new batch', async () => {
      mocked.receiveStock.mockResolvedValue({
        batch: { id: BATCH_ID } as never,
        created: true,
      });

      const response = await receiveStockRoute(
        jsonRequest('POST', receiveBody),
        medicineCtx(),
      );

      expect(response.status).toBe(201);
    });

    it('returns 200 when adding to an existing batch', async () => {
      mocked.receiveStock.mockResolvedValue({
        batch: { id: BATCH_ID } as never,
        created: false,
      });

      const response = await receiveStockRoute(
        jsonRequest('POST', receiveBody),
        medicineCtx(),
      );

      expect(response.status).toBe(200);
    });

    it('passes API errors through', async () => {
      mocked.softDeleteMedicine.mockRejectedValue(
        new ApiError(409, 'MEDICINE_HAS_STOCK', 'Has stock.'),
      );

      const response = await deleteMedicineRoute(
        new NextRequest(URL_BASE),
        medicineCtx(),
      );

      expect(response.status).toBe(409);
      expect((await response.json()).error.code).toBe('MEDICINE_HAS_STOCK');
    });

    it('hides unexpected errors behind a generic 500', async () => {
      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      mocked.getMedicine.mockRejectedValue(new Error('secret database detail'));

      const response = await getMedicineRoute(
        new NextRequest(URL_BASE),
        medicineCtx(),
      );
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.error.code).toBe('INTERNAL_ERROR');
      expect(JSON.stringify(body)).not.toContain('secret');
      errorSpy.mockRestore();
    });
  });
});
