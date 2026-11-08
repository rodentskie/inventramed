import { diffSettings, toFormValues } from '../../src/lib/settings-diff';
import { settings } from '../components/settings/fixtures';

describe('diffSettings', () => {
  it('returns nothing when no field changed', () => {
    expect(diffSettings(settings(), toFormValues(settings()))).toEqual({});
  });

  it('returns only the changed field', () => {
    const values = { ...toFormValues(settings()), facilityName: 'Clinic' };

    expect(diffSettings(settings(), values)).toEqual({ facilityName: 'Clinic' });
  });

  it('returns a changed boolean', () => {
    const values = { ...toFormValues(settings()), smsEnabled: false };

    expect(diffSettings(settings(), values)).toEqual({ smsEnabled: false });
  });

  it('compares numbers from inputs as numbers', () => {
    const same = { ...toFormValues(settings()), nearExpiryThresholdDays: '030' };
    const changed = { ...toFormValues(settings()), nearExpiryThresholdDays: '45' };

    expect(diffSettings(settings(), same)).toEqual({});
    expect(diffSettings(settings(), changed)).toEqual({ nearExpiryThresholdDays: 45 });
  });

  it('sends an empty number as null, for the server to reject', () => {
    const values = { ...toFormValues(settings()), smsMaxItems: '' };

    expect(diffSettings(settings(), values)).toEqual({ smsMaxItems: null });
  });

  it('ignores whitespace the schema would trim', () => {
    const values = { ...toFormValues(settings()), facilityName: ' InventraMed ' };

    expect(diffSettings(settings(), values)).toEqual({});
  });

  it('never includes read-only fields', () => {
    const values = {
      ...toFormValues(settings()),
      workerLastSeenAt: '2030-01-01T00:00:00.000Z',
      updatedAt: '2030-01-01T00:00:00.000Z',
      updatedBy: { id: 'other', username: 'other' },
      smsMaxItems: '5',
    };

    expect(diffSettings(settings(), values)).toEqual({ smsMaxItems: 5 });
  });
});
