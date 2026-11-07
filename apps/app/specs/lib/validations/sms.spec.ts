import { smsResultSchema } from '../../../src/lib/validations/sms';

const valid = { attempt: 1, success: true };

describe('smsResultSchema', () => {
  it('accepts the required fields alone', () => {
    expect(smsResultSchema.parse(valid)).toEqual(valid);
  });

  it('accepts text at the length limits and trims it', () => {
    const parsed = smsResultSchema.parse({
      attempt: 2,
      success: false,
      error: ` ${'e'.repeat(500)} `,
      modemResponse: 'm'.repeat(1000),
    });

    expect(parsed.error).toHaveLength(500);
    expect(parsed.modemResponse).toHaveLength(1000);
  });

  it('turns blank text into null', () => {
    expect(smsResultSchema.parse({ ...valid, error: '  ' }).error).toBeNull();
  });

  it.each([
    ['a missing attempt', { success: true }],
    ['a missing success', { attempt: 1 }],
    ['attempt 0', { attempt: 0, success: true }],
    ['a fractional attempt', { attempt: 1.5, success: true }],
    ['a string attempt', { attempt: '1', success: true }],
    ['a string success', { attempt: 1, success: 'true' }],
    ['an error that is too long', { ...valid, error: 'e'.repeat(501) }],
    [
      'a modem response that is too long',
      { ...valid, modemResponse: 'm'.repeat(1001) },
    ],
    ['a NUL character', { ...valid, error: 'a\u0000b' }],
    ['an unknown field', { ...valid, status: 'SENT' }],
  ])('rejects %s', (_name, value) => {
    expect(smsResultSchema.safeParse(value).success).toBe(false);
  });
});
