import { toaster } from '@inventra-med/components';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { createEmployeeAction, updateEmployeeAction } from '../../../src/actions/employees';
import { EmployeeForm } from '../../../src/components/employees/EmployeeForm';
import { renderWithChakra } from '../../test-utils';
import { ADMIN_ROLE_ID, employee, EMPLOYEE_ID, ROLES, STAFF_ROLE_ID } from './fixtures';

const pushMock = jest.fn();

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));
jest.mock('@/actions/employees', () => ({
  createEmployeeAction: jest.fn(),
  updateEmployeeAction: jest.fn(),
}));

const createMock = createEmployeeAction as jest.Mock;
const updateMock = updateEmployeeAction as jest.Mock;

function field(label: RegExp) {
  return screen.getByLabelText(label) as HTMLInputElement;
}

function type(label: RegExp, value: string) {
  fireEvent.change(field(label), { target: { value } });
}

function button(name: string) {
  return screen.getByRole('button', { name }) as HTMLButtonElement;
}

function smsSwitch() {
  return screen.getByRole('checkbox', { name: 'Receive SMS expiry alerts' }) as HTMLInputElement;
}

function fillNewEmployee() {
  type(/^First name/, 'Ana');
  type(/^Last name/, 'Cruz');
  type(/^Username/, ' anacruz ');
  type(/^Password/, 'correct horse');
}

let toastMock: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  toastMock = jest.spyOn(toaster, 'create').mockReturnValue('toast-id');
});

afterEach(() => {
  toastMock.mockRestore();
});

describe('creating', () => {
  beforeEach(() => {
    renderWithChakra(<EmployeeForm roles={ROLES} />);
  });

  it('shows the password with new-password autocomplete and defaults to staff', () => {
    expect(field(/^Password/).getAttribute('autocomplete')).toBe('new-password');
    expect(field(/^Role/).value).toBe(STAFF_ROLE_ID);
    expect(screen.getByText('Manages medicines and stock')).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Admin' })).toBeTruthy();
  });

  it('submits a normalized number and username, then opens the new employee', async () => {
    createMock.mockResolvedValue({ success: true, data: employee() });
    fillNewEmployee();
    type(/^Contact number/, '0917 123 4567');
    fireEvent.click(button('Create employee'));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith(`/employees/${EMPLOYEE_ID}`));
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        username: 'anacruz',
        contactNumber: '+639171234567',
        password: 'correct horse',
        roleId: STAFF_ROLE_ID,
      }),
    );
    expect(toastMock).toHaveBeenCalledWith({ type: 'success', title: 'Employee created' });
  });

  it('shows duplicate errors under their fields without a toast', async () => {
    createMock.mockResolvedValue({
      success: false,
      error: {
        code: 'EMPLOYEE_DUPLICATE',
        message: 'This email or username is already in use.',
        fields: { username: ['This username is already in use.'] },
      },
    });
    fillNewEmployee();
    fireEvent.click(button('Create employee'));

    expect(await screen.findByText('This username is already in use.')).toBeTruthy();
    expect(toastMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });
});

describe('SMS alerts', () => {
  it('is disabled with a hint without a number', () => {
    renderWithChakra(<EmployeeForm roles={ROLES} />);

    expect(smsSwitch().disabled).toBe(true);
    expect(screen.getByText('Add a contact number to turn on SMS alerts.')).toBeTruthy();

    type(/^Contact number/, '+639171234567');

    expect(smsSwitch().disabled).toBe(false);
    expect(screen.queryByText('Add a contact number to turn on SMS alerts.')).toBeNull();
  });

  it('turns off when the number is cleared, and notes the cancelled texts', () => {
    renderWithChakra(<EmployeeForm roles={ROLES} employee={employee()} />);

    expect(smsSwitch().checked).toBe(true);
    expect(screen.queryByText('Saving this cancels their pending SMS alerts.')).toBeNull();

    type(/^Contact number/, '');

    expect(smsSwitch().checked).toBe(false);
    expect(screen.getByText('Saving this cancels their pending SMS alerts.')).toBeTruthy();
  });

  it('sends the switch when turned on', async () => {
    updateMock.mockResolvedValue({ success: true, data: employee() });
    renderWithChakra(
      <EmployeeForm roles={ROLES} employee={employee({ receivesSmsAlerts: false })} />,
    );

    fireEvent.click(smsSwitch());
    await waitFor(() => expect(button('Save changes').disabled).toBe(false));
    fireEvent.click(button('Save changes'));

    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith(EMPLOYEE_ID, { receivesSmsAlerts: true }),
    );
  });
});

describe('editing', () => {
  it('hides the password and disables Save until something changes', () => {
    renderWithChakra(<EmployeeForm roles={ROLES} employee={employee()} />);

    expect(screen.queryByLabelText(/^Password/)).toBeNull();
    expect(button('Save changes').disabled).toBe(true);

    type(/^Position/, 'Nurse');

    expect(button('Save changes').disabled).toBe(false);
  });

  it('sends only the changed fields and shows what was stored', async () => {
    updateMock.mockResolvedValue({
      success: true,
      data: employee({ contactNumber: '+639181234567', position: 'Nurse' }),
    });
    renderWithChakra(<EmployeeForm roles={ROLES} employee={employee()} />);

    type(/^Position/, 'Nurse');
    type(/^Contact number/, '09181234567');
    type(/^Role/, ADMIN_ROLE_ID);
    fireEvent.click(button('Save changes'));

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith({ type: 'success', title: 'Changes saved' }),
    );
    expect(updateMock).toHaveBeenCalledWith(EMPLOYEE_ID, {
      position: 'Nurse',
      contactNumber: '+639181234567',
      roleId: ADMIN_ROLE_ID,
    });
    expect(field(/^Contact number/).value).toBe('+639181234567');
  });

  it('treats a local number equal to the stored one as unchanged', () => {
    renderWithChakra(<EmployeeForm roles={ROLES} employee={employee()} />);

    type(/^Contact number/, '09171234567');

    expect(button('Save changes').disabled).toBe(true);
  });

  it('shows the last-admin refusal as a toast', async () => {
    const message = 'This is the last active admin and cannot be removed.';
    updateMock.mockResolvedValue({ success: false, error: { code: 'LAST_ADMIN', message } });
    renderWithChakra(<EmployeeForm roles={ROLES} employee={employee()} />);

    type(/^Role/, ADMIN_ROLE_ID);
    fireEvent.click(button('Save changes'));

    await waitFor(() => expect(toastMock).toHaveBeenCalledWith({ type: 'error', title: message }));
  });

  it('disables the role on your own record', () => {
    renderWithChakra(<EmployeeForm roles={ROLES} employee={employee()} isSelf />);

    expect((field(/^Role/) as unknown as HTMLSelectElement).disabled).toBe(true);
    expect(screen.getByText("You can't change your own role or status.")).toBeTruthy();
  });
});
