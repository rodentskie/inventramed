/** @jest-environment node */
import { ApiError } from '../../src/lib/api-response';
import { requireWorkerToken } from '../../src/lib/worker-auth';

const TOKEN = 'test-worker-token';

const request = (authorization?: string) =>
  new Request('http://localhost/api/worker/sms/claim', {
    method: 'POST',
    headers: authorization ? { authorization } : {},
  });

const expectUnauthenticated = (authorization?: string) => {
  let thrown: unknown;
  try {
    requireWorkerToken(request(authorization));
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(ApiError);
  expect(thrown).toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
};

describe('requireWorkerToken', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env.WORKER_API_TOKEN = TOKEN;
    errorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    delete process.env.WORKER_API_TOKEN;
    errorSpy.mockRestore();
  });

  it('accepts the correct token', () => {
    expect(() => requireWorkerToken(request(`Bearer ${TOKEN}`))).not.toThrow();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it.each([
    ['a wrong token of the same length', `Bearer ${'x'.repeat(TOKEN.length)}`],
    ['a shorter token', 'Bearer short'],
    ['a longer token', `Bearer ${TOKEN}-extra`],
    ['another scheme', `Basic ${TOKEN}`],
    ['no scheme', TOKEN],
    ['an empty bearer value', 'Bearer '],
    ['no header', undefined],
  ])('rejects %s', (_name, authorization) => {
    expectUnauthenticated(authorization);
  });

  it.each([
    ['unset', undefined],
    ['empty', ''],
  ])('logs and rejects every call when the token is %s', (_name, value) => {
    if (value === undefined) {
      delete process.env.WORKER_API_TOKEN;
    } else {
      process.env.WORKER_API_TOKEN = value;
    }

    expectUnauthenticated('Bearer ');
    expectUnauthenticated(`Bearer ${TOKEN}`);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('WORKER_API_TOKEN'),
    );
  });
});
