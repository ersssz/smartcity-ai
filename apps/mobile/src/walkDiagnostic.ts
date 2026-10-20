import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Speech from 'expo-speech';
import { PermissionsAndroid, Platform } from 'react-native';
import { readProgress, recordGpsSample, recordIssue, setPhase } from './diagnosticStore';

const LOCATION_TASK = 'astanaai.t01.active-walk.v1';
let operationRevision = 0;
let pendingOperations = 0;

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
  try {
    if (error) {
      await recordIssue('ОС сообщила ошибку фоновой геолокации. Проверьте разрешения и GPS.');
      return;
    }
    for (const fix of data?.locations ?? []) {
      // Coordinates are deliberately discarded here. Only an aggregate diagnostic is durable.
      await recordGpsSample(fix.coords.accuracy, fix.timestamp);
    }
  } catch {
    // Never log coordinates or provider payloads; the UI reports SQLite failure on its next read.
  }
});

export async function readLocationCapability() {
  const [foreground, background, servicesEnabled, registered, taskManagerAvailable] = await Promise.all([
    Location.getForegroundPermissionsAsync(),
    Location.getBackgroundPermissionsAsync(),
    Location.hasServicesEnabledAsync(),
    Location.hasStartedLocationUpdatesAsync(LOCATION_TASK),
    TaskManager.isAvailableAsync(),
  ]);
  return { foreground, background, servicesEnabled, registered, taskManagerAvailable };
}

/** Best-effort cold cleanup. Expo native restoration before JS is an OPEN gate. */
export async function reconcileDiagnostic(coldLaunch = false) {
  if (coldLaunch && await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) {
    // Emergency cleanup must not depend on opening SQLite successfully.
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
  const [progress, capability] = await Promise.all([readProgress(), readLocationCapability()]);
  if (progress.phase === 'active' && (coldLaunch || !capability.registered)) {
    await setPhase('paused', 'ОС остановила сопровождение. Для продолжения нажмите Start.');
  } else if (progress.phase !== 'active' && capability.registered) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
}

export async function startDiagnostic() {
  if (pendingOperations > 0) throw new Error('Предыдущая операция ещё завершается. Повторите Start после её завершения.');
  pendingOperations++;
  try { await executeStart(); }
  finally { pendingOperations--; }
}

async function executeStart() {
  const revision = ++operationRevision;
  const assertCurrent = () => {
    if (revision !== operationRevision) throw new Error('Start отменён последующей остановкой.');
  };
  if (!await TaskManager.isAvailableAsync()) throw new Error('Фоновый TaskManager недоступен в этой сборке.');
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (!foreground.granted) throw new Error('Геолокация не разрешена. Сопровождение не запущено.');
  if (!await Location.hasServicesEnabledAsync()) throw new Error('GPS/службы геолокации выключены.');
  // User-initiated foreground service supports While Using permission in this pinned SDK.
  // Always permission is a separate optional diagnostic, not a Start prerequisite.
  if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
    const notification = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    if (notification !== PermissionsAndroid.RESULTS.GRANTED) {
      throw new Error('Уведомления не разрешены. Тест видимого foreground-уведомления не запущен.');
    }
  }
  assertCurrent();
  await setPhase('active');
  try {
    assertCurrent();
    if (!await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) {
      await Location.startLocationUpdatesAsync(LOCATION_TASK, {
        accuracy: Location.Accuracy.High,
        distanceInterval: 5,
        timeInterval: 5000,
        foregroundService: {
          notificationTitle: 'AstanaAI · активный тест прогулки',
          notificationBody: 'Геолокация включена. Откройте приложение и нажмите Stop для остановки.',
          notificationColor: '#79E0C1',
          killServiceOnDestroy: true,
        },
      });
    }
    if (revision !== operationRevision) {
      if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
      await setPhase('stopped');
      throw new Error('Start отменён последующей остановкой.');
    }
  } catch {
    if (revision === operationRevision) await setPhase('paused', 'Не удалось запустить foreground-геолокацию.');
    throw new Error('ОС не запустила сопровождение. Проверьте разрешения и ограничения батареи.');
  }
}

export async function suspendDiagnostic(phase: 'paused' | 'stopped') {
  pendingOperations++;
  operationRevision++;
  try {
    if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK);
    }
    const [speech, storage] = await Promise.allSettled([Speech.stop(), setPhase(phase)]);
    if (storage.status === 'rejected') throw new Error('Геолокация остановлена, но SQLite не сохранила состояние. Повторный запуск требует проверки БД.');
    if (speech.status === 'rejected') throw new Error('Геолокация остановлена, но остановку голоса ОС подтвердить не удалось.');
  } finally {
    pendingOperations--;
  }
}
