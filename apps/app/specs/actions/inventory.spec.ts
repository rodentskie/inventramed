/** @jest-environment node */
import { revalidatePath } from 'next/cache';
import {
  dispenseAction,
  disposeExpiredAction,
  recordMovementAction,
} from '../../src/actions/inventory';
import { ApiError } from '../../src/lib/api-response';
import { requirePermission } from '../../src/lib/auth';
import * as inventory from '../../src/lib/inventory';

jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('@/lib/auth', () => ({ requirePermission: jest.fn() }));
jest.mock('@/lib/inventory', () => ({
  dispense: jest.fn(),
  recordBatchMovement: jest.fn(),
  disposeExpiredStock: jest.fn(),
}));

const permissionMock = requirePermission as jest.Mock;
const revalidateMock = revalidatePath as jest.Mock;
const lib = inventory as jest.Mocked<typeof inventory>;

const ID = '3f2b7c1e-8a4d-4e6f-9b1a-2c3d4e5f6a7b';
const BATCH_ID = '4a3c8d2f-9b5e-4f7a-8c2b-3d4e5f6a7b8c';

const cases = [
  {
    name: 'dispenseAction',
    run: () => dispenseAction(ID, { quantity: 5, notes: '' }),
    invalid: () => dispenseAction(ID, { quantity: 0 }),
    lib: () => lib.dispense,
    libArgs: ['user-1', ID, { quantity: 5, notes: null }],
  },
  {
    name: 'recordMovementAction',
    run: () => recordMovementAction(ID, BATCH_ID, { reason: 'LOST', quantity: 2, notes: 'Missing' }),
    invalid: () => recordMovementAction(ID, BATCH_ID, { reason: 'LOST', quantity: 2, notes: '' }),
    lib: () => lib.recordBatchMovement,
    libArgs: ['user-1', ID, BATCH_ID, { reason: 'LOST', quantity: 2, notes: 'Missing' }],
  },
  {
    name: 'disposeExpiredAction',
    run: () => disposeExpiredAction(ID, { batchIds: [BATCH_ID] }),
    invalid: () => disposeExpiredAction(ID, { batchIds: [] }),
    lib: () => lib.disposeExpiredStock,
    libArgs: ['user-1', ID, { batchIds: [BATCH_ID] }],
  },
];

beforeEach(() => {
  jest.resetAllMocks();
  permissionMock.mockResolvedValue({ id: 'user-1' });
});

describe.each(cases)('$name', ({ run, invalid, lib: getLib, libArgs }) => {
  it('checks inventory:write, calls the lib and revalidates', async () => {
    getLib().mockResolvedValue({ id: 'tx-1' } as never);

    const result = await run();

    expect(result).toEqual({ success: true, data: { id: 'tx-1' } });
    expect(permissionMock).toHaveBeenCalledWith('inventory:write');
    expect(getLib()).toHaveBeenCalledWith(...libArgs);
    expect(revalidateMock.mock.calls.map(([path]) => path)).toEqual([
      '/medicines',
      `/medicines/${ID}`,
      '/',
      '/scan',
    ]);
  });

  it('stops before the lib without the permission', async () => {
    permissionMock.mockRejectedValue(
      new ApiError(403, 'FORBIDDEN', 'You do not have permission to do this.'),
    );

    const result = await run();

    expect(result).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
    expect(getLib()).not.toHaveBeenCalled();
    expect(revalidateMock).not.toHaveBeenCalled();
  });

  it('rejects invalid input before the lib', async () => {
    const result = await invalid();

    expect(result).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
    expect(getLib()).not.toHaveBeenCalled();
  });
});

it('passes the INSUFFICIENT_STOCK fields through', async () => {
  lib.dispense.mockRejectedValue(
    new ApiError(409, 'INSUFFICIENT_STOCK', 'There is not enough stock for this movement.', {
      quantity: ['Only 3 available.'],
    }),
  );

  const result = await dispenseAction(ID, { quantity: 5 });

  expect(result).toMatchObject({
    success: false,
    error: { code: 'INSUFFICIENT_STOCK', fields: { quantity: ['Only 3 available.'] } },
  });
  expect(revalidateMock).not.toHaveBeenCalled();
});
