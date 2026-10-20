import * as Speech from 'expo-speech';
import { PermissionsAndroid, Platform } from 'react-native';
import { nativeActiveWalk, type NativeWalkState } from '../modules/astana-active-walk/src';
import { readProgress, setPhase } from './diagnosticStore';

let operationRevision = 0;
let pendingOperations = 0;
let lastStopPhase: 'paused' | 'stopped' = 'stopped';

/** Call while owning pendingOperations; a later Stop may always supersede a slow write. */
async function persistSuspendedPhase(
  phase: 'paused' | 'stopped', revision: number, issue: string | null = null,
) {
  for (;;) {
    await setPhase(phase, issue);
    if (revision === operationRevision) return;
    revision = operationRevision;
    phase = lastStopPhase;
    issue = null;
  }
}

export const isNativeRunning = (state: NativeWalkState) =>
  state.status === 'running' && state.foreground && state.subscribed;

/** Observes the native subscription; never creates a service or requests permission. */
export async function readLocationCapability(): Promise<NativeWalkState> {
  return nativeActiveWalk.getState();
}

export async function reconcileDiagnostic(_coldLaunch = false) {
  const revision = operationRevision;
  const superseded = () => pendingOperations > 0 || operationRevision !== revision;
  if (superseded()) return;
  let state = await nativeActiveWalk.getState();
  // Start may have promoted its service but not yet committed diagnostic progress.
  if (superseded()) return;
  let progress;
  try { progress = await readProgress(); }
  catch {
    if (superseded()) return;
    pendingOperations++;
    try {
      if (state.status === 'running' || state.status === 'starting') await nativeActiveWalk.stop();
      throw new Error('SQLite недоступна. Сопровождение остановлено до проверки локального состояния.');
    } finally { pendingOperations--; }
  }
  if (superseded()) return;
  // Native notification Stop can occur without changing the JS operation revision.
  state = await nativeActiveWalk.getState();
  if (superseded()) return;
  // Block new Starts while observation repairs storage; Stop remains available.
  pendingOperations++;
  try {
    if (progress.phase === 'active' && !isNativeRunning(state)) {
      await persistSuspendedPhase('paused', revision, 'Сопровождение остановлено. Для продолжения нажмите Start.');
    } else if (progress.phase !== 'active' && (state.status === 'running' || state.status === 'starting')) {
      await nativeActiveWalk.stop();
    }
  } finally { pendingOperations--; }
}

export async function startDiagnostic() {
  if (pendingOperations > 0) throw new Error('Предыдущая операция ещё завершается. Повторите Start после её завершения.');
  pendingOperations++;
  try { await executeStart(); }
  finally { pendingOperations--; }
}

async function executeStart() {
  const revision = ++operationRevision;
  let nativeStartRequested = false;
  const assertCurrent = () => {
    if (revision !== operationRevision) throw new Error('Start отменён последующей остановкой.');
  };
  try {
    await readProgress();
    assertCurrent();
    if (Platform.OS !== 'android') throw new Error('Эта диагностическая сборка поддерживает Android.');
    const permission = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    ]);
    assertCurrent();
    const granted = PermissionsAndroid.RESULTS.GRANTED;
    if (permission[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION] !== granted &&
        permission[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] !== granted) {
      throw new Error('Геолокация не разрешена. Сопровождение не запущено.');
    }
    if (Number(Platform.Version) >= 33) {
      const notification = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      assertCurrent();
      if (notification !== granted) throw new Error('Разрешите уведомление с кнопкой Stop для запуска теста.');
    }
    assertCurrent();
    nativeStartRequested = true;
    const started = await nativeActiveWalk.start();
    assertCurrent();
    if (!isNativeRunning(started)) {
      throw new Error('ОС не запустила сопровождение. Проверьте GPS, разрешения и уведомления.');
    }
    await setPhase('active');
    assertCurrent();
    const confirmed = await nativeActiveWalk.getState();
    assertCurrent();
    if (!isNativeRunning(confirmed) || confirmed.generation !== started.generation) {
      throw new Error('Сопровождение остановлено во время запуска. Нажмите Start, чтобы начать новый тест.');
    }
  } catch (error) {
    if (nativeStartRequested) await nativeActiveWalk.stop();
    // A slow SQLite write from a cancelled Start must not undo a newer Stop.
    try {
      await persistSuspendedPhase(revision === operationRevision ? 'paused' : lastStopPhase, operationRevision);
    }
    catch { /* Native Stop does not depend on diagnostic storage. */ }
    throw error;
  }
}

export async function suspendDiagnostic(phase: 'paused' | 'stopped') {
  pendingOperations++;
  const revision = ++operationRevision;
  lastStopPhase = phase;
  try {
    const stopped = await nativeActiveWalk.stop();
    if (stopped.status !== 'stopped' || stopped.subscribed || stopped.foreground) {
      throw new Error('ОС не подтвердила остановку. Используйте Stop в уведомлении.');
    }
    const [speech, storage] = await Promise.allSettled([Speech.stop(), persistSuspendedPhase(phase, revision)]);
    if (storage.status === 'rejected') throw new Error('Геолокация остановлена, но SQLite не сохранила состояние.');
    if (speech.status === 'rejected') throw new Error('Геолокация остановлена, но остановку голоса ОС подтвердить не удалось.');
  } finally { pendingOperations--; }
}
