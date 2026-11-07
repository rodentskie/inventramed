/** @jest-environment node */
import { NextRequest } from 'next/server';
import { POST as resultRoute } from '../../../src/app/api/worker/sms/[id]/result/route';
import { POST as claimRoute } from '../../../src/app/api/worker/sms/claim/route';
import { ApiError, notFound } from '../../../src/lib/api-response';
import * as outbox from '../../../src/lib/sms-outbox';
import { requireWorkerToken } from '../../../src/lib/worker-auth';

jest.mock('@/lib/worker-auth', () => ({ requireWorkerToken: jest.fn() }));
jest.mock('@/lib/sms-outbox', () => ({
  claimSmsMessages: jest.fn(),
  recordSmsResult: jest.fn(),
  recordWorkerHeartbeat: jest.fn(),
}));

const tokenMock = requireWorkerToken as jest.Mock;
const mocked = outbox as jest.Mocked<typeof outbox>;

const ID = '3f2b7c1e-8a4d-4e6f-9b1a-2c3d4e5f6a7b';
const URL_BASE = 'http://localhost/api/worker/sms';
const RESULT = { attempt: 1, success: true };

const ctx = (id = ID) => ({ params: Promise.resolve({ id }) });
const post = (body?: string) =>
  new NextRequest(URL_BASE, { method: 'POST', body });
const postResult = (body: unknown = RESULT, id = ID) =>
  resultRoute(post(JSON.stringify(body)), ctx(id));

const routes: [string, () => Promise<Response>][] = [
  ['claim', () => claimRoute(post())],
  ['result', () => postResult()],
];

describe('worker SMS routes', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe.each(routes)('POST %s', (_name, call) => {
    it('returns 401 and touches nothing without a valid token', async () => {
      tokenMock.mockImplementation(() => {
        throw new ApiError(401, 'UNAUTHENTICATED', 'Token required.');
      });

      const response = await call();

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({
        success: false,
        error: { code: 'UNAUTHENTICATED', message: 'Token required.' },
      });
      expect(mocked.recordWorkerHeartbeat).not.toHaveBeenCalled();
      expect(mocked.claimSmsMessages).not.toHaveBeenCalled();
      expect(mocked.recordSmsResult).not.toHaveBeenCalled();
    });

    it('records the heartbeat', async () => {
      await call();

      expect(mocked.recordWorkerHeartbeat).toHaveBeenCalledTimes(1);
    });
  });

  describe('POST /api/worker/sms/claim', () => {
    it('returns the claim', async () => {
      const claim = {
        pollIntervalSecs: 300,
        messages: [
          { id: ID, phoneNumber: '+639171234567', body: 'Alert', attempt: 1 },
        ],
      };
      mocked.claimSmsMessages.mockResolvedValue(claim);

      const response = await claimRoute(post());

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        success: true,
        data: claim,
      });
    });
  });

  describe('POST /api/worker/sms/:id/result', () => {
    it('returns the outcome', async () => {
      const result = { id: ID, status: 'SENT' as const, applied: true };
      mocked.recordSmsResult.mockResolvedValue(result);

      const response = await postResult();

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        success: true,
        data: result,
      });
      expect(mocked.recordSmsResult).toHaveBeenCalledWith(ID, RESULT);
    });

    it('returns 200 for an ignored result, so the worker does not retry', async () => {
      mocked.recordSmsResult.mockResolvedValue({
        id: ID,
        status: 'SENT',
        applied: false,
      });

      const response = await postResult();

      expect(response.status).toBe(200);
      expect((await response.json()).data.applied).toBe(false);
    });

    it('returns 400 for invalid JSON', async () => {
      const response = await resultRoute(post('{'), ctx());

      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe('INVALID_JSON');
    });

    it('returns 400 for an invalid body', async () => {
      const response = await postResult({ success: true });

      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe('VALIDATION_ERROR');
      expect(mocked.recordSmsResult).not.toHaveBeenCalled();
    });

    it('returns 400 for an invalid ID', async () => {
      const response = await postResult(RESULT, 'bad');

      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 404 for an unknown message', async () => {
      mocked.recordSmsResult.mockRejectedValue(notFound());

      const response = await postResult();

      expect(response.status).toBe(404);
      expect((await response.json()).error.code).toBe('NOT_FOUND');
    });
  });
});
