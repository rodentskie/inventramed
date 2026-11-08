/** @jest-environment node */
import { notFound, redirect } from 'next/navigation';
import { runAction } from '../../src/lib/action-result';
import { ApiError } from '../../src/lib/api-response';

describe('runAction', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('wraps the result', async () => {
    await expect(runAction(async () => ({ id: 'm-1' }))).resolves.toEqual({
      success: true,
      data: { id: 'm-1' },
    });
  });

  it('maps an ApiError without fields', async () => {
    const result = await runAction(async () => {
      throw new ApiError(403, 'FORBIDDEN', 'You do not have permission to do this.');
    });

    expect(result).toEqual({
      success: false,
      error: { code: 'FORBIDDEN', message: 'You do not have permission to do this.' },
    });
  });

  it('keeps the fields of an ApiError', async () => {
    const result = await runAction(async () => {
      throw new ApiError(400, 'VALIDATION_ERROR', 'The request is invalid.', {
        name: ['This field is required.'],
      });
    });

    expect(result).toEqual({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'The request is invalid.',
        fields: { name: ['This field is required.'] },
      },
    });
  });

  it('logs anything else and returns INTERNAL_ERROR', async () => {
    const error = new Error('connection reset');

    const result = await runAction(async () => {
      throw error;
    });

    expect(result).toEqual({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
    });
    expect(errorSpy).toHaveBeenCalledWith('Unexpected action error', error);
  });

  it.each([
    ['redirect', () => redirect('/login')],
    ['notFound', () => notFound()],
  ])('rethrows Next %s errors', async (_name, raise) => {
    await expect(
      runAction(async () => {
        raise();
      }),
    ).rejects.toBeDefined();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
