import { toaster } from '@inventra-med/components';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import {
  dispenseAction,
  disposeExpiredAction,
  recordMovementAction,
} from '../../../src/actions/inventory';
import { receiveStockAction } from '../../../src/actions/medicines';
import { BatchMovementDialog } from '../../../src/components/movements/BatchMovementDialog';
import { DispenseDialog } from '../../../src/components/movements/DispenseDialog';
import { DisposeExpiredDialog } from '../../../src/components/movements/DisposeExpiredDialog';
import { renderWithChakra } from '../../test-utils';
import { batch, MEDICINE_ID, medicine } from '../medicines/fixtures';

jest.mock('@/actions/inventory', () => ({
  dispenseAction: jest.fn(),
  disposeExpiredAction: jest.fn(),
  recordMovementAction: jest.fn(),
}));
jest.mock('@/actions/medicines', () => ({ receiveStockAction: jest.fn() }));

const dispenseMock = dispenseAction as jest.Mock;
const disposeMock = disposeExpiredAction as jest.Mock;
const movementMock = recordMovementAction as jest.Mock;
const receiveMock = receiveStockAction as jest.Mock;

const onClose = jest.fn();
const onMoved = jest.fn();
const dialog = { onClose, onMoved };

function type(label: string | RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function submit(name: string) {
  fireEvent.click(screen.getByRole('button', { name }));
}

function expectSaved(title: string) {
  return waitFor(() => {
    expect(toaster.create).toHaveBeenCalledWith({ type: 'success', title });
    expect(onClose).toHaveBeenCalled();
    expect(onMoved).toHaveBeenCalled();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(toaster, 'create').mockImplementation(() => '');
});

describe('DispenseDialog', () => {
  const stocked = medicine({
    batches: [
      batch({ id: 'a', quantity: 150, status: 'SAFE' }),
      batch({ id: 'b', quantity: 20, status: 'EXPIRED', daysToExpiry: -2 }),
    ],
  });

  it('shows usable stock and the expired note, then dispenses', async () => {
    dispenseMock.mockResolvedValue({ success: true, data: { quantity: 5 } });
    renderWithChakra(<DispenseDialog medicine={stocked} {...dialog} />);

    expect(screen.getByText('150 pc available')).toBeTruthy();
    expect(screen.getByText('20 pc expired, not dispensable.')).toBeTruthy();

    type(/Quantity/, '5');
    submit('Dispense');

    await expectSaved('Dispensed 5 pc');
    expect(dispenseMock).toHaveBeenCalledWith(MEDICINE_ID, { quantity: 5, notes: '' });
  });

  it('shows INSUFFICIENT_STOCK under Quantity and stays open', async () => {
    dispenseMock.mockResolvedValue({
      success: false,
      error: {
        code: 'INSUFFICIENT_STOCK',
        message: 'There is not enough stock for this movement.',
        fields: { quantity: ['Only 3 available.'] },
      },
    });
    renderWithChakra(<DispenseDialog medicine={stocked} {...dialog} />);

    type(/Quantity/, '500');
    submit('Dispense');

    expect(await screen.findByText('Only 3 available.')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(onMoved).not.toHaveBeenCalled();
  });

  it('uses a number pad', () => {
    renderWithChakra(<DispenseDialog medicine={stocked} {...dialog} />);

    expect(screen.getByLabelText(/Quantity/).getAttribute('inputmode')).toBe('numeric');
  });
});

describe('BatchMovementDialog', () => {
  const props = { medicine: medicine(), batch: batch(), ...dialog };

  it.each([
    ['153', 'Difference: +3'],
    ['147', 'Difference: −3'],
    ['150', 'Count matches, nothing recorded.'],
  ])('count of %s shows "%s"', (counted, label) => {
    renderWithChakra(<BatchMovementDialog action="count" {...props} />);

    type(/Counted quantity/, counted);

    expect(screen.getByText(label)).toBeTruthy();
  });

  it('shows no difference for an invalid count', () => {
    renderWithChakra(<BatchMovementDialog action="count" {...props} />);

    type(/Counted quantity/, '-1');

    expect(screen.queryByText(/Difference/)).toBeNull();
  });

  it.each([
    [{ id: 'tx-1' }, 'Count updated'],
    [null, 'Count matches, nothing recorded.'],
  ])('saves a count and reports it', async (transaction, title) => {
    movementMock.mockResolvedValue({ success: true, data: { transaction, batch: batch() } });
    renderWithChakra(<BatchMovementDialog action="count" {...props} />);

    type(/Counted quantity/, '147');
    type(/Notes/, 'Shelf count');
    submit('Save count');

    await expectSaved(title);
    expect(movementMock).toHaveBeenCalledWith(MEDICINE_ID, 'batch-1', {
      reason: 'COUNT_ADJUSTMENT',
      countedQuantity: 147,
      notes: 'Shelf count',
    });
  });

  it.each([
    ['damaged', 'DAMAGED'],
    ['lost', 'LOST'],
  ] as const)('records %s stock', async (action, reason) => {
    movementMock.mockResolvedValue({ success: true, data: { transaction: {}, batch: batch() } });
    renderWithChakra(<BatchMovementDialog action={action} {...props} />);

    type(/Quantity/, '2');
    type(/Notes/, 'Dropped');
    submit('Record');

    await expectSaved(`Recorded 2 pc as ${action}`);
    expect(movementMock).toHaveBeenCalledWith(MEDICINE_ID, 'batch-1', {
      reason,
      quantity: 2,
      notes: 'Dropped',
    });
  });

  it.each(['IN', 'OUT'])('records a return with direction %s', async (direction) => {
    movementMock.mockResolvedValue({ success: true, data: { transaction: {}, batch: batch() } });
    renderWithChakra(<BatchMovementDialog action="returned" {...props} />);

    type(/Direction/, direction);
    type(/Quantity/, '2');
    type(/Notes/, 'Wrong item');
    submit('Record');

    await expectSaved('Return recorded');
    expect(movementMock).toHaveBeenCalledWith(MEDICINE_ID, 'batch-1', {
      reason: 'RETURNED',
      direction,
      quantity: 2,
      notes: 'Wrong item',
    });
  });

  it('sends no direction until one is chosen', async () => {
    movementMock.mockResolvedValue({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'The request is invalid.',
        fields: { direction: ['Choose a direction.'] },
      },
    });
    renderWithChakra(<BatchMovementDialog action="returned" {...props} />);

    submit('Record');

    expect(await screen.findByText('Choose a direction.')).toBeTruthy();
    expect(movementMock.mock.calls[0][2].direction).toBeUndefined();
  });

  it('receives more with the batch number and expiry fixed', async () => {
    receiveMock.mockResolvedValue({ success: true, data: { batch: batch(), created: false } });
    renderWithChakra(<BatchMovementDialog action="receive" {...props} />);

    type(/Quantity/, '10');
    submit('Receive');

    await expectSaved('Added 10 pc to batch P778');
    expect(receiveMock).toHaveBeenCalledWith(MEDICINE_ID, {
      batchNumber: 'P778',
      expirationDate: '2026-11-12',
      quantity: 10,
      notes: '',
    });
    expect(screen.queryByLabelText(/Batch number/)).toBeNull();
  });

  it('disposes this batch only', async () => {
    disposeMock.mockResolvedValue({ success: true, data: { quantity: 150 } });
    renderWithChakra(<BatchMovementDialog action="dispose" {...props} />);

    submit('Dispose');

    await expectSaved('Disposed 150 pc of expired stock');
    expect(disposeMock).toHaveBeenCalledWith(MEDICINE_ID, { batchIds: ['batch-1'], notes: '' });
    expect(screen.queryByText('Batches to dispose')).toBeNull();
  });
});

describe('DisposeExpiredDialog for a medicine', () => {
  const batches = [
    batch({ id: 'old-1', batchNumber: 'A1', status: 'EXPIRED', quantity: 20 }),
    batch({ id: 'old-2', batchNumber: 'A2', status: 'EXPIRED', quantity: 5 }),
    batch({ id: 'empty', batchNumber: 'A3', status: 'EXPIRED', quantity: 0 }),
    batch({ id: 'good', batchNumber: 'A4', status: 'SAFE', quantity: 90 }),
  ];

  function renderDialog() {
    renderWithChakra(<DisposeExpiredDialog medicine={medicine()} batches={batches} {...dialog} />);
  }

  it('lists only expired batches with stock', () => {
    renderDialog();

    expect(screen.getByText(/^A1 ·/)).toBeTruthy();
    expect(screen.getByText(/^A2 ·/)).toBeTruthy();
    expect(screen.queryByText(/^A3 ·/)).toBeNull();
    expect(screen.queryByText(/^A4 ·/)).toBeNull();
  });

  it('sends the ticked batches', async () => {
    disposeMock.mockResolvedValue({ success: true, data: { quantity: 25 } });
    renderDialog();

    submit('Dispose');

    await expectSaved('Disposed 25 pc of expired stock');
    expect(disposeMock).toHaveBeenCalledWith(MEDICINE_ID, {
      batchIds: ['old-1', 'old-2'],
      notes: '',
    });
  });

  it('leaves out an unticked batch, and needs at least one', async () => {
    renderDialog();
    const [first, second] = screen.getAllByRole('checkbox');

    const button = screen.getByRole('button', { name: 'Dispose' }) as HTMLButtonElement;

    fireEvent.click(first);
    fireEvent.click(second);
    await waitFor(() => expect(button.disabled).toBe(true));

    fireEvent.click(second);
    await waitFor(() => expect(button.disabled).toBe(false));
    disposeMock.mockResolvedValue({ success: true, data: { quantity: 5 } });
    submit('Dispose');

    await waitFor(() =>
      expect(disposeMock).toHaveBeenCalledWith(MEDICINE_ID, { batchIds: ['old-2'], notes: '' }),
    );
  });
});
