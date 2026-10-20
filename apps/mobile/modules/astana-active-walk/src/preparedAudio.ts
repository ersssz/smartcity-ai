import { requireNativeModule } from 'expo-modules-core';

export interface PreparedAudioState {
  status: 'stopped' | 'loading' | 'playing' | 'paused' | 'error';
  assetId: string | null;
  positionMs: number;
  durationMs: number;
  errorCode: string | null;
  generation: number;
}
type Subscription = { remove(): void };
interface NativePreparedAudio {
  preparedAudioPlay(assetPath: string, expectedSha256: string): Promise<unknown>;
  preparedAudioPause(): Promise<unknown>;
  preparedAudioStop(): Promise<unknown>;
  preparedAudioGetState(): Promise<unknown>;
  addListener(name: 'onPreparedAudioState', listener: (state: unknown) => void): Subscription;
}
const native = requireNativeModule<NativePreparedAudio>('AstanaActiveWalk');
const sha = /^[a-f0-9]{64}$/;
const path = /^astana-audio\/([a-f0-9]{64})\.mp3$/;
let latestGeneration = -1;

function checked(value: unknown): PreparedAudioState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_PREPARED_AUDIO_STATE');
  const v = value as Record<string, unknown>;
  const statuses = ['stopped', 'loading', 'playing', 'paused', 'error'];
  if (typeof v.status !== 'string' || !statuses.includes(v.status)
      || !(v.assetId === null || typeof v.assetId === 'string' && /^audio-[a-f0-9]{64}$/.test(v.assetId))
      || !Number.isSafeInteger(v.positionMs) || Number(v.positionMs) < 0
      || !Number.isSafeInteger(v.durationMs) || Number(v.durationMs) < 0
      || !Number.isSafeInteger(v.generation) || Number(v.generation) < 0
      || !(v.errorCode === null || typeof v.errorCode === 'string' && /^[A-Z0-9_]{1,100}$/.test(v.errorCode))) {
    throw new Error('INVALID_PREPARED_AUDIO_STATE');
  }
  latestGeneration = Math.max(latestGeneration, Number(v.generation));
  return { status: v.status as PreparedAudioState['status'], assetId: v.assetId as string | null,
    positionMs: Number(v.positionMs), durationMs: Number(v.durationMs), errorCode: v.errorCode as string | null,
    generation: Number(v.generation) };
}

/** Explicit user commands only. No system speech, URI or network fallback. */
export const nativePreparedAudio = {
  async play(assetPath: string, expectedSha256: string): Promise<PreparedAudioState> {
    const match = typeof assetPath === 'string' ? path.exec(assetPath) : null;
    if (!match) throw new Error('INVALID_ASSET_PATH');
    if (typeof expectedSha256 !== 'string' || !sha.test(expectedSha256) || match[1] !== expectedSha256) throw new Error('SHA256_MISMATCH');
    if (typeof native.preparedAudioPlay !== 'function') throw new Error('PREPARED_AUDIO_NATIVE_UNAVAILABLE');
    return checked(await native.preparedAudioPlay(assetPath, expectedSha256));
  },
  async pause(): Promise<PreparedAudioState> { return checked(await native.preparedAudioPause()); },
  async stop(): Promise<PreparedAudioState> { return checked(await native.preparedAudioStop()); },
  async getState(): Promise<PreparedAudioState> { return checked(await native.preparedAudioGetState()); },
  addListener(listener: (state: PreparedAudioState) => void): Subscription {
    return native.addListener('onPreparedAudioState', value => {
      const before = latestGeneration;
      const state = checked(value);
      if (state.generation >= before) listener(state);
    });
  },
};

export const preparedAudio = nativePreparedAudio;
