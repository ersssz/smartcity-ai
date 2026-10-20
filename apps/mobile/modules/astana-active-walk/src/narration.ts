import { requireNativeModule } from 'expo-modules-core';

export type NarrationScope = Readonly<{
  host: Readonly<{ processNonce: string; requestEpoch: number }>;
  audio: Readonly<{ processId: string; playbackEpoch: number }> | null;
}>;
export type NarrationRef = Readonly<{
  walkSessionId: string; bundleSha256: string; narrationId: string; locale: 'ru' | 'kk' | 'en'; assetPath: string; assetSha256: string;
}>;
export type NarrationState = Readonly<{
  status: 'stopped' | 'loading' | 'playing' | 'paused' | 'error'; assetId: string | null;
  positionMs: number; durationMs: number; errorCode: string | null; generation: number;
  hostScope: NarrationScope['host']; audioScope: NarrationScope['audio'];
  hostPhase: 'ABSENT' | 'STARTING' | 'RUNNING' | 'STOPPING' | 'ERROR';
  canResume: boolean; pausedReason: string | null; serviceForeground: boolean; ref: NarrationRef | null;
}>;
type Subscription = { remove(): void };
interface NativeNarration {
  narrationCaptureScope(): unknown;
  narrationPlay(captured: NarrationScope, ref: NarrationRef): Promise<unknown>;
  narrationPause(captured: NarrationScope): Promise<unknown>;
  narrationResume(captured: NarrationScope): Promise<unknown>;
  narrationStop(): Promise<unknown>;
  narrationGetState(): Promise<unknown>;
  addListener(name: 'onNarrationState', listener: (state: unknown) => void): Subscription;
}
const native = requireNativeModule<NativeNarration>('AstanaActiveWalk');
const hex = /^[a-f0-9]{64}$/;
const identifier = /^[A-Za-z0-9:_-]{1,128}$/;
const code = /^[A-Z0-9_]{1,100}$/;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const keys = (value: Record<string, unknown>, expected: readonly string[]) => Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));
const nullableCode = (value: unknown) => value === null || typeof value === 'string' && code.test(value);
let latestGeneration = -1;

function checkedScope(value: unknown): NarrationScope {
  const invalid = () => { throw new Error('INVALID_NARRATION_SCOPE'); };
  if (!object(value) || !keys(value, ['host', 'audio']) || !object(value.host)
    || !keys(value.host, ['processNonce', 'requestEpoch']) || typeof value.host.processNonce !== 'string'
    || !identifier.test(value.host.processNonce) || !integer(value.host.requestEpoch)) return invalid();
  let audio: NarrationScope['audio'] = null;
  if (value.audio !== null) {
    if (!object(value.audio) || !keys(value.audio, ['processId', 'playbackEpoch']) || typeof value.audio.processId !== 'string'
      || !identifier.test(value.audio.processId) || !integer(value.audio.playbackEpoch)) return invalid();
    audio = Object.freeze({ processId: value.audio.processId, playbackEpoch: value.audio.playbackEpoch });
  }
  return Object.freeze({ host: Object.freeze({ processNonce: value.host.processNonce, requestEpoch: value.host.requestEpoch }), audio });
}
function checkedRef(value: unknown): NarrationRef {
  if (!object(value) || !keys(value, ['walkSessionId', 'bundleSha256', 'narrationId', 'locale', 'assetPath', 'assetSha256'])
    || typeof value.walkSessionId !== 'string' || !/^[A-Za-z0-9:._-]{1,128}$/.test(value.walkSessionId)
    || typeof value.bundleSha256 !== 'string' || !hex.test(value.bundleSha256)
    || typeof value.narrationId !== 'string' || !/^[A-Za-z0-9:_-]{1,160}$/.test(value.narrationId)
    || !['ru', 'kk', 'en'].includes(String(value.locale)) || !value.narrationId.endsWith(`:${value.locale}`)
    || typeof value.assetSha256 !== 'string' || !hex.test(value.assetSha256)
    || value.assetPath !== `astana-audio/${value.assetSha256}.mp3`) throw new Error('INVALID_NARRATION_REF');
  return Object.freeze({ walkSessionId: value.walkSessionId, bundleSha256: value.bundleSha256, narrationId: value.narrationId,
    locale: value.locale as NarrationRef['locale'], assetPath: value.assetPath as string, assetSha256: value.assetSha256 });
}
export function sameNarration(first: NarrationRef | null | undefined, second: NarrationRef | null | undefined): boolean {
  return !!first && !!second && first.walkSessionId === second.walkSessionId && first.bundleSha256 === second.bundleSha256
    && first.narrationId === second.narrationId && first.locale === second.locale && first.assetPath === second.assetPath && first.assetSha256 === second.assetSha256;
}
function checkedState(value: unknown): NarrationState {
  try {
    if (!object(value) || !keys(value, ['status', 'assetId', 'positionMs', 'durationMs', 'errorCode', 'generation', 'hostScope', 'audioScope', 'hostPhase', 'canResume', 'pausedReason', 'serviceForeground', 'ref'])
      || !['stopped', 'loading', 'playing', 'paused', 'error'].includes(String(value.status))
      || !['ABSENT', 'STARTING', 'RUNNING', 'STOPPING', 'ERROR'].includes(String(value.hostPhase))
      || !(value.assetId === null || typeof value.assetId === 'string' && /^audio-[a-f0-9]{64}$/.test(value.assetId))
      || !integer(value.positionMs) || !integer(value.durationMs) || !integer(value.generation)
      || !nullableCode(value.errorCode) || !nullableCode(value.pausedReason)
      || typeof value.canResume !== 'boolean' || typeof value.serviceForeground !== 'boolean') throw new Error();
    const scope = checkedScope({ host: value.hostScope, audio: value.audioScope });
    const ref = value.ref === null ? null : checkedRef(value.ref);
    if (ref ? value.assetId !== `audio-${ref.assetSha256}` : value.assetId !== null) throw new Error();
    if ((value.status === 'playing' || value.status === 'paused' || value.status === 'loading') && !ref) throw new Error();
    // Stop revokes command admission before releasing hardware. Its transient event may
    // truthfully retain playing/ref/foreground while no longer offering an audio scope.
    if (value.status === 'playing' && (!value.serviceForeground
      || value.hostPhase === 'RUNNING' && !scope.audio
      || !['RUNNING', 'STOPPING'].includes(String(value.hostPhase)))) throw new Error();
    latestGeneration = Math.max(latestGeneration, value.generation);
    return Object.freeze({ ...value, hostScope: scope.host, audioScope: scope.audio, ref }) as NarrationState;
  } catch { throw new Error('INVALID_NARRATION_STATE'); }
}
export class NarrationCommandError extends Error {
  constructor(readonly code: string, readonly state: NarrationState) { super(code); this.name = 'NarrationCommandError'; }
}
function receipt(value: unknown): NarrationState {
  if (!object(value) || !keys(value, ['accepted', 'rejected', 'state']) || typeof value.accepted !== 'boolean'
    || !nullableCode(value.rejected)) throw new Error('INVALID_NARRATION_RECEIPT');
  const state = checkedState(value.state);
  if (!value.accepted) throw new NarrationCommandError(typeof value.rejected === 'string' ? value.rejected : 'NARRATION_REJECTED', state);
  if (value.rejected !== null) throw new Error('INVALID_NARRATION_RECEIPT');
  return state;
}

/** Explicit gesture scope is supplied by the UI. The bridge never recaptures, retries, or starts on its own. */
export const narration = {
  capture(): NarrationScope {
    if (typeof native.narrationCaptureScope !== 'function') throw new Error('NARRATION_UNAVAILABLE');
    return checkedScope(native.narrationCaptureScope());
  },
  async play(captured: NarrationScope, ref: NarrationRef): Promise<NarrationState> { return receipt(await native.narrationPlay(checkedScope(captured), checkedRef(ref))); },
  async pause(captured: NarrationScope): Promise<NarrationState> { return receipt(await native.narrationPause(checkedScope(captured))); },
  async resume(captured: NarrationScope): Promise<NarrationState> { return receipt(await native.narrationResume(checkedScope(captured))); },
  async stop(): Promise<NarrationState> { return receipt(await native.narrationStop()); },
  async getState(): Promise<NarrationState> { return checkedState(await native.narrationGetState()); },
  addListener(listener: (state: NarrationState) => void): Subscription {
    return native.addListener('onNarrationState', value => {
      const before = latestGeneration; const state = checkedState(value);
      if (state.generation >= before) listener(state);
    });
  },
};
