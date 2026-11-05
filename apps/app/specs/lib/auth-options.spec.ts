/** @jest-environment node */
import { compare } from 'bcrypt';
import { authOptions, authorizeCredentials } from '../../src/lib/auth-options';
import { prisma } from '../../src/lib/prisma';

jest.mock('bcrypt', () => ({ compare: jest.fn() }));
jest.mock('@/lib/prisma', () => ({
  prisma: {
    $executeRaw: jest.fn(),
    user: { findUnique: jest.fn(), update: jest.fn() },
  },
}));

const compareMock = compare as jest.Mock;
const executeRawMock = prisma.$executeRaw as unknown as jest.Mock;
const findUniqueMock = prisma.user.findUnique as jest.Mock;
const updateMock = prisma.user.update as jest.Mock;

const credentials = { username: 'admin', password: 'correct' };
const activeUser = {
  id: 'user-1',
  username: 'admin',
  passwordHash: 'real-hash',
  isActive: true,
  employee: { isActive: true, deletedAt: null },
};

describe('authorizeCredentials', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    process.env.LOGIN_MAX_ATTEMPTS = '5';
    process.env.LOGIN_COOLDOWN_MINUTES = '15';
    findUniqueMock.mockResolvedValue(activeUser);
    executeRawMock.mockResolvedValue(1);
    compareMock.mockResolvedValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns the user and resets the counter on a valid login', async () => {
    await expect(authorizeCredentials(credentials)).resolves.toEqual({
      id: 'user-1',
      name: 'admin',
    });
    expect(executeRawMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { failedLoginAttempts: 0, lastLoginAt: expect.any(Date) },
    });
  });

  it('keeps the increment on a wrong password', async () => {
    compareMock.mockResolvedValue(false);

    await expect(authorizeCredentials(credentials)).resolves.toBeNull();
    expect(executeRawMock).toHaveBeenCalledTimes(1);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('throws the lockout message without comparing the password', async () => {
    executeRawMock.mockResolvedValue(0);
    findUniqueMock
      .mockResolvedValueOnce(activeUser)
      .mockResolvedValueOnce({ lastLoginAttemptAt: new Date() });

    await expect(authorizeCredentials(credentials)).rejects.toThrow(
      'Try again after 15 minutes',
    );
    expect(compareMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('compares the dummy hash for an unknown username', async () => {
    findUniqueMock.mockResolvedValue(null);

    await expect(authorizeCredentials(credentials)).resolves.toBeNull();
    expect(compareMock).toHaveBeenCalledTimes(1);
    expect(compareMock.mock.calls[0][1]).toMatch(/^\$2b\$12\$/);
    expect(executeRawMock).not.toHaveBeenCalled();
  });

  it.each([
    ['inactive user', { isActive: false }],
    ['inactive employee', { employee: { isActive: false, deletedAt: null } }],
    [
      'soft-deleted employee',
      { employee: { isActive: true, deletedAt: new Date() } },
    ],
  ])('rejects an %s with the correct password', async (_name, override) => {
    findUniqueMock.mockResolvedValue({ ...activeUser, ...override });

    await expect(authorizeCredentials(credentials)).resolves.toBeNull();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it.each([
    [undefined],
    [{}],
    [{ username: '', password: 'x' }],
    [{ username: 'admin', password: '' }],
    [{ username: 'admin', password: 'x'.repeat(201) }],
  ])('rejects invalid input %j', async (input) => {
    await expect(authorizeCredentials(input)).resolves.toBeNull();
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it.each(['LOGIN_MAX_ATTEMPTS', 'LOGIN_COOLDOWN_MINUTES'])(
    'rejects every login when %s is invalid',
    async (name) => {
      process.env[name] = 'invalid';

      await expect(authorizeCredentials(credentials)).resolves.toBeNull();
      expect(findUniqueMock).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalled();
    },
  );

  it('returns null instead of throwing on a database error', async () => {
    findUniqueMock.mockRejectedValue(new Error('connection details'));

    await expect(authorizeCredentials(credentials)).resolves.toBeNull();
    expect(console.error).toHaveBeenCalled();
  });
});

describe('authOptions', () => {
  it('uses only the Credentials provider', () => {
    expect(authOptions.providers.map((provider) => provider.id)).toEqual([
      'credentials',
    ]);
  });

  it('uses 8-hour JWT sessions', () => {
    expect(authOptions.session).toEqual({
      strategy: 'jwt',
      maxAge: 8 * 60 * 60,
    });
  });
});
