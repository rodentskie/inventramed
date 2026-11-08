import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { lookupBarcodeAction } from '../../../src/actions/scan';
import CameraScanner, {
  CAMERA_MESSAGES,
  getCameraErrorMessage,
} from '../../../src/components/scan/CameraScanner';
import { ScanView } from '../../../src/components/scan/ScanView';
import { renderWithChakra } from '../../test-utils';
import { batch, medicine } from '../medicines/fixtures';

interface FakeScannerProps {
  onCapture: (barcodes: { rawValue: string }[]) => void;
  onCameraError: (error: Error) => void;
}

jest.mock('react-barcode-scanner/polyfill', () => ({}));
jest.mock('react-barcode-scanner', () => ({
  BarcodeScanner: ({ onCapture, onCameraError }: FakeScannerProps) => (
    <div>
      <button onClick={() => onCapture([{ rawValue: ' 4800123456789 ' }])}>Capture</button>
      <button onClick={() => onCameraError(Object.assign(new Error('denied'), { name: 'NotAllowedError' }))}>
        Deny
      </button>
    </div>
  ),
}));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/actions/scan', () => ({ lookupBarcodeAction: jest.fn() }));
jest.mock('@/actions/medicines', () => ({ createMedicineAction: jest.fn() }));
jest.mock('@/components/common/Barcode', () => ({
  Barcode: ({ value }: { value: string }): ReactNode => value,
}));
jest.mock('@/components/scan/LazyCameraScanner', () => ({
  LazyCameraScanner: ({ onDetected }: { onDetected: (code: string) => void }) => (
    <button onClick={() => onDetected('BAT-91XZ4KD0Q7M2')}>Fake camera</button>
  ),
}));

const lookupMock = lookupBarcodeAction as jest.Mock;

describe('getCameraErrorMessage', () => {
  it.each([
    ['NotAllowedError', '', CAMERA_MESSAGES.blocked],
    ['NotFoundError', '', CAMERA_MESSAGES.missing],
    ['OverconstrainedError', '', CAMERA_MESSAGES.missing],
    ['Error', '[react-barcode-scanner]: getUserMedia requires a secure origin such as HTTPS', CAMERA_MESSAGES.insecure],
    ['NotReadableError', 'in use', CAMERA_MESSAGES.failed],
  ])('maps %s %s', (name, message, expected) => {
    expect(getCameraErrorMessage(Object.assign(new Error(message), { name }))).toBe(expected);
  });
});

describe('CameraScanner', () => {
  it('reports the first code once, trimmed', () => {
    const onDetected = jest.fn();
    renderWithChakra(<CameraScanner onDetected={onDetected} />);

    fireEvent.click(screen.getByRole('button', { name: 'Capture' }));
    fireEvent.click(screen.getByRole('button', { name: 'Capture' }));

    expect(onDetected).toHaveBeenCalledTimes(1);
    expect(onDetected).toHaveBeenCalledWith('4800123456789');
  });

  it('shows camera errors inline', () => {
    renderWithChakra(<CameraScanner onDetected={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Deny' }));

    expect(screen.getByRole('alert').textContent).toBe(CAMERA_MESSAGES.blocked);
  });
});

describe('ScanView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function lookUpTyped(code: string) {
    fireEvent.change(screen.getByLabelText('Or enter a barcode'), { target: { value: code } });
    fireEvent.submit(screen.getByLabelText('Or enter a barcode').closest('form') as HTMLFormElement);
  }

  it('starts with the camera off', () => {
    renderWithChakra(<ScanView timezone="Asia/Manila" canCreate />);

    expect(screen.getByText('Camera is off')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Fake camera' })).toBeNull();
  });

  it('looks up a typed code on Enter and shows the medicine', async () => {
    lookupMock.mockResolvedValue({ success: true, data: { kind: 'product', medicine: medicine() } });
    renderWithChakra(<ScanView timezone="Asia/Manila" canCreate={false} />);

    lookUpTyped('4800123456789');

    expect(await screen.findByRole('heading', { name: 'Paracetamol 500 mg' })).toBeTruthy();
    expect(lookupMock).toHaveBeenCalledWith('4800123456789');
    expect(screen.getByRole('link', { name: /Open medicine/ }).getAttribute('href')).toBe(
      `/medicines/${medicine().id}`,
    );
  });

  it('turns the camera off after a read and highlights the scanned batch', async () => {
    lookupMock.mockResolvedValue({
      success: true,
      data: { kind: 'batch', batchId: 'batch-1', medicine: medicine({ batches: [batch()] }) },
    });
    renderWithChakra(<ScanView timezone="Asia/Manila" canCreate={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Start camera' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fake camera' }));

    expect(await screen.findByText('Batch P778 · Expires 2026-11-12')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Fake camera' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Scan again' })).toBeTruthy();
    expect(screen.getByText('P778').closest('tr')?.getAttribute('aria-current')).toBe('true');
  });

  it('offers to add a medicine for an unknown product code', async () => {
    lookupMock.mockResolvedValue({
      success: false,
      error: { code: 'NOT_FOUND', message: 'The requested resource was not found.' },
    });
    renderWithChakra(<ScanView timezone="Asia/Manila" canCreate />);

    lookUpTyped('4800123456789');

    expect(await screen.findByText('No medicine has this barcode.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add medicine' })).toBeTruthy();
  });

  it.each([
    ['without medicine:write', '4800123456789', false],
    ['for an app barcode', 'MED-7Q2K0000AAAA', true],
  ])('does not offer to add a medicine %s', async (_name, code, canCreate) => {
    lookupMock.mockResolvedValue({
      success: false,
      error: { code: 'NOT_FOUND', message: 'The requested resource was not found.' },
    });
    renderWithChakra(<ScanView timezone="Asia/Manila" canCreate={canCreate} />);

    lookUpTyped(code);

    await screen.findByText('No medicine has this barcode.');
    expect(screen.queryByRole('button', { name: 'Add medicine' })).toBeNull();
  });

  it('shows validation errors under the input', async () => {
    lookupMock.mockResolvedValue({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'The request is invalid.',
        fields: { code: ['Enter a barcode.'] },
      },
    });
    renderWithChakra(<ScanView timezone="Asia/Manila" canCreate />);

    lookUpTyped('');

    await waitFor(() => expect(screen.getByText('Enter a barcode.')).toBeTruthy());
  });
});
