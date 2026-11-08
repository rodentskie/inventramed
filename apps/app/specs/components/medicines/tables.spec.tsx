import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { BatchTable } from '../../../src/components/medicines/BatchTable';
import { MedicineTable } from '../../../src/components/medicines/MedicineTable';
import { renderWithChakra } from '../../test-utils';
import { batch, medicine } from './fixtures';

jest.mock('@/actions/medicines', () => ({ updateBatchAction: jest.fn() }));

// The menu's floating positioning needs it, and jsdom doesn't have it.
beforeAll(() => {
  global.ResizeObserver = class {
    observe = jest.fn();
    unobserve = jest.fn();
    disconnect = jest.fn();
  };
});

describe('MedicineTable', () => {
  it('renders rows with a link and the stock with its unit', () => {
    renderWithChakra(
      <MedicineTable
        items={[
          medicine({ totalStock: 1200, unit: 'cap', name: 'Amoxicillin', genericName: null }),
        ]}
      />,
    );

    const link = screen.getByRole('link', { name: 'Amoxicillin' });
    expect(link.getAttribute('href')).toBe('/medicines/3f2b7c1e-8a4d-4e6f-9b1a-2c3d4e5f6a7b');
    expect(screen.getByText('1,200 cap')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy();
  });

  it('shows the empty state with its action when there are no medicines', () => {
    renderWithChakra(<MedicineTable items={[]} emptyAction={<button>New medicine</button>} />);

    expect(screen.getByText('No medicines yet')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'New medicine' })).toBeTruthy();
  });

  it('shows the no-match state for a search', () => {
    renderWithChakra(
      <MedicineTable items={[]} search="ibu" emptyAction={<button>New medicine</button>} />,
    );

    expect(screen.getByText('No medicines match "ibu"')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'New medicine' })).toBeNull();
  });
});

describe('BatchTable', () => {
  const batches = [
    batch({ id: 'b-1', batchNumber: 'A123', status: 'EXPIRED', daysToExpiry: -7, quantity: 0 }),
    batch({ id: 'b-2', batchNumber: 'P778', status: 'NEAR_EXPIRY', daysToExpiry: 4 }),
    batch({ id: 'b-3', batchNumber: 'Z900', status: 'SAFE', daysToExpiry: 200 }),
  ];

  function row(batchNumber: string) {
    return screen.getByText(batchNumber).closest('tr') as HTMLElement;
  }

  it('shows each status with its color and text', () => {
    renderWithChakra(
      <BatchTable batches={batches} unit="pc" canEdit timezone="Asia/Manila" />,
    );

    const status = (batchNumber: string) =>
      within(row(batchNumber)).getByText(/left|Expired/).closest('[data-scope="status"], div');
    expect(within(row('A123')).getByText('Expired 7d ago')).toBeTruthy();
    expect(within(row('P778')).getByText('4d left')).toBeTruthy();
    expect(within(row('Z900')).getByText('200d left')).toBeTruthy();
    expect(status('A123')?.className).not.toBe(status('P778')?.className);
    expect(status('P778')?.className).not.toBe(status('Z900')?.className);
  });

  it('mutes batches with no stock', () => {
    renderWithChakra(
      <BatchTable batches={batches} unit="pc" canEdit={false} timezone="Asia/Manila" />,
    );

    expect(row('A123').className).not.toBe(row('P778').className);
    expect(within(row('A123')).getByText('0 pc')).toBeTruthy();
  });

  it('shows the received date in the settings timezone', () => {
    renderWithChakra(
      <BatchTable
        batches={[batch({ receivedAt: '2026-10-31T23:30:00.000Z' })]}
        unit="pc"
        canEdit={false}
        timezone="Asia/Manila"
      />,
    );

    expect(screen.getByText('2026-11-01')).toBeTruthy();
  });

  it('shows the empty state', () => {
    renderWithChakra(<BatchTable batches={[]} unit="pc" canEdit timezone="Asia/Manila" />);

    expect(screen.getByText('No stock received yet')).toBeTruthy();
  });

  it.each([
    [true, true],
    [false, false],
  ])('with canEdit=%s shows Edit batch: %s', async (canEdit, shown) => {
    renderWithChakra(
      <BatchTable batches={[batches[1]]} unit="pc" canEdit={canEdit} timezone="Asia/Manila" />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Actions for batch P778' }));

    const print = await screen.findByRole('menuitem', { name: 'Print label' });
    expect(print.getAttribute('href')).toBe('/labels/batches/b-2');
    expect(print.getAttribute('target')).toBe('_blank');
    await waitFor(() =>
      expect(Boolean(screen.queryByRole('menuitem', { name: 'Edit batch' }))).toBe(shown),
    );
  });
});
