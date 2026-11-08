/** @jest-environment node */
import { lookupBarcodeAction } from '../../src/actions/scan';
import { ApiError, notFound } from '../../src/lib/api-response';
import { requirePermission } from '../../src/lib/auth';
import { findByBarcode } from '../../src/lib/medicines';

jest.mock('@/lib/auth', () => ({ requirePermission: jest.fn() }));
jest.mock('@/lib/medicines', () => ({ findByBarcode: jest.fn() }));

const permissionMock = requirePermission as jest.Mock;
const findMock = findByBarcode as jest.Mock;

beforeEach(() => {
  jest.resetAllMocks();
  permissionMock.mockResolvedValue({ id: 'user-1' });
});

describe('lookupBarcodeAction', () => {
  it('requires medicine:read and looks up the normalized code', async () => {
    const result = { kind: 'medicine', medicine: { id: 'm-1' } };
    findMock.mockResolvedValue(result);

    await expect(lookupBarcodeAction(' med-7q2k0000aaaa ')).resolves.toEqual({
      success: true,
      data: result,
    });
    expect(permissionMock).toHaveBeenCalledWith('medicine:read');
    expect(findMock).toHaveBeenCalledWith('MED-7Q2K0000AAAA');
  });

  it('returns FORBIDDEN without looking up', async () => {
    permissionMock.mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'No.'));

    await expect(lookupBarcodeAction('4800123456789')).resolves.toMatchObject({
      success: false,
      error: { code: 'FORBIDDEN' },
    });
    expect(findMock).not.toHaveBeenCalled();
  });

  it.each([[''], ['BAT-123'], [42]])('returns VALIDATION_ERROR on the code field for %p', async (code) => {
    const result = await lookupBarcodeAction(code);

    expect(result).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
    expect(result.success === false && result.error.fields?.code).toHaveLength(1);
    expect(findMock).not.toHaveBeenCalled();
  });

  it('returns NOT_FOUND for an unknown code', async () => {
    findMock.mockRejectedValue(notFound());

    await expect(lookupBarcodeAction('4800123456789')).resolves.toMatchObject({
      success: false,
      error: { code: 'NOT_FOUND' },
    });
  });
});
