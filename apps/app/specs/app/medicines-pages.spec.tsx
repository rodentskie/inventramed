import { screen } from '@testing-library/react';
import { notFound, redirect } from 'next/navigation';
import MedicinePage from '../../src/app/(app)/medicines/[id]/page';
import MedicinesPage from '../../src/app/(app)/medicines/page';
import { notFound as apiNotFound } from '../../src/lib/api-response';
import { requirePageUser } from '../../src/lib/auth';
import { getExpiryContext, getMedicine, listMedicines } from '../../src/lib/medicines';
import { batch, medicine, MEDICINE_ID } from '../components/medicines/fixtures';
import { renderWithChakra } from '../test-utils';

jest.mock('next/navigation', () => ({
  redirect: jest.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
  notFound: jest.fn(() => {
    throw new Error('notFound');
  }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/medicines',
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/lib/auth', () => ({ requirePageUser: jest.fn(), getCurrentUser: jest.fn() }));
jest.mock('@/lib/medicines', () => ({
  listMedicines: jest.fn(),
  getMedicine: jest.fn(),
  getExpiryContext: jest.fn(),
}));
jest.mock('@/actions/medicines', () => ({}));
jest.mock('@/actions/inventory', () => ({}));
jest.mock('@/components/common/Barcode', () => ({
  Barcode: ({ value }: { value: string }) => <span>{value}</span>,
}));

const pageUserMock = requirePageUser as jest.Mock;
const listMock = listMedicines as jest.Mock;
const getMock = getMedicine as jest.Mock;
const contextMock = getExpiryContext as jest.Mock;

const READ_ONLY = ['medicine:read', 'inventory:read'];
const STAFF = ['medicine:*', 'inventory:*'];
const NO_RECEIVE = ['medicine:read', 'medicine:write'];

function userWith(permissions: string[]) {
  return { id: 'user-1', permissions };
}

function hasButton(name: string) {
  return screen.queryByRole('button', { name: new RegExp(name) }) !== null;
}

beforeEach(() => {
  jest.clearAllMocks();
  contextMock.mockResolvedValue({ today: '2026-11-08', threshold: 30, timezone: 'Asia/Manila' });
});

describe('/medicines', () => {
  async function renderPage(searchParams: Record<string, string> = {}) {
    renderWithChakra(await MedicinesPage({ searchParams: Promise.resolve(searchParams) }));
  }

  beforeEach(() => {
    listMock.mockResolvedValue({ items: [medicine()], total: 1, page: 1, pageSize: 20 });
  });

  it('requires medicine:read', async () => {
    pageUserMock.mockRejectedValue(new Error('redirect:/'));

    await expect(renderPage()).rejects.toThrow('redirect:/');
    expect(pageUserMock).toHaveBeenCalledWith('medicine:read');
    expect(listMock).not.toHaveBeenCalled();
  });

  it('passes the parsed query to the list', async () => {
    pageUserMock.mockResolvedValue(userWith(READ_ONLY));

    await renderPage({ search: ' para ', page: 'x' });

    expect(listMock).toHaveBeenCalledWith({ search: 'para', page: 1, pageSize: 20 });
    expect(screen.getByRole('link', { name: 'Paracetamol' })).toBeTruthy();
    expect(screen.getByText('1–1 of 1')).toBeTruthy();
  });

  it.each([
    [READ_ONLY, false],
    [STAFF, true],
  ])('with %j shows New medicine: %s', async (permissions, shown) => {
    pageUserMock.mockResolvedValue(userWith(permissions));

    await renderPage();

    expect(hasButton('New medicine')).toBe(shown);
  });

  it('goes to the last page when the page is past the end', async () => {
    pageUserMock.mockResolvedValue(userWith(READ_ONLY));
    listMock.mockResolvedValue({ items: [], total: 45, page: 9, pageSize: 20 });

    await expect(renderPage({ search: 'a', page: '9' })).rejects.toThrow(
      'redirect:/medicines?search=a&page=3',
    );
    expect(redirect).toHaveBeenCalled();
  });
});

describe('/medicines/[id]', () => {
  async function renderPage(id = MEDICINE_ID) {
    renderWithChakra(await MedicinePage({ params: Promise.resolve({ id }) }));
  }

  beforeEach(() => {
    getMock.mockResolvedValue(medicine());
  });

  it('requires medicine:read', async () => {
    pageUserMock.mockRejectedValue(new Error('redirect:/login'));

    await expect(renderPage()).rejects.toThrow('redirect:/login');
    expect(pageUserMock).toHaveBeenCalledWith('medicine:read');
  });

  it('calls notFound for a deleted medicine', async () => {
    pageUserMock.mockResolvedValue(userWith(READ_ONLY));
    getMock.mockRejectedValue(apiNotFound());

    await expect(renderPage()).rejects.toThrow('notFound');
    expect(notFound).toHaveBeenCalled();
  });

  it('calls notFound for an invalid ID without querying', async () => {
    pageUserMock.mockResolvedValue(userWith(READ_ONLY));

    await expect(renderPage('not-a-uuid')).rejects.toThrow('notFound');
    expect(getMock).not.toHaveBeenCalled();
  });

  it('shows the details, barcodes and batches', async () => {
    pageUserMock.mockResolvedValue(userWith(READ_ONLY));

    await renderPage();

    expect(screen.getByRole('heading', { name: 'Paracetamol 500 mg' })).toBeTruthy();
    expect(screen.getByText('MED-7Q2K0000AAAA')).toBeTruthy();
    expect(screen.getByText('4800123456789')).toBeTruthy();
    expect(screen.getByText('BAT-91XZ4KD0Q7M2')).toBeTruthy();
  });

  it.each([
    ['read only', READ_ONLY, { edit: false, del: false, receive: false, dispense: false }],
    ['medicine:write only', NO_RECEIVE, { edit: true, del: true, receive: false, dispense: false }],
    ['staff', STAFF, { edit: true, del: true, receive: true, dispense: true }],
  ])('shows the buttons for %s', async (_name, permissions, expected) => {
    pageUserMock.mockResolvedValue(userWith(permissions));

    await renderPage();

    expect({
      edit: hasButton('^Edit$'),
      del: hasButton('^Delete$'),
      receive: hasButton('Receive stock'),
      dispense: hasButton('^Dispense$'),
    }).toEqual(expected);
  });

  it.each([
    ['no expired stock', 'SAFE', true],
    ['expired stock', 'EXPIRED', false],
  ] as const)('with %s, Dispose expired disabled is %s', async (_name, status, disabled) => {
    pageUserMock.mockResolvedValue(userWith(STAFF));
    getMock.mockResolvedValue(medicine({ batches: [batch({ status })] }));

    await renderPage();

    const button = screen.getByRole('button', { name: 'Dispose expired' }) as HTMLButtonElement;
    expect(button.disabled).toBe(disabled);
  });
});
