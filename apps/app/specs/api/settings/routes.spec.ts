/** @jest-environment node */
import { NextRequest } from 'next/server';
import { ApiError } from '../../../src/lib/api-response';
import { requirePermission } from '../../../src/lib/auth';
import * as settings from '../../../src/lib/settings';
import { GET, PATCH } from '../../../src/app/api/settings/route';

jest.mock('@/lib/auth', () => ({ requirePermission: jest.fn() }));
jest.mock('@/lib/settings', () => ({
  getSettings: jest.fn(),
  updateSettings: jest.fn(),
}));

const permissionMock = requirePermission as jest.Mock;
const mocked = settings as jest.Mocked<typeof settings>;

const URL_BASE = 'http://localhost/api/settings';
const USER_ID = 'user-1';

const patchRaw = (body: string) =>
  PATCH(new NextRequest(URL_BASE, { method: 'PATCH', body }));
const patch = (body: unknown) => patchRaw(JSON.stringify(body));

const result = {
  facilityName: 'InventraMed',
  smsBatchSize: 5,
} as Awaited<ReturnType<typeof settings.getSettings>>;

const routes: [string, () => Promise<Response>][] = [
  ['GET', () => GET()],
  ['PATCH', () => patch({ smsBatchSize: 5 })],
];

describe('settings routes', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    permissionMock.mockResolvedValue({ id: USER_ID });
  });

  describe.each(routes)('%s', (_name, call) => {
    it('requires settings:manage', async () => {
      mocked.getSettings.mockResolvedValue(result);
      mocked.updateSettings.mockResolvedValue(result);

      const response = await call();

      expect(response.status).toBe(200);
      expect(permissionMock).toHaveBeenCalledWith('settings:manage');
    });

    it('returns 401 without a session', async () => {
      permissionMock.mockRejectedValue(
        new ApiError(401, 'UNAUTHENTICATED', 'You must be logged in.'),
      );

      const response = await call();

      expect(response.status).toBe(401);
      expect((await response.json()).error.code).toBe('UNAUTHENTICATED');
      expect(mocked.getSettings).not.toHaveBeenCalled();
      expect(mocked.updateSettings).not.toHaveBeenCalled();
    });

    it('returns 403 without the permission', async () => {
      permissionMock.mockRejectedValue(
        new ApiError(403, 'FORBIDDEN', 'You do not have permission to do this.'),
      );

      const response = await call();

      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe('FORBIDDEN');
      expect(mocked.getSettings).not.toHaveBeenCalled();
      expect(mocked.updateSettings).not.toHaveBeenCalled();
    });
  });

  it('GET returns the settings', async () => {
    mocked.getSettings.mockResolvedValue(result);

    const response = await GET();

    expect(await response.json()).toEqual({ success: true, data: result });
  });

  it('PATCH passes the caller and the parsed input to the data layer', async () => {
    mocked.updateSettings.mockResolvedValue(result);

    const response = await patch({ facilityName: '  Clinic ', smsBatchSize: 5 });

    expect(mocked.updateSettings).toHaveBeenCalledWith(USER_ID, {
      facilityName: 'Clinic',
      smsBatchSize: 5,
    });
    expect(await response.json()).toEqual({ success: true, data: result });
  });

  it('PATCH returns 400 for invalid JSON', async () => {
    const response = await patchRaw('{not json');

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('INVALID_JSON');
    expect(mocked.updateSettings).not.toHaveBeenCalled();
  });

  it.each([
    ['an empty body', {}, '_'],
    ['a batch size of 0', { smsBatchSize: 0 }, 'smsBatchSize'],
    ['an invalid timezone', { timezone: 'Mars/Base' }, 'timezone'],
    ['an unknown placeholder', { smsTemplate: '{bogus}' }, 'smsTemplate'],
    ['a read-only field', { workerLastSeenAt: null }, 'workerLastSeenAt'],
    ['the id', { id: 2 }, 'id'],
  ])('PATCH returns 400 for %s', async (_name, body, field) => {
    const response = await patch(body);
    const { error } = await response.json();

    expect(response.status).toBe(400);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.fields).toHaveProperty(field);
    expect(mocked.updateSettings).not.toHaveBeenCalled();
  });
});
