import { updateSettingsSchema } from '../../../src/lib/validations/settings';

const accepts = (body: unknown) => updateSettingsSchema.safeParse(body).success;

describe('updateSettingsSchema', () => {
  it.each([
    ['nearExpiryThresholdDays', 1, 3650],
    ['smsMaxAttempts', 1, 20],
    ['smsRetryDelayMinutes', 1, 1440],
    ['smsClaimTimeoutMinutes', 1, 1440],
    ['smsBatchSize', 1, 100],
    ['smsMaxItems', 1, 100],
    ['workerPollIntervalSecs', 10, 86400],
  ])('enforces the limits of %s', (field, min, max) => {
    expect(accepts({ [field]: min })).toBe(true);
    expect(accepts({ [field]: max })).toBe(true);
    expect(accepts({ [field]: min - 1 })).toBe(false);
    expect(accepts({ [field]: max + 1 })).toBe(false);
    expect(accepts({ [field]: min + 0.5 })).toBe(false);
    expect(accepts({ [field]: String(min) })).toBe(false);
    expect(accepts({ [field]: null })).toBe(false);
  });

  it.each(['00:00', '08:00', '23:59'])('accepts the time %s', (time) => {
    expect(accepts({ dailyNotificationTime: time })).toBe(true);
  });

  it.each(['24:00', '23:60', '8:00', '08:00:00', '08:00\n', ''])(
    'rejects the time %j',
    (time) => {
      expect(accepts({ dailyNotificationTime: time })).toBe(false);
    },
  );

  it.each(['Asia/Manila', 'UTC', 'America/New_York'])(
    'accepts the timezone %s',
    (timezone) => {
      expect(accepts({ timezone })).toBe(true);
    },
  );

  it.each(['Mars/Base', '', ' Asia/Manila', '+08:00', '-05:30'])(
    'rejects the timezone %j',
    (timezone) => {
      expect(accepts({ timezone })).toBe(false);
    },
  );

  it('trims the facility name and enforces its length', () => {
    expect(updateSettingsSchema.parse({ facilityName: '  Clinic ' })).toEqual({
      facilityName: 'Clinic',
    });
    expect(accepts({ facilityName: '   ' })).toBe(false);
    expect(accepts({ facilityName: 'x'.repeat(100) })).toBe(true);
    expect(accepts({ facilityName: 'x'.repeat(101) })).toBe(false);
  });

  it('only accepts a boolean for smsEnabled', () => {
    expect(accepts({ smsEnabled: false })).toBe(true);
    expect(accepts({ smsEnabled: 'false' })).toBe(false);
  });

  it('accepts every known placeholder and text without any', () => {
    expect(
      accepts({
        smsTemplate:
          '{facility} {date}: {expired} expired, {near_expiry} near.\n{items}',
      }),
    ).toBe(true);
    expect(accepts({ smsTemplate: 'Check InventraMed.' })).toBe(true);
  });

  it.each(['{bogus}', '{items} {Facility}', '{}', '{ items }'])(
    'rejects the template %j',
    (smsTemplate) => {
      expect(accepts({ smsTemplate })).toBe(false);
    },
  );

  it('enforces the template length and rejects a blank one', () => {
    expect(accepts({ smsTemplate: 'x'.repeat(1000) })).toBe(true);
    expect(accepts({ smsTemplate: 'x'.repeat(1001) })).toBe(false);
    expect(accepts({ smsTemplate: '  \n ' })).toBe(false);
    expect(accepts({ smsTemplate: 'a\u0000b' })).toBe(false);
  });

  it('rejects an empty body', () => {
    expect(accepts({})).toBe(false);
  });

  it.each([
    'id',
    'workerLastSeenAt',
    'updatedBy',
    'updatedById',
    'updatedAt',
    'unknown',
  ])('rejects the field %s', (field) => {
    expect(accepts({ smsEnabled: true, [field]: 'x' })).toBe(false);
  });
});
