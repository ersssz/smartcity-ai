import { requireNativeModule } from 'expo-modules-core';
import { AppState } from 'react-native';

export interface NativeWalkState {
  status: 'stopped' | 'starting' | 'running' | 'error';
  generation: number;
  foreground: boolean;
  subscribed: boolean;
  precision: 'denied' | 'coarse' | 'fine';
  providerEnabled: boolean;
  notificationsEnabled: boolean;
  fixStatus: 'no-fix' | 'fresh' | 'stale';
  lastFixAgeMs: number | null;
  accuracyMeters: number | null;
  fixTimestampMs: number | null;
  sampleCount: number;
  errorCode: string | null;
}

export interface NativeWalkLocation {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  timestampMs: number;
  generation: number;
}

type Subscription = { remove(): void };
type LocationSignal = { generation: number };
interface NativeModule {
  start(): Promise<NativeWalkState>;
  stop(): Promise<NativeWalkState>;
  getState(): Promise<NativeWalkState>;
  getCurrentLocation(generation: number): NativeWalkLocation | null;
  addListener(name: 'onStateChanged', listener: (state: NativeWalkState) => void): Subscription;
  addListener(name: 'onLocation', listener: (signal: LocationSignal) => void): Subscription;
}
const module = requireNativeModule<NativeModule>('AstanaActiveWalk');

function addListener(name: 'onStateChanged', listener: (state: NativeWalkState) => void): Subscription;
function addListener(name: 'onLocation', listener: (fix: NativeWalkLocation) => void): Subscription;
function addListener(
  name: 'onStateChanged' | 'onLocation',
  listener: ((state: NativeWalkState) => void) | ((fix: NativeWalkLocation) => void),
): Subscription {
  if (name === 'onStateChanged') {
    return module.addListener(name, listener as (state: NativeWalkState) => void);
  }
  return module.addListener('onLocation', signal => {
    if (AppState.currentState !== 'active') return;
    // The asynchronous signal has no coordinates. This synchronous native read checks the
    // current generation, main-observed Activity visibility and freshness; no old fix is replayed.
    const fix = module.getCurrentLocation(signal.generation);
    if (fix && AppState.currentState === 'active') {
      (listener as (fix: NativeWalkLocation) => void)(fix);
    }
  });
}

export const nativeActiveWalk = {
  start: (): Promise<NativeWalkState> => module.start(),
  stop: (): Promise<NativeWalkState> => module.stop(),
  getState: (): Promise<NativeWalkState> => module.getState(),
  addListener,
};
