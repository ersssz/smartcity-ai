import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { Camera, Map, ViewAnnotation } from '@maplibre/maplibre-react-native';
import * as Speech from 'expo-speech';
import { nativeActiveWalk, type NativeWalkState } from './modules/astana-active-walk/src';
import { addManualStep, readProgress, recordGpsSample, type DiagnosticProgress } from './src/diagnosticStore';
import { isNativeRunning, readLocationCapability, reconcileDiagnostic, startDiagnostic, suspendDiagnostic } from './src/walkDiagnostic';

const ASTANA: [number, number] = [71.4304, 51.1282];
const LANGUAGES = [
  { code: 'ru', label: 'RU', text: 'Добро пожаловать в Астану. Это проверка системного голоса, а не материал экскурсии.' },
  { code: 'kk', label: 'KK', text: 'Астанаға қош келдіңіз. Бұл құрылғыдағы дауысты тексеру.' },
  { code: 'en', label: 'EN', text: 'Welcome to Astana. This is a device voice check, not a guided tour.' },
] as const;
type Position = { coordinate: [number, number]; timestamp: number; generation: number };

function Action({ label, onPress, disabled = false, primary = false }: {
  label: string; onPress: () => void; disabled?: boolean; primary?: boolean;
}) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}
    style={[styles.button, primary && styles.primary, disabled && styles.disabled]}>
    <Text style={[styles.buttonText, primary && styles.primaryText]}>{label}</Text>
  </Pressable>;
}

export default function App() {
  const [progress, setProgress] = useState<DiagnosticProgress | null>(null);
  const [capability, setCapability] = useState<NativeWalkState | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [voices, setVoices] = useState<Speech.Voice[]>([]);
  const [voiceStatus, setVoiceStatus] = useState('Проверяем системный TTS…');
  const [mapStatus, setMapStatus] = useState('Карта загружается…');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const capabilityRef = useRef<NativeWalkState | null>(null);
  const refreshRevision = useRef(0);
  const busyOperations = useRef(0);

  const observeNativeState = useCallback((observed: NativeWalkState) => {
    if (capabilityRef.current && observed.generation < capabilityRef.current.generation) return;
    capabilityRef.current = observed;
    setCapability(observed);
    setPosition(previous => previous && isNativeRunning(observed) && observed.providerEnabled &&
      observed.precision !== 'denied' && previous.generation === observed.generation &&
      observed.fixStatus === 'fresh' && AppState.currentState === 'active' &&
      Date.now() - previous.timestamp >= 0 && Date.now() - previous.timestamp < 30_000 ? previous : null);
  }, []);

  const refresh = useCallback(async () => {
    const revision = ++refreshRevision.current;
    const observed = await readLocationCapability();
    if (revision !== refreshRevision.current) return;
    observeNativeState(observed);
    try {
      const stored = await readProgress();
      if (revision !== refreshRevision.current) return;
      setProgress(stored);
      if (stored.phase !== 'active') setPosition(null);
    } catch {
      if (revision !== refreshRevision.current) return;
      setProgress(null);
      setPosition(null);
      throw new Error('SQLite недоступна. Stop остаётся доступным для остановки геолокации.');
    }
  }, [observeNativeState]);

  const perform = useCallback(async (operation: () => Promise<unknown>) => {
    busyOperations.current++;
    setBusy(true);
    setError(null);
    try { await operation(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Операция недоступна.'); }
    finally {
      try { await refresh(); } catch { setError((previous) => previous ?? 'Не удалось обновить состояние SQLite/ОС.'); }
      busyOperations.current--;
      setBusy(busyOperations.current > 0);
    }
  }, [refresh]);

  useEffect(() => {
    let alive = true;
    const update = () => {
      if (alive && AppState.currentState === 'active') {
        void reconcileDiagnostic().then(() => { if (alive) return refresh(); })
          .catch(() => { if (alive) setError('Не удалось проверить состояние сопровождения. Используйте Stop.'); });
      }
    };
    const stateSubscription = nativeActiveWalk.addListener('onStateChanged', state => {
      if (alive) observeNativeState(state);
    });
    const locationSubscription = nativeActiveWalk.addListener('onLocation', fix => {
      const current = capabilityRef.current;
      const age = Date.now() - fix.timestampMs;
      if (!alive || AppState.currentState !== 'active' || !current || !isNativeRunning(current) ||
          current.generation !== fix.generation || age < 0 || age > 30_000 ||
          !Number.isFinite(fix.latitude) || !Number.isFinite(fix.longitude) ||
          Math.abs(fix.latitude) > 90 || Math.abs(fix.longitude) > 180) return;
      setPosition({ coordinate: [fix.longitude, fix.latitude], timestamp: fix.timestampMs, generation: fix.generation });
      // Only metadata crosses the SQLite boundary; never the coordinates.
      void recordGpsSample(fix.accuracyMeters, fix.timestampMs)
        .catch(() => { if (alive) setError('Не удалось сохранить диагностический счётчик.'); });
    });
    update();
    Speech.getAvailableVoicesAsync().then((available) => {
      if (alive) { setVoices(available); setVoiceStatus('Список голосов получен от ОС. Offline-воспроизведение не проверено.'); }
    }).catch(() => { if (alive) setVoiceStatus('Системный TTS недоступен.'); });
    const timer = setInterval(update, 3000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') update();
      else setPosition(null);
    });
    return () => {
      alive = false;
      clearInterval(timer);
      subscription.remove();
      stateSubscription.remove();
      locationSubscription.remove();
    };
  }, [observeNativeState, refresh]);

  const stop = (phase: 'paused' | 'stopped') => {
    setPosition(null);
    void perform(() => suspendDiagnostic(phase));
  };

  const requestStart = () => Alert.alert(
    'Только лабораторный тест',
    'Start включает геолокацию для технической проверки, в том числе при погашенном экране. Остановить её можно здесь или кнопкой Stop в уведомлении. Координаты не сохраняются приложением. Маршрут и прибытия эта сборка пока не проверяет.',
    [{ text: 'Отмена', style: 'cancel' }, { text: 'Запустить тест', onPress: () => void perform(startDiagnostic) }],
  );

  const running = capability ? isNativeRunning(capability) : false;
  const phase = running ? 'Сервис работает' : capability?.status === 'starting' ? 'Запускается…' :
    capability?.status === 'error' ? 'Сервис недоступен' : progress?.phase === 'paused' ? 'На паузе' :
    capability?.status === 'stopped' ? 'Остановлено' : 'Состояние не подтверждено';
  const permissionLabel = capability?.precision === 'fine' ? 'Точная позиция' :
    capability?.precision === 'coarse' ? 'Приблизительная позиция' : 'Нет разрешения';
  const ageSeconds = capability?.lastFixAgeMs == null ? null : Math.round(capability.lastFixAgeMs / 1000);

  return <View style={styles.screen}>
    <StatusBar barStyle="light-content" />
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}><View><Text style={styles.eyebrow}>ASTANA / NATIVE LAB</Text><Text style={styles.title}>Город начинается с шага.</Text></View><Text style={styles.badge}>T01.1</Text></View>
      <Text style={styles.notice}>Диагностическая сборка · нативная геолокация только после Start. Полевые проверки ещё впереди.</Text>
      <View style={styles.mapFrame}>
        <Map style={styles.map} mapStyle="https://tiles.openfreemap.org/styles/liberty" attribution
          onDidFinishLoadingMap={() => setMapStatus('Карта загружена · online')}
          onDidFailLoadingMap={() => setMapStatus('Карта недоступна. Проверьте сеть.')}>
          <Camera initialViewState={{ center: ASTANA, zoom: 13 }} />
          {position && <ViewAnnotation id="actual-device-position" lngLat={position.coordinate}><View style={styles.positionDot} /></ViewAnnotation>}
        </Map>
        <View style={styles.mapCaption}><Text style={styles.mapCaptionTitle}>Астана</Text><Text style={styles.mapCaptionText}>{mapStatus}</Text></View>
      </View>
      <View style={styles.attribution}>
        <Text style={styles.link} onPress={() => void Linking.openURL('https://openfreemap.org/')}>OpenFreeMap</Text>
        <Text style={styles.muted}> · </Text><Text style={styles.link} onPress={() => void Linking.openURL('https://openmaptiles.org/')}>OpenMapTiles</Text>
        <Text style={styles.muted}> · </Text><Text style={styles.link} onPress={() => void Linking.openURL('https://www.openstreetmap.org/copyright')}>© OpenStreetMap</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>01 / АКТИВНАЯ ПРОГУЛКА</Text><Text style={styles.heading}>{phase}</Text>
        <Text style={styles.body}>GPS: {capability ? capability.providerEnabled ? 'включён' : 'выключен' : 'не проверен'} · {permissionLabel}</Text>
        <Text style={styles.body}>Уведомления: {capability?.notificationsEnabled ? 'разрешены' : 'недоступны'} · подписка ОС: {capability?.subscribed ? 'включена' : 'выключена'}</Text>
        <Text style={styles.body}>Отсчётов в текущем сеансе: {capability?.sampleCount ?? '—'}. Последний: {ageSeconds === null ? 'нет данных' : `${ageSeconds} с назад`}{capability?.accuracyMeters != null ? ` · ±${Math.round(capability.accuracyMeters)} м` : ''}</Text>
        {capability?.errorCode && <Text style={styles.errorText}>Диагностика: {capability.errorCode}</Text>}
        <Text style={styles.muted}>Маркер появляется только от реальной позиции во время активного теста. Отсчёты не означают прибытие или вход в здание. Маршрут пока не рассчитан.</Text>
        <View style={styles.actions}>
          <Action label="Start" primary disabled={busy || !progress || running || capability?.status === 'starting'} onPress={requestStart} />
          <Action label="Pause" disabled={busy || !running} onPress={() => stop('paused')} />
          <Action label="Stop" onPress={() => stop('stopped')} />
        </View>
        <Text style={styles.link} onPress={() => void Linking.openSettings()}>Настройки разрешений и батареи ↗</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>02 / ЛОКАЛЬНЫЙ ПРОГРЕСС</Text>
        <Text style={styles.heading}>{progress?.manualSteps ?? '—'} ручных тестовых шагов</Text>
        <Text style={styles.body}>Сохранено метаданных при открытом экране: {progress?.gpsSamples ?? '—'}. SQLite хранит только счётчики, состояние и точность, без координат.</Text>
        <Action label="Добавить ручной тестовый шаг" disabled={busy || !progress} onPress={() => void perform(addManualStep)} />
        <Text style={styles.muted}>Закройте процесс и откройте сборку: счётчик должен восстановиться. На устройстве это ещё не проверено. Ручной шаг не становится GPS-посещением.</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>03 / ГОЛОС УСТРОЙСТВА</Text><Text style={styles.heading}>Три языка. Честный статус.</Text>
        <Text style={styles.body}>{voiceStatus}</Text>
        {LANGUAGES.map((language) => {
          const voice = voices.find((candidate) => candidate.language.toLowerCase().split(/[-_]/)[0] === language.code);
          return <View key={language.code} style={styles.voiceRow}>
            <View style={styles.voiceDescription}><Text style={styles.body}>{language.label} · {voice ? voice.name : 'unavailable'}</Text><Text style={styles.muted}>{voice ? 'Системный TTS; offline не подтверждён' : 'Подходящий голос ОС не найден'}</Text></View>
            <Action label="Слушать" disabled={!voice || busy} onPress={() => {
              if (!voice) return;
              void perform(async () => { await Speech.stop(); Speech.speak(language.text, {
                language: voice.language, voice: voice.identifier,
                onError: () => setError(`TTS ${language.label}: воспроизведение недоступно.`),
              }); });
            }} />
          </View>;
        })}
        <Action label="Остановить голос" onPress={() => void perform(() => Speech.stop())} />
        <Text style={styles.muted}>Лицензированные файлы RU/KK/EN и offline audio пока unavailable. Голос ОС не доказывает право сохранить запись. Фоновое аудио, offline-карта и разрешённый пакет прогулки ещё не проверены.</Text>
      </View>
      {(error || progress?.issue) && <View accessibilityRole="alert" style={styles.error}><Text style={styles.errorText}>{error ?? progress?.issue}</Text></View>}
      <Text style={styles.footer}>Никаких платных API · Без аккаунта · Координаты не записываются в SQLite. Карта запрашивает OpenFreeMap по видимой области. Проверки других версий Android, батареи и реальной прогулки выполняются отдельно.</Text>
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0B1518' }, content: { paddingTop: 56, paddingBottom: 40, paddingHorizontal: 20, gap: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, eyebrow: { color: '#79E0C1', letterSpacing: 2, fontSize: 10, fontWeight: '700' },
  title: { fontSize: 27, color: '#F5F2E8', fontWeight: '700', marginTop: 8, maxWidth: 270 }, badge: { color: '#79E0C1', borderColor: '#38554E', borderWidth: 1, borderRadius: 20, padding: 12 },
  notice: { fontSize: 12, color: '#DCCB9A', lineHeight: 18 }, mapFrame: { height: 300, borderRadius: 24, overflow: 'hidden', backgroundColor: '#1D302F' }, map: { flex: 1 },
  mapCaption: { position: 'absolute', top: 14, left: 14, backgroundColor: '#0B1518E6', padding: 12, borderRadius: 14, pointerEvents: 'none' }, mapCaptionTitle: { color: '#FFF9EB', fontSize: 18, fontWeight: '700' }, mapCaptionText: { color: '#B4CFC7', fontSize: 11, marginTop: 3 },
  positionDot: { height: 20, width: 20, borderRadius: 10, backgroundColor: '#42D9B2', borderWidth: 3, borderColor: 'white' }, attribution: { flexDirection: 'row', flexWrap: 'wrap' },
  card: { backgroundColor: '#152528', borderColor: '#29403E', borderWidth: 1, borderRadius: 22, padding: 18, gap: 12 }, heading: { fontSize: 21, fontWeight: '600', color: '#F5F2E8' }, body: { fontSize: 13, lineHeight: 20, color: '#D8E1DC' }, muted: { fontSize: 11, lineHeight: 17, color: '#9CB2AE' },
  actions: { flexDirection: 'row', gap: 8 }, button: { minHeight: 44, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#223C3D', borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, primary: { backgroundColor: '#79E0C1' }, disabled: { opacity: 0.4 }, buttonText: { color: '#DCE9E1', fontWeight: '600', fontSize: 13 }, primaryText: { color: '#0B2520' },
  link: { color: '#79E0C1', fontSize: 11, lineHeight: 18, textDecorationLine: 'underline' }, voiceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, voiceDescription: { flex: 1 },
  error: { backgroundColor: '#3D2626', borderRadius: 16, padding: 16 }, errorText: { color: '#FFBCAD', lineHeight: 20, fontSize: 13 }, footer: { color: '#8FA49F', fontSize: 11, lineHeight: 18, paddingHorizontal: 4 },
});
