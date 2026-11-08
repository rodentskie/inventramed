import { toaster } from '@inventra-med/components';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { deleteEmployeeAction, setEmployeeActiveAction } from '../../../src/actions/employees';
import { EmployeeStatusActions } from '../../../src/components/employees/EmployeeStatusActions';
import { renderWithChakra } from '../../test-utils';
import { employee, EMPLOYEE_ID } from './fixtures';

const replaceMock = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: replaceMock }),
}));
jest.mock('@/actions/employees', () => ({
  createEmployeeAction: jest.fn(),
  updateEmployeeAction: jest.fn(),
  setEmployeeActiveAction: jest.fn(),
  deleteEmployeeAction: jest.fn(),
}));

const setActiveMock = setEmployeeActiveAction as jest.Mock;
const deleteMock = deleteEmployeeAction as jest.Mock;

function button(name: string) {
  return screen.getByRole('button', { name }) as HTMLButtonElement;
}

async function confirm(trigger: string) {
  fireEvent.click(button(trigger));
  const dialog = await screen.findByRole('dialog');
  return dialog;
}

function submitDialog(label: string) {
  const buttons = screen.getAllByRole('button', { name: label, hidden: true });
  fireEvent.click(buttons[buttons.length - 1]);
}

let toastMock: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  toastMock = jest.spyOn(toaster, 'create').mockReturnValue('toast-id');
});

afterEach(() => {
  toastMock.mockRestore();
});

it('confirms before deactivating', async () => {
  setActiveMock.mockResolvedValue({ success: true, data: employee({ isActive: false }) });
  renderWithChakra(<EmployeeStatusActions employee={employee()} isSelf={false} />);

  const dialog = await confirm('Deactivate');

  expect(dialog.textContent).toContain(
    "Ana Cruz won't be able to sign in, and their pending SMS alerts are cancelled.",
  );
  expect(setActiveMock).not.toHaveBeenCalled();

  submitDialog('Deactivate');

  await waitFor(() => expect(setActiveMock).toHaveBeenCalledWith(EMPLOYEE_ID, false));
  await waitFor(() =>
    expect(toastMock).toHaveBeenCalledWith({ type: 'success', title: 'Employee deactivated' }),
  );
});

it('offers Activate for an inactive employee', async () => {
  setActiveMock.mockResolvedValue({ success: true, data: employee() });
  renderWithChakra(
    <EmployeeStatusActions employee={employee({ isActive: false })} isSelf={false} />,
  );

  expect(screen.getByText('Inactive')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Deactivate' })).toBeNull();

  await confirm('Activate');
  submitDialog('Activate');

  await waitFor(() => expect(setActiveMock).toHaveBeenCalledWith(EMPLOYEE_ID, true));
});

it('confirms before deleting, then returns to the list', async () => {
  deleteMock.mockResolvedValue({ success: true, data: { id: EMPLOYEE_ID } });
  renderWithChakra(<EmployeeStatusActions employee={employee()} isSelf={false} />);

  const dialog = await confirm('Delete');

  expect(dialog.textContent).toContain(
    "This can't be undone. Their email and username stay reserved.",
  );

  submitDialog('Delete');

  await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/employees'));
  expect(deleteMock).toHaveBeenCalledWith(EMPLOYEE_ID);
  expect(toastMock).toHaveBeenCalledWith({ type: 'success', title: 'Employee deleted' });
});

it('shows the last-admin refusal as a toast and stays on the page', async () => {
  const message = 'This is the last active admin and cannot be removed.';
  deleteMock.mockResolvedValue({ success: false, error: { code: 'LAST_ADMIN', message } });
  renderWithChakra(<EmployeeStatusActions employee={employee()} isSelf={false} />);

  await confirm('Delete');
  submitDialog('Delete');

  await waitFor(() => expect(toastMock).toHaveBeenCalledWith({ type: 'error', title: message }));
  expect(replaceMock).not.toHaveBeenCalled();
});

it('disables the buttons on your own record, with a hint', () => {
  renderWithChakra(<EmployeeStatusActions employee={employee()} isSelf />);

  expect(button('Deactivate').disabled).toBe(true);
  expect(button('Delete').disabled).toBe(true);
  expect(screen.getByText("You can't change your own role or status.")).toBeTruthy();
});
