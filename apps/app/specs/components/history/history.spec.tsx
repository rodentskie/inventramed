import { fireEvent, screen } from '@testing-library/react';
import { AuditFilters } from '../../../src/components/history/AuditFilters';
import { AuditLogTable } from '../../../src/components/history/AuditLogTable';
import { ChangeList } from '../../../src/components/history/ChangeList';
import { TransactionFilters } from '../../../src/components/history/TransactionFilters';
import type { AuditLog } from '../../../src/types/audit-log';
import { renderWithChakra } from '../../test-utils';

const pushMock = jest.fn();
let searchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => '/list',
  useSearchParams: () => searchParams,
}));

const MEDICINE_ID = '4a3c8d2f-9b5e-4f7a-8c2b-3d4e5f6a7b8c';

beforeEach(() => {
  pushMock.mockClear();
  searchParams = new URLSearchParams();
});

describe('TransactionFilters', () => {
  it('sets a filter in the URL and goes back to the first page', () => {
    searchParams = new URLSearchParams({ medicineId: MEDICINE_ID, page: '3' });
    renderWithChakra(<TransactionFilters medicineLabel="Paracetamol 500 mg" />);

    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'DISPENSED' } });

    expect(pushMock).toHaveBeenCalledWith(`/list?medicineId=${MEDICINE_ID}&reason=DISPENSED`);
  });

  it('clears a filter set back to All', () => {
    searchParams = new URLSearchParams({ direction: 'IN' });
    renderWithChakra(<TransactionFilters medicineLabel={null} />);

    fireEvent.change(screen.getByLabelText('Direction'), { target: { value: '' } });

    expect(pushMock).toHaveBeenCalledWith('/list');
  });

  it('removes the medicine and batch filters with the chip', () => {
    searchParams = new URLSearchParams({
      medicineId: MEDICINE_ID,
      batchId: 'batch-1',
      reason: 'LOST',
      page: '2',
    });
    renderWithChakra(<TransactionFilters medicineLabel="Paracetamol 500 mg · Batch P778" />);

    expect(screen.getByText('Medicine: Paracetamol 500 mg · Batch P778')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove medicine filter' }));

    expect(pushMock).toHaveBeenCalledWith('/list?reason=LOST');
  });

  it('has no chip without a medicine filter', () => {
    renderWithChakra(<TransactionFilters medicineLabel={null} />);

    expect(screen.queryByText(/Medicine:/)).toBeNull();
  });
});

describe('AuditFilters', () => {
  it('sets the type and dates in the URL', () => {
    searchParams = new URLSearchParams({ page: '4' });
    renderWithChakra(<AuditFilters toError={null} />);

    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'medicine_batches' } });
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-01' } });

    expect(pushMock).toHaveBeenNthCalledWith(1, '/list?entityType=medicine_batches');
    expect(pushMock).toHaveBeenNthCalledWith(2, '/list?from=2026-11-01');
  });

  it('shows the error under To', () => {
    searchParams = new URLSearchParams({ from: '2026-11-08', to: '2026-11-01' });
    renderWithChakra(<AuditFilters toError="Must be after from." />);

    expect(screen.getByText('Must be after from.')).toBeTruthy();
    expect((screen.getByLabelText('To') as HTMLInputElement).value).toBe('2026-11-01');
  });
});

describe('ChangeList', () => {
  it('shows each change as before → after', () => {
    renderWithChakra(
      <ChangeList mode="diff" changes={[{ field: 'strength', before: '250 mg', after: '500 mg' }]} />,
    );

    expect(screen.getByRole('listitem').textContent).toBe('strength: 250 mg → 500 mg');
  });

  it('shows markup as text', () => {
    const { container } = renderWithChakra(
      <ChangeList mode="snapshot" changes={[{ field: 'name', before: null, after: '<script>x</script>' }]} />,
    );

    expect(screen.getByText('<script>x</script>')).toBeTruthy();
    expect(container.querySelector('script')).toBeNull();
  });

  it('truncates long values with a control to show the rest', () => {
    const long = 'a'.repeat(250);
    renderWithChakra(
      <ChangeList mode="snapshot" changes={[{ field: 'notes', before: null, after: long }]} />,
    );

    expect(screen.getByText(`${'a'.repeat(200)}…`)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    expect(screen.getByText(long)).toBeTruthy();
  });

  it('says so when nothing visible changed', () => {
    renderWithChakra(<ChangeList mode="diff" changes={[]} />);

    expect(screen.getByText('No field changes.')).toBeTruthy();
  });
});

describe('AuditLogTable', () => {
  const entry: AuditLog = {
    id: 'log-1',
    entityType: 'medicine_batches',
    entityId: 'batch-1',
    action: 'updated',
    changes: {
      before: { batch_number: 'P778', medicine_id: MEDICINE_ID, quantity: 35, updated_at: 'a' },
      after: { batch_number: 'P778', medicine_id: MEDICINE_ID, quantity: 15, updated_at: 'b' },
    },
    actor: { id: 'user-2', username: 'staff1' },
    createdAt: '2026-11-08T03:50:00.000Z',
  };

  function renderTable(items: AuditLog[] = [entry]) {
    renderWithChakra(
      <AuditLogTable
        items={items}
        timezone="Asia/Manila"
        linkableTypes={['medicine_batches']}
        filtered={false}
      />,
    );
  }

  it('expands a row to show only the changed fields', () => {
    renderTable();

    expect(screen.queryByText(/quantity:/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show changes' }));

    expect(screen.getByText('quantity:').parentElement?.textContent).toBe('quantity: 35 → 15');
    expect(screen.queryByText('batch_number:')).toBeNull();
    expect(screen.getByRole('link', { name: 'P778' }).getAttribute('href')).toBe(
      `/medicines/${MEDICINE_ID}`,
    );
    expect(screen.getByText('staff1')).toBeTruthy();
  });

  it('shows the full row for a created entry', () => {
    renderTable([
      {
        ...entry,
        action: 'created',
        changes: { before: null, after: { batch_number: 'P778', quantity: 0 } },
      },
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Show changes' }));

    expect(screen.getByText('batch_number:').parentElement?.textContent).toBe(
      'batch_number: P778',
    );
    expect(screen.getByText('quantity:').parentElement?.textContent).toBe('quantity: 0');
  });

  it('shows an empty state', () => {
    renderTable([]);

    expect(screen.getByText('No audit entries')).toBeTruthy();
  });
});
