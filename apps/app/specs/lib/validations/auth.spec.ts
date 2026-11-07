import { loginSchema } from '../../../src/lib/validations/auth';

const valid = { username: 'admin', password: 'secret' };

function messageFor(input: unknown): string | undefined {
  const result = loginSchema.safeParse(input);
  return result.success ? undefined : result.error.issues[0].message;
}

describe('loginSchema', () => {
  it('accepts valid credentials', () => {
    expect(loginSchema.parse(valid)).toEqual(valid);
  });

  it('accepts the extra fields NextAuth sends', () => {
    expect(
      loginSchema.parse({
        ...valid,
        csrfToken: 'token',
        callbackUrl: '/',
        json: 'true',
      }),
    ).toEqual(valid);
  });

  it('does not trim values', () => {
    const input = { username: ' admin ', password: ' secret ' };

    expect(loginSchema.parse(input)).toEqual(input);
  });

  it('accepts values at the limits', () => {
    const input = { username: 'a'.repeat(100), password: 'a'.repeat(200) };

    expect(loginSchema.safeParse(input).success).toBe(true);
  });

  it.each([
    [{ ...valid, username: '' }, 'Enter your username.'],
    [{ ...valid, username: 'a'.repeat(101) }, 'Username is too long.'],
    [{ ...valid, password: '' }, 'Enter your password.'],
    [{ ...valid, password: 'a'.repeat(201) }, 'Password is too long.'],
  ])('rejects %j', (input, message) => {
    expect(messageFor(input)).toBe(message);
  });
});
