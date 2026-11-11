/** @jest-environment node */
import { NextRequest } from 'next/server';
import { GET as getTransactionRoute } from '../../../src/app/api/inventory/transactions/[id]/route';
import { GET as listTransactionsRoute } from '../../../src/app/api/inventory/transactions/route';
import { POST as movementRoute } from '../../../src/app/api/medicines/[id]/batches/[batchId]/movements/route';
import { POST as dispenseRoute } from '../../../src/app/api/medicines/[id]/dispense/route';
import { POST as disposalRoute } from '../../../src/app/api/medicines/[id]/expired-disposal/route';
import { ApiError } from '../../../src/lib/api-response';
import { requirePermission } from '../../../src/lib/auth';
import * as inventory from '../../../src/lib/inventory';

jest.mock('@/lib/auth', () => ({ requirePermission: jest.fn() }));
jest.mock('@/lib/inventory', () => ({
  dispense: jest.fn(),
  recordBatchMovement: jest.fn(),
  disposeExpiredStock: jest.fn(),
  listTransactions: jest.fn(),
  getTransaction: jest.fn(),
}));

const permissionMock = requirePermission as jest.Mock;
const mocked = inventory as jest.Mocked<typeof inventory>;

const ID = '3f2b7c1e-8a4d-4e6f-9b1a-2c3d4e5f6a7b';
const BATCH_ID = '4a3c8d2f-9b5e-4f7a-8c2b-3d4e5f6a7b8c';
const URL_BASE = 'http://localhost/api';

const medicineCtx = (id = ID) => ({ params: Promise.resolve({ id }) });
const batchCtx = (id = ID, batchId = BATCH_ID) => ({
  params: Promise.resolve({ id, batchId }),
});

const post = (body: unknown) =>
  new NextRequest(URL_BASE, { method: 'POST', body: JSON.stringify(body) });
const postRaw = (body: string) =>
  new NextRequest(URL_BASE, { method: 'POST', body });

const lostBody = { reason: 'LOST', quantity: 1, notes: 'Missing' };

const routes: [string, string, () => Promise<Response>][] = [
  [
    'POST dispense',
    'inventory:write',
    () => dispenseRoute(post({ quantity: 1 }), medicineCtx()),
  ],
  [
    'POST movement',
    'inventory:write',
    () => movementRoute(post(lostBody), batchCtx()),
  ],
  [
    'POST expired disposal',
    'inventory:write',
    () => disposalRoute(post({}), medicineCtx()),
  ],
  [
    'GET transactions',
    'inventory:read',
    () => listTransactionsRoute(new NextRequest(`${URL_BASE}/x`)),
  ],
  [
    'GET transaction',
    'inventory:read',
    () => getTransactionRoute(new NextRequest(`${URL_BASE}/x`), medicineCtx()),
  ],
];

describe('inventory routes', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    permissionMock.mockResolvedValue({ id: 'user-1' });
  });

  describe.each(routes)('%s', (_name, permission, call) => {
    it('checks the required permission', async () => {
      await call();

      expect(permissionMock).toHaveBeenCalledWith(permission);
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

    it('returns 403 and calls no data functions without permission', async () => {
      permissionMock.mockRejectedValue(
        new ApiError(403, 'FORBIDDEN', 'No permission.'),
      );

      expect((await call()).status).toBe(403);
      [
        mocked.dispense,
        mocked.recordBatchMovement,
        mocked.disposeExpiredStock,
        mocked.listTransactions,
        mocked.getTransaction,
      ].forEach((fn) => {
        expect(fn).not.toHaveBeenCalled();
      });
    });
  });

  describe('invalid input', () => {
    it.each<[string, () => Promise<Response>]>([
      ['dispense', () => dispenseRoute(post({ quantity: 1 }), medicineCtx('bad'))],
      ['movement medicine', () => movementRoute(post(lostBody), batchCtx('bad'))],
      ['movement batch', () => movementRoute(post(lostBody), batchCtx(ID, 'bad'))],
      ['disposal', () => disposalRoute(post({}), medicineCtx('bad'))],
      [
        'transaction',
        () =>
          getTransactionRoute(new NextRequest(`${URL_BASE}/x`), medicineCtx('bad')),
      ],
    ])('returns 400 for an invalid ID on %s', async (_name, call) => {
      const response = await call();

      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe('VALIDATION_ERROR');
    });

    it.each<[string, () => Promise<Response>]>([
      ['dispense', () => dispenseRoute(postRaw('{oops'), medicineCtx())],
      ['movement', () => movementRoute(postRaw('{oops'), batchCtx())],
      ['disposal', () => disposalRoute(postRaw('{oops'), medicineCtx())],
    ])('returns 400 for invalid JSON on %s', async (_name, call) => {
      const response = await call();

      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe('INVALID_JSON');
    });

    it.each(['RECEIVED', 'DISPENSED', 'EXPIRED_DISPOSAL'])(
      'returns 400 naming the reason field for %s',
      async (reason) => {
        const response = await movementRoute(
          post({ reason, quantity: 1, notes: 'x' }),
          batchCtx(),
        );

        expect(response.status).toBe(400);
        const { error } = await response.json();
        expect(error.code).toBe('VALIDATION_ERROR');
        expect(error.fields.reason).toBeDefined();
        expect(mocked.recordBatchMovement).not.toHaveBeenCalled();
      },
    );

    it('names missing notes and unknown fields in the errors', async () => {
      const response = await movementRoute(
        post({ reason: 'LOST', quantity: 1, extra: true }),
        batchCtx(),
      );

      const { error } = await response.json();
      expect(response.status).toBe(400);
      expect(error.fields.notes).toBeDefined();
      expect(error.fields.extra).toBeDefined();
    });

    it('returns 400 for an invalid list query', async () => {
      const response = await listTransactionsRoute(
        new NextRequest(`${URL_BASE}/x?reason=NOPE`),
      );

      expect(response.status).toBe(400);
      expect((await response.json()).error.fields.reason).toBeDefined();
    });
  });

  describe('responses', () => {
    const transaction = { id: 'transaction-1' } as never;
    const batch = { id: BATCH_ID } as never;

    it('returns 201 for a dispense', async () => {
      mocked.dispense.mockResolvedValue(transaction);

      const response = await dispenseRoute(
        post({ quantity: 25, notes: 'Ward 3' }),
        medicineCtx(),
      );

      expect(response.status).toBe(201);
      await expect(response.json()).resolves.toEqual({
        success: true,
        data: transaction,
      });
      expect(mocked.dispense).toHaveBeenCalledWith('user-1', ID, {
        quantity: 25,
        notes: 'Ward 3',
      });
    });

    it('returns 201 when a movement is recorded', async () => {
      mocked.recordBatchMovement.mockResolvedValue({ transaction, batch });

      const response = await movementRoute(post(lostBody), batchCtx());

      expect(response.status).toBe(201);
      await expect(response.json()).resolves.toEqual({
        success: true,
        data: { transaction, batch },
      });
      expect(mocked.recordBatchMovement).toHaveBeenCalledWith(
        'user-1',
        ID,
        BATCH_ID,
        lostBody,
      );
    });

    it('returns 200 with a null transaction when a count matches', async () => {
      mocked.recordBatchMovement.mockResolvedValue({ transaction: null, batch });

      const response = await movementRoute(
        post({ reason: 'COUNT_ADJUSTMENT', countedQuantity: 5, notes: 'x' }),
        batchCtx(),
      );

      expect(response.status).toBe(200);
      expect((await response.json()).data.transaction).toBeNull();
    });

    it('returns 201 for a disposal', async () => {
      mocked.disposeExpiredStock.mockResolvedValue(transaction);

      const response = await disposalRoute(
        post({ batchIds: [BATCH_ID] }),
        medicineCtx(),
      );

      expect(response.status).toBe(201);
      expect(mocked.disposeExpiredStock).toHaveBeenCalledWith('user-1', ID, {
        batchIds: [BATCH_ID],
      });
    });

    it('returns the list with defaults applied', async () => {
      const list = { items: [], total: 0, page: 1, pageSize: 20 };
      mocked.listTransactions.mockResolvedValue(list);

      const response = await listTransactionsRoute(
        new NextRequest(`${URL_BASE}/x?direction=OUT`),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        success: true,
        data: list,
      });
      expect(mocked.listTransactions).toHaveBeenCalledWith({
        direction: 'OUT',
        page: 1,
        pageSize: 20,
      });
    });

    it('returns one transaction with its medicine', async () => {
      const detail = {
        id: 'transaction-1',
        medicine: { id: ID, name: 'Paracetamol', strength: '500 mg', unit: 'pc', deleted: true },
      } as never;
      mocked.getTransaction.mockResolvedValue(detail);

      const response = await getTransactionRoute(
        new NextRequest(`${URL_BASE}/x`),
        medicineCtx(),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ success: true, data: detail });
      expect(mocked.getTransaction).toHaveBeenCalledWith(ID);
    });

    it.each<[string, number, ApiError['code']]>([
      ['dispense', 409, 'INSUFFICIENT_STOCK'],
      ['dispense', 404, 'NOT_FOUND'],
    ])('passes API errors through on %s (%i)', async (_name, status, code) => {
      mocked.dispense.mockRejectedValue(
        new ApiError(status, code, 'x', { quantity: ['Only 2 available.'] }),
      );

      const response = await dispenseRoute(post({ quantity: 3 }), medicineCtx());

      expect(response.status).toBe(status);
      expect((await response.json()).error).toMatchObject({
        code,
        fields: { quantity: ['Only 2 available.'] },
      });
    });

    it('passes disposal conflicts through', async () => {
      mocked.disposeExpiredStock.mockRejectedValue(
        new ApiError(409, 'NO_EXPIRED_STOCK', 'x'),
      );

      const response = await disposalRoute(post({}), medicineCtx());

      expect(response.status).toBe(409);
      expect((await response.json()).error.code).toBe('NO_EXPIRED_STOCK');
    });

    it('hides unexpected errors behind a generic 500', async () => {
      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      mocked.dispense.mockRejectedValue(new Error('secret database detail'));

      const response = await dispenseRoute(post({ quantity: 1 }), medicineCtx());
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(JSON.stringify(body)).not.toContain('secret');
      errorSpy.mockRestore();
    });
  });
});
