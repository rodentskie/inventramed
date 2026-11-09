import { act, fireEvent, screen } from '@testing-library/react';
import { toaster } from '@inventra-med/components';
import { updateSettingsAction } from '../../../src/actions/settings';
import { SettingsForm } from '../../../src/components/settings/SettingsForm';
import { renderWithChakra } from '../../test-utils';
import { settings } from './fixtures';

jest.mock('@/actions/settings', () => ({ updateSettingsAction: jest.fn() }));

const updateMock = updateSettingsAction as jest.Mock;

/** The combobox's machine updates on the first animation frame after mounting. */
async function renderForm() {
  renderWithChakra(<SettingsForm settings={settings()} workerStatus={<span>Online</span>} />);
  await act(() => new Promise((resolve) => requestAnimationFrame(resolve)));
}

const saveButton = () => screen.getByRole('button', { name: 'Save changes' });

/** Types as a user does: number inputs only handle `input` events while focused. */
async function change(label: string, value: string) {
  const input = screen.getByLabelText(label);
  await act(async () => {
    fireEvent.focus(input);
  });
  await act(async () => {
    fireEvent.input(input, { target: { value } });
  });
}

async function save() {
  await act(async () => {
    fireEvent.click(saveButton());
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(toaster, 'create').mockImplementation(() => '');
});

describe('SettingsForm', () => {
  it('shows every section and the worker status', async () => {
    await renderForm();

    for (const name of ['General', 'Expiry alerts', 'SMS', 'Worker']) {
      expect(screen.getByRole('heading', { name })).toBeTruthy();
    }
    expect(screen.getByText('Online')).toBeTruthy();
  });

  it('disables Save with no changes, and again after undoing one', async () => {
    await renderForm();
    expect((saveButton() as HTMLButtonElement).disabled).toBe(true);

    await change('Facility name', 'Clinic');
    expect((saveButton() as HTMLButtonElement).disabled).toBe(false);

    await change('Facility name', 'InventraMed');
    expect((saveButton() as HTMLButtonElement).disabled).toBe(true);
  });

  it('sends only the changed fields, then shows a toast and disables Save', async () => {
    updateMock.mockResolvedValue({
      success: true,
      data: settings({ facilityName: 'Clinic', nearExpiryThresholdDays: 45 }),
    });
    await renderForm();

    await change('Facility name', 'Clinic');
    await change('Near-expiry threshold', '45');
    await save();

    expect(updateMock).toHaveBeenCalledWith({ facilityName: 'Clinic', nearExpiryThresholdDays: 45 });
    expect(toaster.create).toHaveBeenCalledWith({ type: 'success', title: 'Settings saved' });
    expect((saveButton() as HTMLButtonElement).disabled).toBe(true);
  });

  it('keeps a poll interval above 999 ungrouped, so it saves as a number', async () => {
    updateMock.mockResolvedValue({ success: true, data: settings({ workerPollIntervalSecs: 86400 }) });
    await renderForm();

    await change('Poll interval', '86400');
    await save();

    expect(updateMock).toHaveBeenCalledWith({ workerPollIntervalSecs: 86400 });
  });

  it('shows field errors under the field and keeps the edit', async () => {
    updateMock.mockResolvedValue({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'The request is invalid.',
        fields: { smsMaxItems: ['Enter a whole number from 1 to 100.'] },
      },
    });
    await renderForm();

    await change('Items per SMS', '500');
    await save();

    expect(screen.getByText('Enter a whole number from 1 to 100.')).toBeTruthy();
    expect((screen.getByLabelText('Items per SMS') as HTMLInputElement).value).toBe('500');
    expect(toaster.create).not.toHaveBeenCalled();
  });

  it('registers beforeunload only while there are unsaved changes', async () => {
    const add = jest.spyOn(window, 'addEventListener');
    const remove = jest.spyOn(window, 'removeEventListener');
    const calls = (spy: jest.SpyInstance) =>
      spy.mock.calls.filter(([type]) => type === 'beforeunload').length;
    await renderForm();
    expect(calls(add)).toBe(0);

    await change('Facility name', 'Clinic');
    expect(calls(add)).toBe(1);

    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);

    await change('Facility name', 'InventraMed');
    expect(calls(remove)).toBe(1);
  });
});
