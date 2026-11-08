/** @jest-environment node */
import { revalidatePath } from 'next/cache';
import { updateSettingsAction } from '../../src/actions/settings';
import { ApiError } from '../../src/lib/api-response';
import { requirePermission } from '../../src/lib/auth';
import { updateSettings } from '../../src/lib/settings';

jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('@/lib/auth', () => ({ requirePermission: jest.fn() }));
jest.mock('@/lib/settings', () => ({ updateSettings: jest.fn() }));

const permissionMock = requirePermission as jest.Mock;
const revalidateMock = revalidatePath as jest.Mock;
const updateMock = updateSettings as jest.Mock;

const USER_ID = 'user-1';

beforeEach(() => {
  jest.resetAllMocks();
  permissionMock.mockResolvedValue({ id: USER_ID });
});

describe('updateSettingsAction', () => {
  it('saves as the current user and revalidates', async () => {
    const data = { facilityName: 'Clinic' };
    updateMock.mockResolvedValue(data);

    await expect(updateSettingsAction({ facilityName: 'Clinic' })).resolves.toEqual({
      success: true,
      data,
    });
    expect(permissionMock).toHaveBeenCalledWith('settings:manage');
    expect(updateMock).toHaveBeenCalledWith(USER_ID, { facilityName: 'Clinic' });
    expect(revalidateMock.mock.calls).toEqual([['/settings'], ['/']]);
  });

  it('returns FORBIDDEN without writing', async () => {
    permissionMock.mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'Denied.'));

    await expect(updateSettingsAction({ facilityName: 'Clinic' })).resolves.toMatchObject({
      success: false,
      error: { code: 'FORBIDDEN' },
    });
    expect(updateMock).not.toHaveBeenCalled();
    expect(revalidateMock).not.toHaveBeenCalled();
  });

  it.each([
    ['an unknown placeholder', { smsTemplate: 'Hi {name}' }, 'smsTemplate', 'Only {facility}'],
    ['an empty number', { smsMaxItems: null }, 'smsMaxItems', 'Enter a whole number from 1 to 100.'],
    ['a UTC offset', { timezone: '+08:00' }, 'timezone', 'Must be a valid IANA timezone.'],
    ['a read-only field', { workerLastSeenAt: null }, 'workerLastSeenAt', 'not allowed'],
  ])('passes through the field error for %s', async (_name, input, field, message) => {
    const result = await updateSettingsAction(input);

    expect(result).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
    expect(result.success === false && result.error.fields?.[field]?.[0]).toContain(message);
    expect(updateMock).not.toHaveBeenCalled();
    expect(revalidateMock).not.toHaveBeenCalled();
  });
});
