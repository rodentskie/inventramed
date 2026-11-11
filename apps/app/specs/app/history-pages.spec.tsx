import { screen } from '@testing-library/react';
import { notFound, redirect } from 'next/navigation';
import AuditLogsPage from '../../src/app/(app)/audit-logs/page';
import TransactionPage, {
  generateMetadata,
} from '../../src/app/(app)/inventory/transactions/[id]/page';
import TransactionsPage from '../../src/app/(app)/inventory/transactions/page';
import { notFound as apiNotFound } from '../../src/lib/api-response';
import { listAuditLogs } from '../../src/lib/audit-logs';
import { getCurrentUser, requirePageUser } from '../../src/lib/auth';
import {
  getTransaction,
  getTransactionFilterLabel,
  listTransactions,
} from '../../src/lib/inventory';
import { getSettings } from '../../src/lib/settings';
import { renderWithChakra } from '../test-utils';

jest.mock('next/navigation', () => ({
  redirect: jest.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
  notFound: jest.fn(() => {
    throw new Error('notFound');
  }),
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
  usePathname: () => '/inventory/transactions',
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/lib/auth', () => ({ requirePageUser: jest.fn(), getCurrentUser: jest.fn() }));
jest.mock('@/lib/inventory', () => ({
  listTransactions: jest.fn(),
  getTransaction: jest.fn(),
  getTransactionFilterLabel: jest.fn(),
}));
jest.mock('@/lib/prisma', () => ({ prisma: {} }));
jest.mock('@/lib/audit-logs', () => ({
  ...jest.requireActual('@/lib/audit-logs'),
  listAuditLogs: jest.fn(),
}));
jest.mock('@/lib/settings', () => ({ getSettings: jest.fn() }));

const pageUserMock = requirePageUser as jest.Mock;
const listMock = listTransactions as jest.Mock;
const getMock = getTransaction as jest.Mock;
const labelMock = getTransactionFilterLabel as jest.Mock;
const auditMock = listAuditLogs as jest.Mock;

const ID = '3f2b7c1e-8a4d-4e6f-9b1a-2c3d4e5f6a7b';
const MEDICINE_ID = '4a3c8d2f-9b5e-4f7a-8c2b-3d4e5f6a7b8c';
const BATCH_ID = '5b4d9e3a-ac6f-4a8b-9d3c-4e5f6a7b8c9d';
const EMPTY = { items: [], total: 0, page: 1, pageSize: 20 };

const transaction = {
  id: ID,
  medicineId: MEDICINE_ID,
  medicine: { id: MEDICINE_ID, name: 'Paracetamol', strength: '500 mg', unit: 'pc', deleted: true },
  direction: 'OUT',
  reason: 'DISPENSED',
  quantity: 20,
  notes: 'Ward 3 request',
  performedBy: { id: 'user-2', username: 'staff1' },
  // 11:50 in Manila.
  createdAt: '2026-11-08T03:50:00.000Z',
  entries: [
    { id: 'e1', batchId: 'b1', batchNumber: 'P778', expirationDate: '2026-11-12', quantity: 15 },
    { id: 'e2', batchId: 'b2', batchNumber: 'Q120', expirationDate: '2026-12-01', quantity: 5 },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  pageUserMock.mockResolvedValue({ id: 'user-1', permissions: ['*'] });
  (getCurrentUser as jest.Mock).mockResolvedValue({ id: 'user-1', permissions: ['*'] });
  (getSettings as jest.Mock).mockResolvedValue({ timezone: 'Asia/Manila' });
  labelMock.mockResolvedValue(null);
  listMock.mockResolvedValue(EMPTY);
  auditMock.mockResolvedValue(EMPTY);
});

describe('/inventory/transactions', () => {
  async function renderPage(searchParams: Record<string, string> = {}) {
    renderWithChakra(await TransactionsPage({ searchParams: Promise.resolve(searchParams) }));
  }

  it('requires inventory:read', async () => {
    pageUserMock.mockRejectedValue(new Error('redirect:/'));

    await expect(renderPage()).rejects.toThrow('redirect:/');
    expect(pageUserMock).toHaveBeenCalledWith('inventory:read');
    expect(listMock).not.toHaveBeenCalled();
  });

  it('lists transactions in the settings timezone, with a deleted medicine tagged', async () => {
    listMock.mockResolvedValue({ items: [transaction], total: 1, page: 1, pageSize: 20 });

    await renderPage();

    const when = screen.getByRole('link', { name: '2026-11-08 11:50' });
    expect(when.getAttribute('href')).toBe(`/inventory/transactions/${ID}`);
    expect(screen.getByRole('cell', { name: 'Dispensed' })).toBeTruthy();
    expect(screen.getByText('−20 pc')).toBeTruthy();
    expect(screen.getByText('Paracetamol 500 mg')).toBeTruthy();
    expect(screen.getByText('Deleted')).toBeTruthy();
    expect(screen.getByText('staff1')).toBeTruthy();
  });

  it('passes the filters and shows the medicine chip', async () => {
    labelMock.mockResolvedValue('Paracetamol 500 mg · Batch P778');

    await renderPage({ medicineId: MEDICINE_ID, batchId: BATCH_ID, reason: 'DISPENSED' });

    expect(listMock).toHaveBeenCalledWith({
      medicineId: MEDICINE_ID,
      batchId: BATCH_ID,
      reason: 'DISPENSED',
      page: 1,
      pageSize: 20,
    });
    expect(labelMock).toHaveBeenCalledWith(MEDICINE_ID, BATCH_ID);
    expect(screen.getByText('Medicine: Paracetamol 500 mg · Batch P778')).toBeTruthy();
    expect(screen.getByText('No transactions match these filters.')).toBeTruthy();
  });

  it('drops invalid filters instead of failing', async () => {
    await renderPage({ reason: 'NOPE', medicineId: 'bad', direction: 'IN' });

    expect(listMock).toHaveBeenCalledWith({ direction: 'IN', page: 1, pageSize: 20 });
  });

  it('shows the empty state without filters', async () => {
    await renderPage();

    expect(screen.getByText('No transactions')).toBeTruthy();
    expect(screen.queryByText('No transactions match these filters.')).toBeNull();
  });

  it('goes to the last page when past the end, keeping the filters', async () => {
    listMock.mockResolvedValue({ items: [], total: 41, page: 9, pageSize: 20 });

    await expect(renderPage({ page: '9', reason: 'LOST' })).rejects.toThrow('redirect:');
    expect(redirect).toHaveBeenCalledWith('/inventory/transactions?reason=LOST&page=3');
  });
});

describe('/inventory/transactions/[id]', () => {
  async function renderPage(id = ID) {
    renderWithChakra(await TransactionPage({ params: Promise.resolve({ id }) }));
  }

  it('requires inventory:read', async () => {
    pageUserMock.mockRejectedValue(new Error('redirect:/'));

    await expect(renderPage()).rejects.toThrow('redirect:/');
    expect(pageUserMock).toHaveBeenCalledWith('inventory:read');
  });

  it('shows the transaction and the batches it touched', async () => {
    getMock.mockResolvedValue(transaction);

    await renderPage();

    expect(screen.getByRole('heading', { name: 'Dispensed −20 pc' })).toBeTruthy();
    expect(screen.getByText('staff1')).toBeTruthy();
    expect(screen.getByText('2026-11-08 11:50')).toBeTruthy();
    expect(screen.getByText('Ward 3 request')).toBeTruthy();
    expect(screen.getByText('P778')).toBeTruthy();
    expect(screen.getByText('Q120')).toBeTruthy();
    expect(screen.getByText('15 pc')).toBeTruthy();
    expect(screen.getByText('5 pc')).toBeTruthy();
  });

  it('is not found for a missing transaction', async () => {
    getMock.mockRejectedValue(apiNotFound());

    await expect(renderPage()).rejects.toThrow('notFound');
    expect(notFound).toHaveBeenCalled();
  });

  it('is not found for a malformed ID without a query', async () => {
    await expect(renderPage('bad')).rejects.toThrow('notFound');
    expect(getMock).not.toHaveBeenCalled();
  });

  it('titles the page with the reason', async () => {
    getMock.mockResolvedValue(transaction);

    await expect(
      generateMetadata({ params: Promise.resolve({ id: ID }) }),
    ).resolves.toEqual({ title: 'Dispensed' });
  });
});

describe('/audit-logs', () => {
  async function renderPage(searchParams: Record<string, string> = {}) {
    renderWithChakra(await AuditLogsPage({ searchParams: Promise.resolve(searchParams) }));
  }

  const auditEntry = {
    id: 'log-1',
    entityType: 'medicines',
    entityId: MEDICINE_ID,
    action: 'updated',
    changes: {
      before: { name: 'Paracetamol', strength: '250 mg' },
      after: { name: 'Paracetamol', strength: '500 mg' },
    },
    actor: null,
    createdAt: '2026-11-07T02:02:00.000Z',
  };

  it('requires audit:read', async () => {
    pageUserMock.mockRejectedValue(new Error('redirect:/'));

    await expect(renderPage()).rejects.toThrow('redirect:/');
    expect(pageUserMock).toHaveBeenCalledWith('audit:read');
    expect(auditMock).not.toHaveBeenCalled();
  });

  it('turns local dates into a timezone-aware range', async () => {
    await renderPage({ from: '2026-11-01', to: '2026-11-08', entityType: 'medicines' });

    expect(auditMock).toHaveBeenCalledWith({
      entityType: 'medicines',
      from: new Date('2026-10-31T16:00:00.000Z'),
      to: new Date('2026-11-08T16:00:00.000Z'),
      page: 1,
      pageSize: 20,
    });
  });

  it('shows the message under To and no results when to is before from', async () => {
    await renderPage({ from: '2026-11-08', to: '2026-11-01' });

    expect(auditMock).not.toHaveBeenCalled();
    expect(screen.getByText('Must be after from.')).toBeTruthy();
    expect(screen.getByText('No audit entries')).toBeTruthy();
  });

  it('drops invalid filters instead of failing', async () => {
    await renderPage({ entityType: 'employees', from: 'yesterday', action: 'created' });

    expect(auditMock).toHaveBeenCalledWith({ action: 'created', page: 1, pageSize: 20 });
  });

  it('lists entries with a linked record and system as the actor', async () => {
    auditMock.mockResolvedValue({ items: [auditEntry], total: 1, page: 1, pageSize: 20 });

    await renderPage();

    expect(screen.getByText('2026-11-07 10:02')).toBeTruthy();
    expect(screen.getByRole('cell', { name: 'Medicine' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Paracetamol' }).getAttribute('href')).toBe(
      `/medicines/${MEDICINE_ID}`,
    );
    expect(screen.getByText('system')).toBeTruthy();
  });

  it('shows records as text when the user cannot open them', async () => {
    pageUserMock.mockResolvedValue({ id: 'user-1', permissions: ['audit:read'] });
    auditMock.mockResolvedValue({ items: [auditEntry], total: 1, page: 1, pageSize: 20 });

    await renderPage();

    expect(screen.getByText('Paracetamol')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Paracetamol' })).toBeNull();
  });

  it('goes to the last page when past the end, keeping the filters', async () => {
    auditMock.mockResolvedValue({ items: [], total: 21, page: 5, pageSize: 20 });

    await expect(renderPage({ page: '5', action: 'deleted' })).rejects.toThrow('redirect:');
    expect(redirect).toHaveBeenCalledWith('/audit-logs?action=deleted&page=2');
  });
});
