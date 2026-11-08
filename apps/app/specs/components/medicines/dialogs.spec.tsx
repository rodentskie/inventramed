import { toaster } from '@inventra-med/components';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import {
  createMedicineAction,
  receiveStockAction,
  updateMedicineAction,
} from '../../../src/actions/medicines';
import { MedicineFormDialog } from '../../../src/components/medicines/MedicineFormDialog';
import { ReceiveStockDialog } from '../../../src/components/medicines/ReceiveStockDialog';
import { renderWithChakra } from '../../test-utils';
import { batch, MEDICINE_ID, medicine } from './fixtures';

const pushMock = jest.fn();

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));
jest.mock('@/actions/medicines', () => ({
  createMedicineAction: jest.fn(),
  updateMedicineAction: jest.fn(),
  receiveStockAction: jest.fn(),
}));
// The camera is replaced by a button that "reads" a code.
jest.mock('@/components/scan/LazyCameraScanner', () => ({
  LazyCameraScanner: ({ onDetected }: { onDetected: (code: string) => void }) => (
    <button type="button" onClick={() => onDetected('4800123456789')}>
      Fake camera
    </button>
  ),
}));

const createMock = createMedicineAction as jest.Mock;
const updateMock = updateMedicineAction as jest.Mock;
const receiveMock = receiveStockAction as jest.Mock;

function field(label: string | RegExp) {
  return screen.getByLabelText(label) as HTMLInputElement;
}

function type(label: string | RegExp, value: string) {
  fireEvent.change(field(label), { target: { value } });
}

async function open(trigger: string) {
  fireEvent.click(screen.getByRole('button', { name: trigger }));
  await screen.findByRole('dialog');
}

function button(name: string | RegExp) {
  return screen.getByRole('button', { name }) as HTMLButtonElement;
}

let toastMock: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  toastMock = jest.spyOn(toaster, 'create').mockReturnValue('toast-id');
});

afterEach(() => {
  toastMock.mockRestore();
});

describe('MedicineFormDialog', () => {
  it('creates a medicine and goes to its page', async () => {
    createMock.mockResolvedValue({ success: true, data: { id: MEDICINE_ID } });
    renderWithChakra(<MedicineFormDialog />);

    await open('New medicine');
    type(/^Name/, 'Paracetamol');
    fireEvent.click(button('Create'));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith(`/medicines/${MEDICINE_ID}`));
    expect(createMock).toHaveBeenCalledWith({
      name: 'Paracetamol',
      genericName: '',
      strength: '',
      dosageForm: '',
      unit: 'pc',
      productBarcode: '',
    });
    expect(toastMock).toHaveBeenCalledWith({ type: 'success', title: 'Medicine created' });
  });

  it('fills the product barcode from the camera', async () => {
    createMock.mockResolvedValue({ success: true, data: { id: MEDICINE_ID } });
    renderWithChakra(<MedicineFormDialog />);

    await open('New medicine');
    fireEvent.click(button('Scan'));
    fireEvent.click(button('Fake camera'));

    expect(field('Product barcode').value).toBe('4800123456789');
    expect(screen.queryByRole('button', { name: 'Fake camera' })).toBeNull();
  });

  it('prefills the product barcode from /scan', async () => {
    renderWithChakra(
      <MedicineFormDialog defaultProductBarcode="012345678905" triggerLabel="Add medicine" />,
    );

    await open('Add medicine');

    expect(field('Product barcode').value).toBe('012345678905');
  });

  it('shows field errors from the action under their inputs', async () => {
    createMock.mockResolvedValue({
      success: false,
      error: {
        code: 'PRODUCT_BARCODE_DUPLICATE',
        message: 'Another medicine already has this product barcode.',
        fields: { productBarcode: ['Another medicine already has this product barcode.'] },
      },
    });
    renderWithChakra(<MedicineFormDialog />);

    await open('New medicine');
    type(/^Name/, 'Paracetamol');
    fireEvent.click(button('Create'));

    expect(
      await screen.findByText('Another medicine already has this product barcode.'),
    ).toBeTruthy();
    expect(toastMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('shows a duplicate medicine under the name', async () => {
    createMock.mockResolvedValue({
      success: false,
      error: { code: 'MEDICINE_DUPLICATE', message: 'A medicine with this name already exists.' },
    });
    renderWithChakra(<MedicineFormDialog />);

    await open('New medicine');
    type(/^Name/, 'Paracetamol');
    fireEvent.click(button('Create'));

    expect(await screen.findByText('A medicine with this name already exists.')).toBeTruthy();
  });

  it('shows other errors as a toast', async () => {
    createMock.mockResolvedValue({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
    });
    renderWithChakra(<MedicineFormDialog />);

    await open('New medicine');
    fireEvent.click(button('Create'));

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith({
        type: 'error',
        title: 'Something went wrong. Please try again.',
      }),
    );
  });

  it('keeps Save disabled until something changes and sends only the change', async () => {
    updateMock.mockResolvedValue({ success: true, data: medicine() });
    renderWithChakra(<MedicineFormDialog medicine={medicine()} />);

    await open('Edit');
    expect(field(/^Name/).value).toBe('Paracetamol');
    expect(button('Save').disabled).toBe(true);

    type('Strength', '650 mg');
    expect(button('Save').disabled).toBe(false);
    fireEvent.click(button('Save'));

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith({ type: 'success', title: 'Medicine updated' }),
    );
    expect(updateMock).toHaveBeenCalledWith(MEDICINE_ID, { strength: '650 mg' });
  });
});

describe('ReceiveStockDialog', () => {
  const TODAY = '2026-11-08';

  async function fillAndSubmit(expirationDate: string) {
    await open('Receive stock');
    type(/^Batch number/, 'P778');
    type(/^Expiration date/, expirationDate);
    type(/^Quantity/, '20');
    fireEvent.click(button('Receive'));
  }

  it('warns when the batch is already expired but still saves', async () => {
    receiveMock.mockResolvedValue({
      success: true,
      data: { batch: batch(), created: true },
    });
    renderWithChakra(<ReceiveStockDialog medicineId={MEDICINE_ID} today={TODAY} />);

    await open('Receive stock');
    type(/^Expiration date/, '2026-11-07');
    expect(screen.getByText('This batch is already expired.')).toBeTruthy();
    type(/^Expiration date/, TODAY);
    expect(screen.queryByText('This batch is already expired.')).toBeNull();
  });

  it.each([
    [true, 'New batch P778 created'],
    [false, 'Added to batch P778'],
  ])('with created=%s shows "%s"', async (created, title) => {
    receiveMock.mockResolvedValue({ success: true, data: { batch: batch(), created } });
    renderWithChakra(<ReceiveStockDialog medicineId={MEDICINE_ID} today={TODAY} />);

    await fillAndSubmit('2026-11-01');

    await waitFor(() => expect(toastMock).toHaveBeenCalledWith({ type: 'success', title }));
    expect(receiveMock).toHaveBeenCalledWith(MEDICINE_ID, {
      batchNumber: 'P778',
      expirationDate: '2026-11-01',
      quantity: 20,
      notes: '',
    });
  });

  it('shows the quantity error from the action', async () => {
    receiveMock.mockResolvedValue({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'The request is invalid.',
        fields: { quantity: ['Enter a whole number from 1 to 1,000,000.'] },
      },
    });
    renderWithChakra(<ReceiveStockDialog medicineId={MEDICINE_ID} today={TODAY} />);

    await fillAndSubmit('2027-01-31');

    expect(await screen.findByText('Enter a whole number from 1 to 1,000,000.')).toBeTruthy();
  });
});
