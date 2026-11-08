import { create } from 'zustand';
import type { MovementAction } from '@/types/inventory';
import type { ScanResult } from '@/types/medicine';

export type ScanOutcome =
  | { kind: 'idle' }
  | { kind: 'found'; code: string; result: ScanResult }
  | { kind: 'not-found'; code: string };

interface ScanState {
  cameraOn: boolean;
  outcome: ScanOutcome;
  openAction: MovementAction | null;
  setCameraOn: (cameraOn: boolean) => void;
  /** Closes any open action, since it belonged to the previous result. */
  setOutcome: (outcome: ScanOutcome) => void;
  setOpenAction: (openAction: MovementAction | null) => void;
  reset: () => void;
}

const INITIAL_STATE = {
  cameraOn: false,
  outcome: { kind: 'idle' } as ScanOutcome,
  openAction: null,
};

/** The state of `/scan`. `ScanView` resets it on unmount, so an old result doesn't come back. */
export const useScanStore = create<ScanState>()((set) => ({
  ...INITIAL_STATE,
  setCameraOn: (cameraOn) => set({ cameraOn }),
  setOutcome: (outcome) => set({ outcome, openAction: null }),
  setOpenAction: (openAction) => set({ openAction }),
  reset: () => set(INITIAL_STATE),
}));
