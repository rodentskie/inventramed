import { createEmployeeSchema } from '../../../src/lib/validations/employee';

const valid = {
  firstName: 'Maria',
  lastName: 'Reyes',
  username: 'mreyes',
  password: 'a-strong-password',
  roleId: '3f2b7c1e-8a4d-4e6f-9b1a-2c3d4e5f6a7b',
};

const parse = (overrides: Record<string, unknown>) =>
  createEmployeeSchema.safeParse({ ...valid, ...overrides });

describe('createEmployeeSchema', () => {
  it('trims text and lowercases the email', () => {
    expect(
      createEmployeeSchema.parse({
        ...valid,
        firstName: '  Maria ',
        email: '  Maria.Reyes@Example.com ',
      }),
    ).toMatchObject({ firstName: 'Maria', email: 'maria.reyes@example.com' });
  });

  it('turns blank optional text into null', () => {
    expect(
      createEmployeeSchema.parse({
        ...valid,
        middleName: ' ',
        email: ' ',
        contactNumber: ' ',
        position: ' ',
      }),
    ).toMatchObject({
      middleName: null,
      email: null,
      contactNumber: null,
      position: null,
    });
  });

  it('defaults receivesSmsAlerts to false', () => {
    expect(createEmployeeSchema.parse(valid).receivesSmsAlerts).toBe(false);
  });

  it.each(['firstName', 'lastName', 'username', 'password', 'roleId'])(
    'requires %s',
    (field) => {
      expect(parse({ [field]: undefined }).success).toBe(false);
    },
  );

  it.each(['passwordHash', 'isActive', 'employeeId', 'deletedAt'])(
    'rejects the unknown field %s',
    (field) => {
      expect(parse({ [field]: 'x' }).success).toBe(false);
    },
  );

  it.each(['MReyes', 'ab', 'has space', ' mreyes', 'x'.repeat(101)])(
    'rejects the username "%s"',
    (username) => {
      expect(parse({ username }).success).toBe(false);
    },
  );

  it('accepts usernames with dots, underscores and hyphens', () => {
    expect(parse({ username: 'm.reyes_01-a' }).success).toBe(true);
  });

  it('rejects an invalid email', () => {
    expect(parse({ email: 'not-an-email' }).success).toBe(false);
  });

  it('rejects a roleId that is not a UUID', () => {
    expect(parse({ roleId: 'staff' }).success).toBe(false);
  });

  it('accepts a Philippine mobile number', () => {
    expect(parse({ contactNumber: '+639171234567' }).success).toBe(true);
  });

  it.each([
    ['local format', '09171234567'],
    ['no plus sign', '639171234567'],
    ['too short', '+63917123456'],
    ['too long', '+6391712345678'],
    ['landline', '+63282345678'],
    ['another country', '+14155552671'],
  ])('rejects a contact number: %s', (_name, contactNumber) => {
    expect(parse({ contactNumber }).success).toBe(false);
  });

  it.each([undefined, null, '  '])(
    'requires a contact number for SMS alerts when it is %j',
    (contactNumber) => {
      const result = parse({ receivesSmsAlerts: true, contactNumber });

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toEqual(['contactNumber']);
    },
  );

  it('accepts SMS alerts with a contact number', () => {
    expect(
      parse({ receivesSmsAlerts: true, contactNumber: '+639171234567' }).success,
    ).toBe(true);
  });

  it('does not trim the password', () => {
    expect(createEmployeeSchema.parse({ ...valid, password: ' spaced pw ' }).password).toBe(
      ' spaced pw ',
    );
  });

  it('rejects a password under 8 characters', () => {
    expect(parse({ password: 'x'.repeat(7) }).success).toBe(false);
  });

  it('accepts a 72-byte password and rejects 73 bytes', () => {
    expect(parse({ password: 'x'.repeat(72) }).success).toBe(true);
    expect(parse({ password: 'x'.repeat(73) }).success).toBe(false);
  });

  it('counts password bytes rather than characters', () => {
    expect(parse({ password: '😀'.repeat(40) }).success).toBe(false);
  });

  it('rejects a password with a NUL character', () => {
    expect(parse({ password: 'pass\u0000word' }).success).toBe(false);
  });
});
