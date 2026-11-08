/** @jest-environment node */
import { revalidatePath } from 'next/cache';
import {
  createMedicineAction,
  deleteMedicineAction,
  receiveStockAction,
  updateBatchAction,
  updateMedicineAction,
} from '../../src/actions/medicines';
import { ApiError } from '../../src/lib/api-response';
import { requirePermission } from '../../src/lib/auth';
import * as medicines from '../../src/lib/medicines';

jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('@/lib/auth', () => ({ requirePermission: jest.fn() }));
jest.mock('@/lib/medicines', () => ({
  createMedicine: jest.fn(),
  updateMedicine: jest.fn(),
  softDeleteMedicine: jest.fn(),
  receiveStock: jest.fn(),
  updateBatch: jest.fn(),
}));

const permissionMock = requirePermission as jest.Mock;
const revalidateMock = revalidatePath as jest.Mock;
const lib = medicines as jest.Mocked<typeof medicines>;

const ID = '3f2b7c1e-8a4d-4e6f-9b1a-2c3d4e5f6a7b';
const BATCH_ID = '4a3c8d2f-9b5e-4f7a-8c2b-3d4e5f6a7b8c';
const forbidden = () => new ApiError(403, 'FORBIDDEN', 'You do not have permission to do this.');

beforeEach(() => {
  jest.resetAllMocks();
  permissionMock.mockResolvedValue({ id: 'user-1' });
});

/** Every action must check its permission and stop before calling the lib. */
const cases = [
  {
    name: 'createMedicineAction',
    permissions: ['medicine:write'],
    run: () => createMedicineAction({ name: 'Paracetamol', productBarcode: '4800123456789' }),
    invalid: () => createMedicineAction({ name: '' }),
    lib: () => lib.createMedicine,
    libArgs: ['user-1', { name: 'Paracetamol', unit: 'pc', productBarcode: '4800123456789' }],
    paths: ['/medicines'],
  },
  {
    name: 'updateMedicineAction',
    permissions: ['medicine:write'],
    run: () => updateMedicineAction(ID, { strength: '500 mg' }),
    invalid: () => updateMedicineAction(ID, {}),
    lib: () => lib.updateMedicine,
    libArgs: ['user-1', ID, { strength: '500 mg' }],
    paths: ['/medicines', `/medicines/${ID}`],
  },
  {
    name: 'deleteMedicineAction',
    permissions: ['medicine:write'],
    run: () => deleteMedicineAction(ID),
    invalid: () => deleteMedicineAction('not-a-uuid'),
    lib: () => lib.softDeleteMedicine,
    libArgs: ['user-1', ID],
    paths: ['/medicines', `/medicines/${ID}`],
  },
  {
    name: 'receiveStockAction',
    permissions: ['medicine:write', 'inventory:write'],
    run: () =>
      receiveStockAction(ID, { batchNumber: 'P778', expirationDate: '2027-01-31', quantity: 10 }),
    invalid: () => receiveStockAction(ID, { batchNumber: 'P778', quantity: 0 }),
    lib: () => lib.receiveStock,
    libArgs: ['user-1', ID, { batchNumber: 'P778', expirationDate: '2027-01-31', quantity: 10 }],
    paths: ['/medicines', `/medicines/${ID}`],
  },
  {
    name: 'updateBatchAction',
    permissions: ['medicine:write'],
    run: () => updateBatchAction(ID, BATCH_ID, { batchNumber: 'P779' }),
    invalid: () => updateBatchAction(ID, BATCH_ID, {}),
    lib: () => lib.updateBatch,
    libArgs: ['user-1', ID, BATCH_ID, { batchNumber: 'P779' }],
    paths: ['/medicines', `/medicines/${ID}`],
  },
];

describe.each(cases)('$name', ({ permissions, run, invalid, lib: libFn, libArgs, paths }) => {
  it('checks the permission, calls the lib and revalidates', async () => {
    libFn().mockResolvedValue({ ok: true } as never);

    await expect(run()).resolves.toEqual({ success: true, data: { ok: true } });
    expect(permissionMock).toHaveBeenCalledWith(...permissions);
    expect(libFn()).toHaveBeenCalledWith(...libArgs);
    expect(revalidateMock.mock.calls.map(([path]) => path)).toEqual(paths);
  });

  it('returns FORBIDDEN without calling the lib', async () => {
    permissionMock.mockRejectedValue(forbidden());

    await expect(run()).resolves.toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
    expect(libFn()).not.toHaveBeenCalled();
    expect(revalidateMock).not.toHaveBeenCalled();
  });

  it('returns VALIDATION_ERROR with fields without calling the lib', async () => {
    const result = await invalid();

    expect(result).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
    expect(result.success === false && result.error.fields).toBeTruthy();
    expect(libFn()).not.toHaveBeenCalled();
  });

  it('passes lib errors through', async () => {
    libFn().mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'The requested resource was not found.'));

    await expect(run()).resolves.toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
    expect(revalidateMock).not.toHaveBeenCalled();
  });
});
