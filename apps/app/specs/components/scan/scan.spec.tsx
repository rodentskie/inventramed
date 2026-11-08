import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { BrowserMultiFormatOneDReader } from '@zxing/browser';
import { DecodeHintType, NotFoundException } from '@zxing/library';
import { type ReactNode, StrictMode } from 'react';
import { lookupBarcodeAction } from '../../../src/actions/scan';
import CameraScanner from '../../../src/components/scan/CameraScanner';
import { ScanView } from '../../../src/components/scan/ScanView';
import { CAMERA_MESSAGES, getCameraErrorMessage } from '../../../src/hooks/use-barcode-camera';
import { useScanStore } from '../../../src/stores/scan-store';
import { renderWithChakra } from '../../test-utils';
import { batch, medicine } from '../medicines/fixtures';

type DecodeCallback = (
  result: { getText: () => string } | undefined,
  error: Error | undefined,
  controls: { stop: () => void },
) => void;

const decodeMock = jest.fn();
const listDevicesMock = jest.fn();

jest.mock('@zxing/browser', () => ({
  BrowserMultiFormatOneDReader: jest.fn().mockImplementation(() => ({
    decodeFromConstraints: decodeMock,
  })),
  BrowserCodeReader: {
    listVideoInputDevices: () => listDevicesMock(),
  },
}));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/actions/scan', () => ({ lookupBarcodeAction: jest.fn() }));
jest.mock('@/actions/medicines', () => ({
  createMedicineAction: jest.fn(),
  receiveStockAction: jest.fn(),
}));
jest.mock('@/actions/inventory', () => ({
  dispenseAction: jest.fn(),
  disposeExpiredAction: jest.fn(),
  recordMovementAction: jest.fn(),
}));
jest.mock('@/components/common/Barcode', () => ({
  Barcode: ({ value }: { value: string }): ReactNode => value,
}));
jest.mock('@/components/scan/LazyCameraScanner', () => ({
  LazyCameraScanner: ({ onDetected }: { onDetected: (code: string) => void }) => (
    <button onClick={() => onDetected('BAT-91XZ4KD0Q7M2')}>Fake camera</button>
  ),
}));

const lookupMock = lookupBarcodeAction as jest.Mock;

const stopMock = jest.fn();

function setSecureContext(secure: boolean) {
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: secure });
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: secure ? { getUserMedia: jest.fn() } : undefined,
  });
}

// jsdom doesn't have it, and the hook checks the preview's stream against it.
beforeAll(() => {
  Object.defineProperty(globalThis, 'MediaStream', { configurable: true, value: class {} });
});

describe('getCameraErrorMessage', () => {
  it.each([
    ['NotAllowedError', CAMERA_MESSAGES.blocked],
    ['SecurityError', CAMERA_MESSAGES.blocked],
    ['NotFoundError', CAMERA_MESSAGES.missing],
    ['OverconstrainedError', CAMERA_MESSAGES.missing],
    ['NotReadableError', CAMERA_MESSAGES.failed],
  ])('maps %s', (name, expected) => {
    expect(getCameraErrorMessage(Object.assign(new Error('x'), { name }))).toBe(expected);
  });
});

describe('CameraScanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setSecureContext(true);
    decodeMock.mockResolvedValue({ stop: stopMock });
    listDevicesMock.mockResolvedValue([]);
  });

  async function renderScanner(onDetected = jest.fn()) {
    const view = renderWithChakra(<CameraScanner onDetected={onDetected} />);
    await waitFor(() => expect(listDevicesMock).toHaveBeenCalled());
    return view;
  }

  function read(text: string) {
    const callback = decodeMock.mock.calls[0][2] as DecodeCallback;
    act(() => callback({ getText: () => text }, undefined, { stop: stopMock }));
  }

  it('asks for the rear camera and limits the formats', async () => {
    await renderScanner();

    const [[hints]] = (BrowserMultiFormatOneDReader as unknown as jest.Mock).mock.calls;
    expect(hints.get(DecodeHintType.POSSIBLE_FORMATS)).toHaveLength(7);
    expect(hints.get(DecodeHintType.TRY_HARDER)).toBe(true);
    expect(decodeMock.mock.calls[0][0].video.facingMode).toBe('environment');
  });

  it('reports the first code once, trimmed, and stops the camera', async () => {
    const onDetected = jest.fn();
    await renderScanner(onDetected);

    read(' 4800123456789 ');
    read('4800123456789');

    expect(onDetected).toHaveBeenCalledTimes(1);
    expect(onDetected).toHaveBeenCalledWith('4800123456789');
    expect(stopMock).toHaveBeenCalled();
  });

  it('stops the camera on unmount', async () => {
    const { unmount } = await renderScanner();

    unmount();

    expect(stopMock).toHaveBeenCalled();
  });

  it('stops a camera that finishes starting after unmount', async () => {
    let started: (controls: { stop: () => void }) => void = () => undefined;
    decodeMock.mockReturnValue(new Promise((resolve) => (started = resolve)));
    const { unmount } = renderWithChakra(<CameraScanner onDetected={jest.fn()} />);
    await waitFor(() => expect(decodeMock).toHaveBeenCalled());

    unmount();
    await act(async () => started({ stop: stopMock }));

    expect(stopMock).toHaveBeenCalled();
  });

  it('opens the camera once under Strict Mode', async () => {
    renderWithChakra(
      <StrictMode>
        <CameraScanner onDetected={jest.fn()} />
      </StrictMode>,
    );

    await waitFor(() => expect(listDevicesMock).toHaveBeenCalled());

    expect(decodeMock).toHaveBeenCalledTimes(1);
    expect(stopMock).not.toHaveBeenCalled();
  });

  it('waits for the last start to finish before the next one', async () => {
    listDevicesMock.mockResolvedValue([
      { deviceId: 'back', label: 'Back' },
      { deviceId: 'front', label: 'Front' },
    ]);
    await renderScanner();
    let started: (controls: { stop: () => void }) => void = () => undefined;
    const firstStop = jest.fn();
    decodeMock.mockReturnValueOnce(new Promise((resolve) => (started = resolve)));
    const picker = await screen.findByLabelText('Camera');

    fireEvent.change(picker, { target: { value: 'front' } });
    await waitFor(() => expect(decodeMock).toHaveBeenCalledTimes(2));
    fireEvent.change(picker, { target: { value: 'back' } });
    await act(async () => undefined);
    expect(decodeMock).toHaveBeenCalledTimes(2);

    await act(async () => started({ stop: firstStop }));

    expect(firstStop).toHaveBeenCalled();
    await waitFor(() => expect(decodeMock).toHaveBeenCalledTimes(3));
    expect(decodeMock.mock.calls[2][0].video.deviceId).toEqual({ exact: 'back' });
  });

  it('keeps scanning past a frame with no code', async () => {
    await renderScanner();
    const callback = decodeMock.mock.calls[0][2];

    act(() => callback(undefined, new NotFoundException(), { stop: stopMock }));

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows an error when the scan ends on its own', async () => {
    await renderScanner();
    const callback = decodeMock.mock.calls[0][2];

    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    act(() => callback(undefined, new Error('video gone'), { stop: stopMock }));

    expect(screen.getByRole('alert').textContent).toBe(CAMERA_MESSAGES.failed);
  });

  it.each([
    ['NotAllowedError', CAMERA_MESSAGES.blocked],
    ['NotFoundError', CAMERA_MESSAGES.missing],
  ])('shows %s inline', async (name, message) => {
    decodeMock.mockRejectedValue(Object.assign(new Error('x'), { name }));
    renderWithChakra(<CameraScanner onDetected={jest.fn()} />);

    expect((await screen.findByRole('alert')).textContent).toBe(message);
  });

  it('explains the camera needs HTTPS outside a secure context', () => {
    setSecureContext(false);
    renderWithChakra(<CameraScanner onDetected={jest.fn()} />);

    expect(screen.getByRole('alert').textContent).toBe(CAMERA_MESSAGES.insecure);
    expect(decodeMock).not.toHaveBeenCalled();
  });

  it('offers a picker with several cameras, and restarts on the chosen one', async () => {
    listDevicesMock.mockResolvedValue([
      { deviceId: 'back', label: 'Back' },
      { deviceId: 'front', label: 'Front' },
    ]);
    await renderScanner();

    fireEvent.change(await screen.findByLabelText('Camera'), { target: { value: 'front' } });

    await waitFor(() => expect(decodeMock).toHaveBeenCalledTimes(2));
    expect(decodeMock.mock.calls[1][0].video.deviceId).toEqual({ exact: 'front' });
    expect(stopMock).toHaveBeenCalled();
  });

  it('has no picker with one camera', async () => {
    listDevicesMock.mockResolvedValue([{ deviceId: 'only', label: 'Only' }]);
    await renderScanner();

    expect(screen.queryByLabelText('Camera')).toBeNull();
  });
});

describe('ScanView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useScanStore.getState().reset();
  });

  function lookUpTyped(code: string) {
    fireEvent.change(screen.getByLabelText('Or enter a barcode'), { target: { value: code } });
    fireEvent.submit(screen.getByLabelText('Or enter a barcode').closest('form') as HTMLFormElement);
  }

  it('starts with the camera off', () => {
    renderWithChakra(<ScanView timezone="Asia/Manila" canCreate canMove={false} canReceive={false} />);

    expect(screen.getByText('Camera is off')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Fake camera' })).toBeNull();
  });

  it('looks up a typed code on Enter and shows the medicine', async () => {
    lookupMock.mockResolvedValue({ success: true, data: { kind: 'product', medicine: medicine() } });
    renderWithChakra(<ScanView timezone="Asia/Manila" canCreate={false} canMove={false} canReceive={false} />);

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
    renderWithChakra(<ScanView timezone="Asia/Manila" canCreate={false} canMove={false} canReceive={false} />);

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
    renderWithChakra(<ScanView timezone="Asia/Manila" canCreate canMove={false} canReceive={false} />);

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
    renderWithChakra(<ScanView timezone="Asia/Manila" canCreate={canCreate} canMove={false} canReceive={false} />);

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
    renderWithChakra(<ScanView timezone="Asia/Manila" canCreate canMove={false} canReceive={false} />);

    lookUpTyped('');

    await waitFor(() => expect(screen.getByText('Enter a barcode.')).toBeTruthy());
  });

  const found = (data: object) => ({ success: true, data });
  const expiredBatch = batch({ status: 'EXPIRED', daysToExpiry: -2, quantity: 20 });

  function renderView(canMove: boolean, canReceive = false) {
    return renderWithChakra(
      <ScanView timezone="Asia/Manila" canCreate={false} canMove={canMove} canReceive={canReceive} />,
    );
  }

  it('shows Dispense and the expired note for a medicine or product code', async () => {
    lookupMock.mockResolvedValue(
      found({ kind: 'product', medicine: medicine({ batches: [expiredBatch] }) }),
    );
    renderView(true);

    lookUpTyped('4800123456789');

    expect(await screen.findByRole('button', { name: 'Dispense' })).toBeTruthy();
    expect(screen.getByText('20 pc expired, not dispensable.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Count' })).toBeNull();
  });

  it('shows the batch actions for a batch code, with receive needing both permissions', async () => {
    lookupMock.mockResolvedValue(found({ kind: 'batch', batchId: 'batch-1', medicine: medicine() }));
    renderView(true);

    lookUpTyped('BAT-91XZ4KD0Q7M2');

    await screen.findByRole('button', { name: 'Count' });
    for (const name of ['Damaged', 'Lost', 'Returned']) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
    expect(screen.queryByRole('button', { name: 'Receive more' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Dispense' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Dispose expired' })).toBeNull();
  });

  it('only offers Dispose expired for an expired batch with stock', async () => {
    lookupMock.mockResolvedValue(
      found({ kind: 'batch', batchId: 'batch-1', medicine: medicine({ batches: [expiredBatch] }) }),
    );
    renderView(true, true);

    lookUpTyped('BAT-91XZ4KD0Q7M2');

    expect(await screen.findByRole('button', { name: 'Dispose expired' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Receive more' })).toBeTruthy();
  });

  it.each([
    ['medicine', { kind: 'medicine', medicine: medicine() }],
    ['batch', { kind: 'batch', batchId: 'batch-1', medicine: medicine() }],
  ])('hides every action on a %s without inventory:write', async (_name, data) => {
    lookupMock.mockResolvedValue(found(data));
    renderView(false);

    lookUpTyped('MED-7Q2K0000AAAA');

    await screen.findByRole('heading', { name: 'Paracetamol 500 mg' });
    for (const name of ['Dispense', 'Count', 'Damaged', 'Lost', 'Returned', 'Dispose expired']) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
  });

  it('runs the lookup again after a movement, so the stock is current', async () => {
    const { dispenseAction } = jest.requireMock('@/actions/inventory');
    dispenseAction.mockResolvedValue({ success: true, data: { quantity: 5 } });
    lookupMock.mockResolvedValue(found({ kind: 'medicine', medicine: medicine() }));
    renderView(true);

    lookUpTyped('MED-7Q2K0000AAAA');
    fireEvent.click(await screen.findByRole('button', { name: 'Dispense' }));
    fireEvent.change(screen.getByLabelText(/Quantity/), { target: { value: '5' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Dispense' }).at(-1) as HTMLElement);

    await waitFor(() => expect(lookupMock).toHaveBeenCalledTimes(2));
    expect(lookupMock).toHaveBeenLastCalledWith('MED-7Q2K0000AAAA');
    expect(useScanStore.getState().openAction).toBeNull();
  });

  it('ignores an older lookup that finishes after a newer one', async () => {
    let finishFirst: (value: object) => void = () => undefined;
    lookupMock
      .mockReturnValueOnce(new Promise((resolve) => (finishFirst = resolve)))
      .mockResolvedValueOnce(found({ kind: 'medicine', medicine: medicine({ name: 'Newer' }) }));
    renderView(false);

    lookUpTyped('MED-OLD');
    fireEvent.click(screen.getByRole('button', { name: 'Start camera' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fake camera' }));
    await screen.findByRole('heading', { name: 'Newer 500 mg' });
    await act(async () => finishFirst(found({ kind: 'medicine', medicine: medicine({ name: 'Older' }) })));

    expect(screen.getByRole('heading', { name: 'Newer 500 mg' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Older 500 mg' })).toBeNull();
  });

  it('clears the store when leaving the page', async () => {
    lookupMock.mockResolvedValue(found({ kind: 'medicine', medicine: medicine() }));
    const { unmount } = renderView(false);
    lookUpTyped('MED-7Q2K0000AAAA');
    await screen.findByRole('heading', { name: 'Paracetamol 500 mg' });

    unmount();

    expect(useScanStore.getState().outcome).toEqual({ kind: 'idle' });
  });
});
