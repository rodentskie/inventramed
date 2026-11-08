import {
  createEmployeeSchema,
  employeeListQuerySchema,
  normalizeContactNumber,
  updateEmployeeSchema,
} from '../../../src/lib/validations/employee';

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

describe('updateEmployeeSchema', () => {
  const parseUpdate = (value: Record<string, unknown>) =>
    updateEmployeeSchema.safeParse(value);

  it('rejects an empty body', () => {
    expect(parseUpdate({}).success).toBe(false);
  });

  it('accepts a single field and leaves the rest undefined', () => {
    const result = updateEmployeeSchema.parse({ position: ' Pharmacist ' });

    expect(result.position).toBe('Pharmacist');
    expect(result.firstName).toBeUndefined();
    expect(result.email).toBeUndefined();
  });

  it('has no default for receivesSmsAlerts', () => {
    expect(
      updateEmployeeSchema.parse({ position: 'x' }).receivesSmsAlerts,
    ).toBeUndefined();
  });

  it.each([
    ['password', 'a-strong-password'],
    ['passwordHash', 'x'],
    ['employeeId', 'x'],
    ['failedLoginAttempts', 0],
    ['deletedAt', null],
  ])('rejects the unknown field %s', (field, value) => {
    expect(parseUpdate({ [field]: value }).success).toBe(false);
  });

  it.each(['firstName', 'lastName', 'username', 'roleId', 'isActive', 'receivesSmsAlerts'])(
    'rejects null for %s',
    (field) => {
      expect(parseUpdate({ [field]: null }).success).toBe(false);
    },
  );

  it.each(['middleName', 'email', 'contactNumber', 'position'])(
    'allows clearing %s',
    (field) => {
      expect(updateEmployeeSchema.parse({ [field]: null })).toMatchObject({
        [field]: null,
      });
    },
  );

  it('uses the same rules as create', () => {
    expect(parseUpdate({ username: 'MReyes' }).success).toBe(false);
    expect(parseUpdate({ contactNumber: '09171234567' }).success).toBe(false);
    expect(parseUpdate({ email: 'nope' }).success).toBe(false);
    expect(parseUpdate({ firstName: '  ' }).success).toBe(false);
    expect(parseUpdate({ roleId: 'staff' }).success).toBe(false);
  });

  it('lowercases the email', () => {
    expect(updateEmployeeSchema.parse({ email: 'A@Example.com' }).email).toBe(
      'a@example.com',
    );
  });

  it('rejects alerts on while clearing the number', () => {
    const result = parseUpdate({ receivesSmsAlerts: true, contactNumber: ' ' });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(['contactNumber']);
  });

  it('leaves alerts on with an absent number to the data layer', () => {
    expect(parseUpdate({ receivesSmsAlerts: true }).success).toBe(true);
  });
});

describe('employeeListQuerySchema', () => {
  it('applies defaults', () => {
    expect(employeeListQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
      status: 'active',
    });
  });

  it('coerces and trims', () => {
    expect(
      employeeListQuerySchema.parse({ search: ' maria ', page: '2', pageSize: '5' }),
    ).toEqual({ search: 'maria', page: 2, pageSize: 5, status: 'active' });
  });

  it('accepts the all status', () => {
    expect(employeeListQuerySchema.parse({ status: 'all' }).status).toBe('all');
  });

  it.each([{ page: '0' }, { pageSize: '101' }, { unknown: '1' }, { status: 'inactive' }])(
    'rejects %j',
    (query) => {
      expect(employeeListQuerySchema.safeParse(query).success).toBe(false);
    },
  );
});

describe('normalizeContactNumber', () => {
  it.each([
    ['09171234567', '+639171234567'],
    ['+639171234567', '+639171234567'],
    ['0917 123 4567', '+639171234567'],
    ['0917-123-4567', '+639171234567'],
    ['+63 917 123 4567', '+639171234567'],
  ])('converts %s', (input, expected) => {
    expect(normalizeContactNumber(input)).toBe(expected);
  });

  it.each(['', '0917123456', '08171234567', '+14155552671', 'abc 123'])(
    'leaves %j for the schema to reject',
    (input) => {
      expect(normalizeContactNumber(input)).toBe(input);
    },
  );
});
