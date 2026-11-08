import { screen } from '@testing-library/react';
import SettingsPage from '../../src/app/(app)/settings/page';
import { requirePageUser } from '../../src/lib/auth';
import { getWorkerStatus } from '../../src/lib/dashboard';
import { getSettings } from '../../src/lib/settings';
import { settings } from '../components/settings/fixtures';
import { renderWithChakra } from '../test-utils';

jest.mock('@/lib/auth', () => ({ requirePageUser: jest.fn() }));
jest.mock('@/lib/dashboard', () => ({ getWorkerStatus: jest.fn() }));
jest.mock('@/lib/settings', () => ({ getSettings: jest.fn() }));
jest.mock('@/actions/settings', () => ({ updateSettingsAction: jest.fn() }));

const pageUserMock = requirePageUser as jest.Mock;
const settingsMock = getSettings as jest.Mock;
const workerMock = getWorkerStatus as jest.Mock;

const NOW = new Date('2026-11-08T00:00:00.000Z');
const THREE_MIN_AGO = '2026-11-07T23:57:00.000Z';

async function renderPage() {
  renderWithChakra(await SettingsPage());
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW, doNotFake: ['queueMicrotask', 'nextTick'] });
  pageUserMock.mockResolvedValue({ id: 'admin', permissions: ['*'] });
  settingsMock.mockResolvedValue(settings());
  workerMock.mockResolvedValue({ smsEnabled: true, lastSeenAt: THREE_MIN_AGO, online: true });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('/settings', () => {
  it('redirects without settings:manage, before loading anything', async () => {
    pageUserMock.mockRejectedValue(new Error('redirect:/'));

    await expect(renderPage()).rejects.toThrow('redirect:/');
    expect(pageUserMock).toHaveBeenCalledWith('settings:manage');
    expect(settingsMock).not.toHaveBeenCalled();
  });

  it('shows who last changed the settings', async () => {
    settingsMock.mockResolvedValue(
      settings({
        updatedBy: { id: 'u1', username: 'admin' },
        updatedAt: '2026-11-06T00:00:00.000Z',
      }),
    );
    await renderPage();

    expect(screen.getByText('Last changed by admin, 2 d ago')).toBeTruthy();
  });

  it('hides the line when nobody has changed the settings', async () => {
    await renderPage();

    expect(screen.queryByText(/Last changed/)).toBeNull();
  });

  it.each([
    ['online', { smsEnabled: true, lastSeenAt: THREE_MIN_AGO, online: true }, 'Online · last seen 3 min ago'],
    ['offline', { smsEnabled: true, lastSeenAt: THREE_MIN_AGO, online: false }, 'Offline · last seen 3 min ago'],
    ['never seen', { smsEnabled: true, lastSeenAt: null, online: false }, 'Offline · never connected'],
    ['SMS off', { smsEnabled: false, lastSeenAt: THREE_MIN_AGO, online: false }, 'SMS is off'],
  ])('shows the worker status when %s', async (_name, status, text) => {
    workerMock.mockResolvedValue(status);
    await renderPage();

    expect(screen.getByText(text)).toBeTruthy();
  });
});
