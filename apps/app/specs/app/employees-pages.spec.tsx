import { screen } from '@testing-library/react';
import { notFound } from 'next/navigation';
import EmployeePage from '../../src/app/(app)/employees/[id]/page';
import NewEmployeePage from '../../src/app/(app)/employees/new/page';
import EmployeesPage from '../../src/app/(app)/employees/page';
import { notFound as apiNotFound } from '../../src/lib/api-response';
import { requirePageUser } from '../../src/lib/auth';
import { getEmployee, listEmployees } from '../../src/lib/employees';
import { listRoles } from '../../src/lib/roles';
import { employee, EMPLOYEE_ID, ROLES, USER_ID } from '../components/employees/fixtures';
import { renderWithChakra } from '../test-utils';

jest.mock('next/navigation', () => ({
  redirect: jest.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
  notFound: jest.fn(() => {
    throw new Error('notFound');
  }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/employees',
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/lib/auth', () => ({ requirePageUser: jest.fn(), getCurrentUser: jest.fn() }));
jest.mock('@/lib/employees', () => ({ listEmployees: jest.fn(), getEmployee: jest.fn() }));
jest.mock('@/lib/roles', () => ({ listRoles: jest.fn() }));
jest.mock('@/actions/employees', () => ({}));

const pageUserMock = requirePageUser as jest.Mock;
const listMock = listEmployees as jest.Mock;
const getMock = getEmployee as jest.Mock;

const REQUIRED = ['employee:manage', 'user:manage'];

beforeEach(() => {
  jest.clearAllMocks();
  pageUserMock.mockResolvedValue({ id: 'admin-user', permissions: ['*'] });
  (listRoles as jest.Mock).mockResolvedValue(ROLES);
});

describe('/employees', () => {
  async function renderPage(searchParams: Record<string, string> = {}) {
    renderWithChakra(await EmployeesPage({ searchParams: Promise.resolve(searchParams) }));
  }

  beforeEach(() => {
    listMock.mockResolvedValue({ items: [employee()], total: 1, page: 1, pageSize: 20 });
  });

  it('requires both permissions', async () => {
    pageUserMock.mockRejectedValue(new Error('redirect:/'));

    await expect(renderPage()).rejects.toThrow('redirect:/');
    expect(pageUserMock).toHaveBeenCalledWith(...REQUIRED);
    expect(listMock).not.toHaveBeenCalled();
  });

  it('lists active employees by default', async () => {
    await renderPage({ search: ' ana ' });

    expect(listMock).toHaveBeenCalledWith({
      search: 'ana',
      page: 1,
      pageSize: 20,
      status: 'active',
    });
  });

  it('shows a row with a capitalized role', async () => {
    await renderPage();

    const link = screen.getByRole('link', { name: 'Ana Cruz' });
    expect(link.getAttribute('href')).toBe(`/employees/${EMPLOYEE_ID}`);
    expect(screen.getByText('anacruz')).toBeTruthy();
    expect(screen.getByText('Staff')).toBeTruthy();
    expect(screen.getByText('+639171234567')).toBeTruthy();
    expect(screen.getByText('On')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'New employee' }).getAttribute('href')).toBe(
      '/employees/new',
    );
  });

  it('shows a dash without a contact number, and the Inactive tag', async () => {
    listMock.mockResolvedValue({
      items: [employee({ contactNumber: null, receivesSmsAlerts: false, isActive: false })],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    await renderPage({ status: 'all' });

    expect(listMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'all' }));
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.getByText('Off')).toBeTruthy();
    expect(screen.getByText('Inactive')).toBeTruthy();
  });

  it('shows the search empty state', async () => {
    listMock.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });

    await renderPage({ search: 'zed' });

    expect(screen.getByText('No employees match "zed"')).toBeTruthy();
  });

  it('goes to the last page past the end and keeps the filters', async () => {
    listMock.mockResolvedValue({ items: [], total: 45, page: 9, pageSize: 20 });

    await expect(renderPage({ search: 'a', status: 'all', page: '9' })).rejects.toThrow(
      'redirect:/employees?search=a&status=all&page=3',
    );
  });
});

describe('/employees/new', () => {
  it('requires both permissions', async () => {
    pageUserMock.mockRejectedValue(new Error('redirect:/'));

    await expect(NewEmployeePage()).rejects.toThrow('redirect:/');
    expect(pageUserMock).toHaveBeenCalledWith(...REQUIRED);
  });

  it('shows the create form', async () => {
    renderWithChakra(await NewEmployeePage());

    expect(screen.getByRole('heading', { name: 'New employee' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create employee' })).toBeTruthy();
  });
});

describe('/employees/[id]', () => {
  async function renderPage(id = EMPLOYEE_ID) {
    renderWithChakra(await EmployeePage({ params: Promise.resolve({ id }) }));
  }

  beforeEach(() => {
    getMock.mockResolvedValue(employee());
  });

  it('requires both permissions', async () => {
    pageUserMock.mockRejectedValue(new Error('redirect:/'));

    await expect(renderPage()).rejects.toThrow('redirect:/');
    expect(pageUserMock).toHaveBeenCalledWith(...REQUIRED);
  });

  it('calls notFound for a deleted employee', async () => {
    getMock.mockRejectedValue(apiNotFound());

    await expect(renderPage()).rejects.toThrow('notFound');
    expect(notFound).toHaveBeenCalled();
  });

  it('calls notFound for an invalid ID without querying', async () => {
    await expect(renderPage('not-a-uuid')).rejects.toThrow('notFound');
    expect(getMock).not.toHaveBeenCalled();
  });

  it('enables the status buttons on someone else', async () => {
    await renderPage();

    const button = screen.getByRole('button', { name: 'Deactivate' }) as HTMLButtonElement;
    expect(screen.getByRole('heading', { name: 'Ana Cruz' })).toBeTruthy();
    expect(button.disabled).toBe(false);
  });

  it('disables the status buttons on your own record', async () => {
    pageUserMock.mockResolvedValue({ id: USER_ID, permissions: ['*'] });

    await renderPage();

    const button = screen.getByRole('button', { name: 'Deactivate' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});
