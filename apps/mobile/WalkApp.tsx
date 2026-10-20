import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Linking, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import * as Speech from 'expo-speech';
import WalkExperience, { type UiWalk, type UiWalkSession } from './src/features/walk/WalkExperience';
import { nativeActiveWalk, type NativeWalkState } from './modules/astana-active-walk/src';
import { isNativeRunning, startDiagnostic, suspendDiagnostic } from './src/walkDiagnostic';
import { getPreparedWalk } from './src/walk/catalog';
import { getWalkRepository } from './src/walk/mobileRepository';
import { type Locale, type WalkAction } from './src/walk/model';
import { type Snapshot, WalkStorageError } from './src/walk/repository';
import { runPriorityStop } from './src/walk/priorityStop';
import CityIntro from './src/features/city/CityIntro';
import { getCityGuide } from './src/city/catalog';
import { getCityPreferences } from './src/city/mobilePreferences';
import { shouldIntroduceCity } from './src/city/preferences';

const COPY = {
  ru: { loading: 'Открываем вашу прогулку…', retry: 'Повторить', diagnostics: 'Техническая проверка', error: 'Не удалось сохранить изменение. Предыдущее сохранение осталось на телефоне. Повторите действие.', loadError: 'Не удалось открыть сохранённую прогулку. Данные не удалены.', corrupt: 'Сохранённая прогулка не прошла проверку. Можно начать новую: прежняя запись останется в локальном архиве.', restart: 'Начать заново?', restartBody: 'Текущая прогулка останется в локальном архиве. Открытия сохранятся. Новый проход начнётся с первой главы.', reset: 'Новый проход', cancel: 'Отмена', gpsOff: 'GPS-сопровождение выключено', gpsWaiting: 'GPS включён · ждём свежую позицию', gpsPermission: 'Нет разрешения на геолокацию', gpsProvider: 'Геолокация устройства выключена', gpsLive: 'Живая позиция · точность около', meters: 'м', gpsHelp: 'Показать себя на карте?', gpsBody: 'Геолокация включится только после вашего разрешения. Позиция не сохраняется; остановки и задания вы отмечаете вручную. Остановить GPS можно здесь или в уведомлении.', enable: 'Включить', trackingError: 'Не удалось включить GPS. Проверьте геолокацию и разрешения приложения.', voice: 'Голос системы · может требовать интернет; офлайн не проверен', noVoice: 'Для этого языка нет доступного голоса на устройстве. Текст главы доступен полностью.', speechError: 'Системный голос не смог прочитать главу. Можно продолжить чтение.', fieldNote: 'Рассчитано по пешеходному графу OpenStreetMap. Проходимость на месте ещё не проверена. Учитывайте ограждения, погоду и переходы; время оценено для темпа 3,6 км/ч. Вход в здания не требуется.', eyebrow: 'ТРИ ФОРМЫ · ОДНА ИСТОРИЯ' },
  kk: { loading: 'Серуен ашылуда…', retry: 'Қайталау', diagnostics: 'Техникалық тексеру', error: 'Өзгеріс сақталмады. Алдыңғы жазба телефонда қалды. Әрекетті қайталаңыз.', loadError: 'Сақталған серуен ашылмады. Деректер жойылған жоқ.', corrupt: 'Сақталған серуен тексеруден өтпеді. Жаңа серуенді бастауға болады: бұрынғы жазба жергілікті мұрағатта қалады.', restart: 'Қайта бастау керек пе?', restartBody: 'Қазіргі серуен жергілікті мұрағатта қалады. Жаңалықтар сақталады. Жаңа серуен бірінші тараудан басталады.', reset: 'Қайта бастау', cancel: 'Бас тарту', gpsOff: 'GPS сүйемелдеуі өшірулі', gpsWaiting: 'GPS қосылды · жаңа орынды күтеміз', gpsPermission: 'Геолокацияға рұқсат жоқ', gpsProvider: 'Құрылғы геолокациясы өшірулі', gpsLive: 'Ағымдағы орын · дәлдігі шамамен', meters: 'м', gpsHelp: 'Орныңызды картада көрсету керек пе?', gpsBody: 'Геолокация тек рұқсатыңыздан кейін қосылады. Орын сақталмайды; аялдамалар мен тапсырмалар қолмен белгіленеді. GPS-ті осы жерден немесе хабарландырудан тоқтатуға болады.', enable: 'Қосу', trackingError: 'GPS қосылмады. Геолокация мен қолданба рұқсаттарын тексеріңіз.', voice: 'Жүйелік дауыс · интернет қажет болуы мүмкін; офлайн тексерілмеген', noVoice: 'Құрылғыда бұл тілге қолжетімді дауыс жоқ. Тараудың толық мәтінін оқуға болады.', speechError: 'Жүйелік дауыс тарауды оқи алмады. Мәтінді оқуды жалғастырыңыз.', fieldNote: 'OpenStreetMap жаяу жүргінші графымен есептелген. Жергілікті жерде әлі тексерілмеген. Қоршауларды, ауа райын және өткелдерді ескеріңіз; уақыт 3,6 км/сағ қарқынмен бағаланған. Ғимараттарға кіру қажет емес.', eyebrow: 'ҮШ ПІШІН · БІР ХИКАЯ' },
  en: { loading: 'Opening your walk…', retry: 'Retry', diagnostics: 'Technical diagnostics', error: 'The change could not be saved. Your previous save remains on this phone. Please retry.', loadError: 'The saved walk could not be opened. No data was deleted.', corrupt: 'The saved walk failed validation. You can start a new one; the previous record will stay in a local archive.', restart: 'Start again?', restartBody: 'This walk will remain in the local archive. Discoveries are kept. The new walk starts at the first chapter.', reset: 'New walk', cancel: 'Cancel', gpsOff: 'GPS guidance is off', gpsWaiting: 'GPS is on · waiting for a fresh position', gpsPermission: 'Location permission is missing', gpsProvider: 'Device location is switched off', gpsLive: 'Live position · accuracy about', meters: 'm', gpsHelp: 'Show your position on the map?', gpsBody: 'Location starts only after your permission. Your position is not saved; stops and quests are marked manually. Stop GPS here or in the notification.', enable: 'Enable', trackingError: 'GPS could not start. Check device location and app permissions.', voice: 'System voice · may require internet; offline operation is unverified', noVoice: 'No voice for this language is available on this device. The full chapter is available as text.', speechError: 'The system voice could not read this chapter. You can continue reading.', fieldNote: 'Calculated using the OpenStreetMap walking graph. Not checked on site yet. Observe barriers, weather and crossings; time assumes a walking pace of 3.6 km/h. No building entry is required.', eyebrow: 'THREE FORMS · ONE STORY' },
} as const;
type Repository = Awaited<ReturnType<typeof getWalkRepository>>;
type LivePosition = { coordinate: [number, number]; accuracyMeters: number | null; timestampMs: number };
class StopError extends Error {}
const STOP_ERROR = { ru: 'ОС не подтвердила остановку GPS. Нажмите «Остановить» в уведомлении.', kk: 'ОЖ GPS тоқтағанын растамады. Хабарландырудағы тоқтату түймесін басыңыз.', en: 'The OS did not confirm that GPS stopped. Use Stop in the notification.' };
const CLEANUP_ERROR = { ru: 'Не удалось подтвердить полную остановку GPS и звука. Повторите остановку; если уведомление осталось, используйте его кнопку.', kk: 'GPS пен дыбыстың толық тоқтағаны расталмады. Тоқтатуды қайталаңыз; хабарландыру қалса, ондағы түймені пайдаланыңыз.', en: 'GPS and audio cleanup was not fully confirmed. Retry Stop; if a notification remains, use its Stop button.' };
const hasAcquisition = (state: NativeWalkState | undefined) => !!state &&
  (state.foreground || state.subscribed || state.status === 'starting' || state.status === 'running');

export default function WalkApp({ onOpenDiagnostics }: { onOpenDiagnostics: () => void }) {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const snapshotRef = useRef<Snapshot | undefined>(undefined);
  const repository = useRef<Repository | undefined>(undefined);
  const [locale, setLocale] = useState<Locale>('ru');
  const [busy, setBusy] = useState(false);
  const operating = useRef(false);
  const stopping = useRef(false);
  const pendingTask = useRef<Promise<void>>(Promise.resolve());
  const mounted = useRef(true);
  const [error, setError] = useState<string | null>(null);
  const [corrupt, setCorrupt] = useState(false);
  const [nativeState, setNativeState] = useState<NativeWalkState>();
  const nativeRef = useRef<NativeWalkState | undefined>(undefined);
  const [livePosition, setLivePosition] = useState<LivePosition>();
  const [voices, setVoices] = useState<Speech.Voice[]>([]);
  const [playing, setPlaying] = useState(false);
  const [showCity, setShowCity] = useState(false);
  const [cityReplay, setCityReplay] = useState(false);
  const [cityNotice, setCityNotice] = useState<string | null>(null);
  const introChecked = useRef(false);
  const speechGeneration = useRef(0);
  const t = COPY[locale];
  const cityGuide = useMemo(() => getCityGuide(locale), [locale]);
  const publish = (next: Snapshot) => { snapshotRef.current = next; if (mounted.current) setSnapshot(next); };
  const stopAudio = useCallback(async () => {
    speechGeneration.current++; await Speech.stop();
    if (mounted.current) setPlaying(false);
  }, []);
  const stopTracking = useCallback(async () => {
    // Stop cancels a pending permission/Start operation before touching SQLite.
    if (mounted.current) setLivePosition(undefined);
    // A legacy diagnostic write can fail after native Stop has succeeded.
    // Native truth, rather than that independent database, decides whether GPS stopped.
    try { await suspendDiagnostic('paused'); } catch { /* Verify native state below. */ }
    const stopped = await nativeActiveWalk.getState().catch(() => { throw new StopError(); });
    if (stopped.status !== 'stopped' || stopped.subscribed || stopped.foreground) throw new StopError();
    nativeRef.current = stopped;
    if (mounted.current) setNativeState(stopped);
  }, []);
  const load = useCallback(async () => {
    if (operating.current) return;
    operating.current = true; setBusy(true); setError(null);
    try {
      await stopTracking(); await stopAudio();
      const repo = await getWalkRepository(); repository.current = repo;
      const nextLocale = await repo.getLocale(); const next = await repo.load(getPreparedWalk());
      if (!introChecked.current) {
        introChecked.current = true;
        // A preference failure must never prevent access to an existing walk.
        const seen = await getCityPreferences().then(preferences => preferences.hasSeen()).catch(() => true);
        if (mounted.current && shouldIntroduceCity(seen, next.session.phase)) setShowCity(true);
      }
      // Publish the first walk only after the introduction decision: no route-map flash.
      if (mounted.current) { setLocale(nextLocale); setCorrupt(false); publish(next); }
    } catch (issue) {
      if (mounted.current) { setCorrupt(issue instanceof WalkStorageError && issue.code === 'CORRUPT_PROGRESS'); setError(issue instanceof StopError ? STOP_ERROR.ru : COPY.ru.loadError); }
    } finally { operating.current = false; if (mounted.current) setBusy(false); }
  }, [stopAudio, stopTracking]);
  useEffect(() => {
    mounted.current = true; void load();
    void Speech.getAvailableVoicesAsync().then(next => { if (mounted.current) setVoices(next); }).catch(() => {});
    const acceptState = (state: NativeWalkState) => {
      if (!mounted.current || (nativeRef.current && state.generation < nativeRef.current.generation)) return;
      nativeRef.current = state; setNativeState(state);
      if (!isNativeRunning(state) || state.fixStatus !== 'fresh') setLivePosition(undefined);
    };
    const stateSubscription = nativeActiveWalk.addListener('onStateChanged', acceptState);
    const locationSubscription = nativeActiveWalk.addListener('onLocation', fix => {
      const state = nativeRef.current; const age = Date.now() - fix.timestampMs;
      if (!mounted.current || AppState.currentState !== 'active' || !state || !isNativeRunning(state) || state.generation !== fix.generation || age < 0 || age > 30_000 || snapshotRef.current?.session.phase !== 'active') return;
      if (!Number.isFinite(fix.longitude) || !Number.isFinite(fix.latitude) || Math.abs(fix.longitude) > 180 || Math.abs(fix.latitude) > 90) return;
      setLivePosition({ coordinate: [fix.longitude, fix.latitude], accuracyMeters: fix.accuracyMeters, timestampMs: fix.timestampMs });
    });
    const lifecycle = AppState.addEventListener('change', state => {
      if (state !== 'active') { setLivePosition(undefined); void stopAudio().catch(() => {}); }
      else void nativeActiveWalk.getState().then(acceptState).catch(() => setLivePosition(undefined));
    });
    const timer = setInterval(() => {
      setLivePosition(previous => previous && Date.now() - previous.timestampMs <= 30_000 ? previous : undefined);
      if (AppState.currentState === 'active') void nativeActiveWalk.getState().then(acceptState).catch(() => setLivePosition(undefined));
    }, 3000);
    return () => {
      mounted.current = false; speechGeneration.current++;
      clearInterval(timer); lifecycle.remove(); stateSubscription.remove(); locationSubscription.remove();
      void Speech.stop().catch(() => {}); void suspendDiagnostic('paused').catch(() => {});
    };
  }, [load, stopAudio]);
  const operate = async (task: () => Promise<void>) => {
    if (operating.current || stopping.current) return;
    operating.current = true; setBusy(true); setError(null);
    const operation = (async () => {
      try { await task(); }
      catch (issue) { if (mounted.current) setError(issue instanceof StopError ? STOP_ERROR[locale] : t.error); }
      finally { operating.current = false; if (mounted.current && !stopping.current) setBusy(false); }
    })();
    pendingTask.current = operation;
    await operation;
  };
  const urgentStop = async (pauseSession = true) => {
    if (stopping.current) return;
    stopping.current = true; setBusy(true); setLivePosition(undefined); setError(null);
    try {
      const result = await runPriorityStop({ stopNative: stopTracking, stopAudio, pending: pendingTask.current, pause: async () => {
        if (pauseSession && snapshotRef.current?.session.phase === 'active' && repository.current) publish(await repository.current.act({ type: 'pause' }));
      } });
      if (mounted.current) setError(result.cleanupFailed ? CLEANUP_ERROR[locale] : null);
    } catch { if (mounted.current) setError(t.error); }
    finally { stopping.current = false; if (mounted.current) setBusy(false); }
  };
  const command = (action: WalkAction) => void operate(async () => {
    if (!repository.current) return;
    if (action.type === 'pause' || action.type === 'confirm_return') { await stopTracking(); await stopAudio(); }
    if (action.type === 'continue' || action.type === 'skip') await stopAudio();
    publish(await repository.current.act(action));
  });
  const restart = () => Alert.alert(t.restart, t.restartBody, [ { text: t.cancel, style: 'cancel' },
    { text: t.reset, onPress: () => void operate(async () => {
      await stopTracking(); await stopAudio();
      const repo = repository.current ?? await getWalkRepository(); repository.current = repo;
      publish(await repo.restart(getPreparedWalk())); await repo.setLocale(locale); setCorrupt(false);
    }) },
  ]);
  const openDiagnostics = () => void operate(async () => {
    await stopTracking(); await stopAudio();
    if (snapshotRef.current?.session.phase === 'active' && repository.current) publish(await repository.current.act({ type: 'pause' }));
    onOpenDiagnostics();
  });
  const openCity = () => void operate(async () => {
    // Keep the walk controls visible until native acquisition is confirmed stopped.
    await stopTracking(); await stopAudio();
    if (snapshotRef.current?.session.phase === 'active' && repository.current) publish(await repository.current.act({ type: 'pause' }));
    if (mounted.current) { setCityReplay(true); setShowCity(true); }
  });
  const finishCity = () => {
    setShowCity(false);
    // Leaving an introduction is always possible, even if its preference cannot be saved.
    void getCityPreferences().then(preferences => preferences.finish()).catch(() => {
      if (mounted.current) setCityNotice({ ru: 'Знакомство закрыто. Не удалось сохранить этот выбор; при следующем запуске оно может появиться снова.', kk: 'Танысу жабылды. Таңдау сақталмады; келесі іске қосуда ол қайта көрінуі мүмкін.', en: 'The introduction is closed. This choice could not be saved; it may appear again next time.' }[locale]);
    });
  };
  const toggleTracking = () => {
    if (hasAcquisition(nativeState)) { void urgentStop(false); return; }
    if (snapshotRef.current?.session.phase !== 'active' || operating.current) return;
    Alert.alert(t.gpsHelp, t.gpsBody, [{ text: t.cancel, style: 'cancel' }, { text: t.enable, onPress: () => void operate(async () => {
      if (snapshotRef.current?.session.phase !== 'active' || AppState.currentState !== 'active') return;
      try { await startDiagnostic(); const state = await nativeActiveWalk.getState(); nativeRef.current = state; setNativeState(state); }
      catch { setError(t.trackingError); }
    }) }]);
  };
  const voice = voices.find(candidate => candidate.language.toLowerCase().replace('_', '-').split('-')[0] === locale);
  const speak = (stopId: string) => void operate(async () => {
    const stop = snapshotRef.current?.walk.stops.find(candidate => candidate.id === stopId);
    if (!stop || !voice || AppState.currentState !== 'active') return;
    const generation = ++speechGeneration.current;
    await Speech.stop();
    // Stop, locale change or backgrounding can supersede this awaited cleanup.
    if (generation !== speechGeneration.current || stopping.current || !mounted.current || AppState.currentState !== 'active') return;
    const finished = () => { if (mounted.current && generation === speechGeneration.current) setPlaying(false); };
    setPlaying(true);
    Speech.speak(stop.story[locale], { voice: voice.identifier, language: voice.language, rate: 0.93, onDone: finished, onStopped: finished,
      onError: () => { finished(); if (mounted.current && generation === speechGeneration.current) setError(t.speechError); } });
  });
  const uiWalk = useMemo<UiWalk | undefined>(() => {
    if (!snapshot) return;
    const walk = snapshot.walk;
    return { id: walk.id, title: walk.title[locale], subtitle: walk.subtitle[locale], description: walk.description[locale], eyebrow: t.eyebrow,
      minutes: Math.ceil(walk.timing.totalMinutes), distanceMeters: walk.timing.distanceMeters, walkMinutes: Math.ceil(walk.timing.walkMinutes), visitMinutes: walk.timing.visitMinutes, reserveMinutes: walk.timing.reserveMinutes,
      startLabel: walk.startAnchor.label[locale], endLabel: walk.startAnchor.label[locale], route: walk.legs.flatMap((leg, index) => index ? leg.coordinates.slice(1) : leg.coordinates),
      stops: walk.stops.map(stop => ({ id: stop.id, title: stop.title[locale], kicker: stop.subtitle[locale], coordinate: stop.coordinate,
        minutes: stop.visitMinutes, storyTitle: stop.storyTitle[locale], story: stop.story[locale], observation: stop.observation[locale],
        quest: { question: stop.quest.question[locale], choices: stop.quest.choices.map(choice => ({ id: choice.id, label: choice.label[locale] })), hint: stop.quest.hint[locale] },
        sources: stop.sourceIds.map(id => walk.sources.find(source => source.id === id)!).map(source => ({ label: source.title, url: source.url, checkedAt: source.checkedAt })),
      })), attribution: walk.routeSource.attribution, fieldNote: t.fieldNote, closing: walk.closing?.[locale], collectionTitle: walk.collectionTitle[locale], collectionDescription: walk.collectionDescription?.[locale] };
  }, [snapshot, locale, t]);
  const uiSession = useMemo<UiWalkSession | undefined>(() => {
    if (!snapshot) return;
    return { ...snapshot.session, answers: Object.fromEntries(Object.entries(snapshot.session.answers).map(([stopId, answer]) => {
      const quest = snapshot.walk.stops.find(stop => stop.id === stopId)!.quest;
      return [stopId, { ...answer, feedback: answer.correct ? quest.explanation[locale] : quest.hint[locale] }];
    })) };
  }, [snapshot, locale]);
  if (!uiWalk || !uiSession) return <SafeAreaView style={styles.page}><View style={styles.card}>
    <Text style={styles.brand}>AstanaAI</Text>{busy ? <ActivityIndicator color="#173F3B" /> : null}<Text style={styles.body}>{corrupt ? t.corrupt : error ?? t.loading}</Text>
    {!busy && <><Pressable onPress={() => void load()} style={styles.button}><Text style={styles.buttonText}>{t.retry}</Text></Pressable>
      {corrupt && <Pressable onPress={restart} style={styles.button}><Text style={styles.buttonText}>{t.reset}</Text></Pressable>}
      <Pressable onPress={openDiagnostics}><Text style={styles.link}>{t.diagnostics}</Text></Pressable></>}
  </View></SafeAreaView>;
  const tracking = hasAcquisition(nativeState);
  const locationStatus = nativeState?.status === 'error' && tracking ? STOP_ERROR[locale] : !tracking ? t.gpsOff : nativeState?.precision === 'denied' ? t.gpsPermission : !nativeState?.providerEnabled ? t.gpsProvider : livePosition?.accuracyMeters != null ? `${t.gpsLive} ${Math.round(livePosition.accuracyMeters)} ${t.meters}` : t.gpsWaiting;
  if (showCity) return <CityIntro guide={cityGuide} locale={locale} replay={cityReplay} busy={busy}
    onLocaleChange={next => void operate(async () => { await stopAudio(); await repository.current?.setLocale(next); setLocale(next); })}
    error={error} onFinish={finishCity} />;
  return <WalkExperience locale={locale} walk={uiWalk} session={uiSession} busy={busy} error={error ?? cityNotice} locationStatus={locationStatus}
    discoveries={snapshot!.discoveries.map(discovery => ({ walkId: discovery.walkId, title: discovery.title[locale] }))}
    livePosition={tracking ? livePosition : undefined} tracking={{ active: tracking, label: locationStatus }} audio={{ available: !!voice, playing, label: voice ? t.voice : t.noVoice }}
    onLocaleChange={next => void operate(async () => { await stopAudio(); await repository.current?.setLocale(next); setLocale(next); })}
    onStart={() => command({ type: 'start' })} onResume={() => command({ type: 'resume' })} onPause={() => void urgentStop()} onStop={() => void urgentStop()}
    onMarkStop={stopId => command({ type: 'mark_stop', stopId })} onAnswer={(stopId, choiceId) => command({ type: 'answer', stopId, choiceId })}
    onContinue={stopId => command({ type: 'continue', stopId })} onSkip={stopId => command({ type: 'skip', stopId })} onConfirmReturn={() => command({ type: 'confirm_return' })}
    onRestart={restart} onSpeak={speak} onStopAudio={() => void stopAudio().catch(() => setError(t.speechError))} onToggleTracking={toggleTracking} onOpenDiagnostics={openDiagnostics} onOpenCity={openCity}
    onOpenExternalRoute={() => { const [lon, lat] = snapshot!.walk.startAnchor.coordinate; void Linking.openURL(`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`).catch(() => setError(t.error)); }} />;
}
const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: '#F8F6EF', justifyContent: 'center', padding: 24 }, card: { padding: 24, gap: 20 }, brand: { fontSize: 36, color: '#173F3B', fontWeight: '700' }, body: { fontSize: 17, color: '#173F3B', lineHeight: 26 }, button: { padding: 16, backgroundColor: '#173F3B', borderRadius: 16 }, buttonText: { color: '#FFFFFF', textAlign: 'center', fontWeight: '600' }, link: { color: '#173F3B', textAlign: 'center', padding: 16 } });
