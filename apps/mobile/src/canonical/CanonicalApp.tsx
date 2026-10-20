import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Linking, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { narrationEntries, type Locale, type PackVerification } from '@astanaai/contracts';
import WalkExperience from '../features/walk/WalkExperience';
import CanonicalPreview from '../features/walk/CanonicalPreview';
import { nativeActiveWalk } from '../../modules/astana-active-walk/src';
import { preparedAudio, type PreparedAudioState } from '../../modules/astana-active-walk/src/preparedAudio';
import { getCanonicalSession } from './mobileSession';
import { prepareCanonicalWalk, verifyInstalledWalk, type PreparedCanonicalWalk } from './preparation';
import { toCanonicalUiSession, toCanonicalUiWalk } from './presentation';
import { type CanonicalSessionCommand, type Snapshot } from './session';
import { runPriorityStop } from '../walk/priorityStop';

const COPY = {
  ru: { loading: 'Готовим вашу прогулку…', retry: 'Повторить', back: 'К сохранённой прогулке', error: 'Не удалось выполнить действие. Сохранённый прогресс остался на телефоне.', audio: 'Записанная озвучка · работает без сети', audioError: 'Звук не запустился. Полный текст доступен ниже.', gps: 'Ручное прохождение · отметки не означают GPS-посещение', cleanup: 'Не удалось подтвердить остановку. Повторите действие.', unavailable: 'Проверяем материалы прогулки…' },
  kk: { loading: 'Серуеніңіз дайындалуда…', retry: 'Қайталау', back: 'Сақталған серуенге', error: 'Әрекет орындалмады. Сақталған ілгерілеу телефонда қалды.', audio: 'Дайын дыбыстау · желісіз жұмыс істейді', audioError: 'Дыбыс қосылмады. Толық мәтін төменде бар.', gps: 'Қолмен өту · белгі GPS-сапарды білдірмейді', cleanup: 'Тоқтағаны расталмады. Әрекетті қайталаңыз.', unavailable: 'Серуен материалдары тексерілуде…' },
  en: { loading: 'Preparing your walk…', retry: 'Retry', back: 'Back to saved walk', error: 'The action failed. Your saved progress remains on this phone.', audio: 'Prepared narration · plays without a connection', audioError: 'Audio could not start. The full text is available below.', gps: 'Manual progression · marks do not prove a GPS visit', cleanup: 'Stop was not confirmed. Please retry.', unavailable: 'Checking walk materials…' },
};
type Repository = Awaited<ReturnType<typeof getCanonicalSession>>;
let eventSequence = 0;
export default function CanonicalApp({ initialLocale, onBack, onOpenCity, onOpenDiagnostics, onLocaleChange }: {
  initialLocale: Locale; onBack: () => void; onOpenCity: () => void; onOpenDiagnostics: () => void; onLocaleChange: (locale: Locale) => Promise<void>;
}) {
  const [locale, setLocale] = useState(initialLocale);
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const current = useRef<Snapshot | undefined>(undefined);
  const repository = useRef<Repository | undefined>(undefined);
  const [proposal, setProposal] = useState<PreparedCanonicalWalk>();
  const [verification, setVerification] = useState<PackVerification>();
  const [audioState, setAudioState] = useState<PreparedAudioState>();
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const operating = useRef(false), stopping = useRef(false), mounted = useRef(true);
  const pending = useRef<Promise<void>>(Promise.resolve());
  const generation = useRef(0);
  const t = COPY[locale];
  const publish = (next: Snapshot) => { current.current = next; if (mounted.current) setSnapshot(next); };
  const operate = useCallback(async (task: () => Promise<void>) => {
    if (operating.current || stopping.current) return;
    operating.current = true; setBusy(true); setError(null);
    const work = (async () => {
      try { await task(); }
      catch { if (mounted.current) setError(COPY[locale].error); }
      finally { operating.current = false; if (mounted.current && !stopping.current) setBusy(false); }
    })();
    pending.current = work; await work;
  }, [locale]);
  const dispatch = async (action: CanonicalSessionCommand['action']) => {
    const repo = repository.current, previous = current.current;
    if (!repo || !previous) return;
    publish(await repo.dispatch({ eventId: `event-${Date.now().toString(36)}-${++eventSequence}`, expectedVersion: previous.session.version, action }));
  };
  const stopAudio = async () => { generation.current++; await preparedAudio.stop(); };
  const stopNative = async () => {
    const state = await nativeActiveWalk.stop();
    if (state.foreground || state.subscribed || state.status !== 'stopped') throw new Error('STOP_NOT_CONFIRMED');
  };
  const pause = async () => { if (current.current?.session.phase === 'active') await dispatch({ type: 'pause' }); };
  const urgentStop = async (after?: () => void | Promise<void>) => {
    if (stopping.current) return;
    stopping.current = true; setBusy(true); setError(null); generation.current++;
    try {
      const result = await runPriorityStop({ stopNative, stopAudio, pending: pending.current, pause });
      if (result.cleanupFailed) { if (mounted.current) setError(t.cleanup); return; }
      await after?.();
    } catch { if (mounted.current) setError(t.error); }
    finally { stopping.current = false; if (mounted.current) setBusy(false); }
  };
  const load = useCallback(() => operate(async () => {
    await preparedAudio.stop();
    const repo = await getCanonicalSession(); repository.current = repo;
    const id = await repo.getCurrentSessionId();
    if (id) {
      const next = await repo.open(id); publish(next);
      const checked = await verifyInstalledWalk(next.bundle);
      if (mounted.current) setVerification(checked);
    } else {
      const prepared = await prepareCanonicalWalk(initialLocale);
      if (mounted.current) setProposal(prepared);
    }
  }), [operate, initialLocale]);
  useEffect(() => {
    mounted.current = true; void load();
    const listener = preparedAudio.addListener(state => { if (mounted.current) setAudioState(state); });
    const lifecycle = AppState.addEventListener('change', state => {
      if (state !== 'active') { generation.current++; void preparedAudio.stop().catch(() => {}); }
      else if (repository.current && current.current) void repository.current.snapshot().then(publish).catch(() => setError(COPY[initialLocale].error));
    });
    return () => { mounted.current = false; generation.current++; listener.remove(); lifecycle.remove(); void preparedAudio.stop().catch(() => {}); };
    // The screen opens once; language changes stop sound without reopening a session.
  }, []);
  const choose = () => void operate(async () => {
    if (!proposal) return;
    if (proposal.verification.state === 'invalid_bundle') throw new Error('INVALID_BUNDLE');
    const repo = repository.current ?? await getCanonicalSession(); repository.current = repo;
    publish(await repo.open(proposal.bundle)); setVerification(proposal.verification); setProposal(undefined);
  });
  const command = (action: CanonicalSessionCommand['action']) => void operate(async () => {
    if (['continue', 'skip', 'confirm_end', 'abandon'].includes(action.type)) await stopAudio();
    if (['confirm_end', 'abandon'].includes(action.type)) await stopNative();
    await dispatch(action);
  });
  const speakEntry = (id: string) => void operate(async () => {
    const value = current.current; if (!value || AppState.currentState !== 'active') return;
    const token = ++generation.current;
    const entry = narrationEntries(value.bundle).find(item => item.id === id);
    if (entry?.audio.state !== 'available') throw new Error('AUDIO_UNAVAILABLE');
    const assetId = entry.audio.assetId;
    const asset = value.bundle.assets.items.find(item => item.id === assetId);
    if (!asset || asset.location.kind !== 'bundled') throw new Error('ASSET_MISSING');
    if (audioState?.status !== 'paused' || audioState.assetId !== assetId) await preparedAudio.stop();
    if (token !== generation.current || stopping.current || AppState.currentState !== 'active') return;
    await preparedAudio.play(`astana-${asset.location.path}`, asset.sha256);
  });
  const changeLocale = (next: Locale) => void operate(async () => { await stopAudio(); await onLocaleChange(next); setLocale(next); });
  const uiWalk = useMemo(() => snapshot && toCanonicalUiWalk(snapshot.bundle, locale), [snapshot, locale]);
  const uiSession = useMemo(() => snapshot && toCanonicalUiSession(snapshot.bundle, snapshot.session, locale), [snapshot, locale]);
  if (proposal) return <CanonicalPreview bundle={proposal.bundle} locale={locale} busy={busy} error={error} verification={proposal.verification}
    onChoose={choose} onCancel={() => void urgentStop(onBack)} onLocaleChange={changeLocale} />;
  if (!snapshot || !uiWalk || !uiSession) return <SafeAreaView style={s.page}><View style={s.loading}><Text style={s.title}>AstanaAI</Text>
    {busy && <ActivityIndicator color="#173F3B" />}<Text style={s.text}>{error ?? t.loading}</Text>
    {!busy && <Pressable onPress={() => void load()} style={s.button}><Text style={s.buttonText}>{t.retry}</Text></Pressable>}
    <Pressable onPress={() => void urgentStop(onBack)}><Text style={s.link}>{t.back}</Text></Pressable>
  </View></SafeAreaView>;
  const audioReady = verification && verification.state !== 'invalid_bundle' && !verification.missing.some(m => m.id !== 'map');
  return <WalkExperience locale={locale} walk={uiWalk} session={uiSession} busy={busy} error={error ?? (audioState?.status === 'error' ? t.audioError : null)}
    discoveries={snapshot.discoveries.map(d => ({ walkId: d.walkId, title: d.title[locale] }))}
    audio={{ available: !!audioReady, playing: audioState?.status === 'playing' || audioState?.status === 'loading', label: audioReady ? t.audio : t.unavailable }}
    locationStatus={t.gps} onLocaleChange={changeLocale}
    onStart={() => command({ type: 'start' })} onResume={() => command({ type: 'resume' })} onPause={() => void urgentStop()} onStop={() => void urgentStop()}
    onMarkStop={stopId => command({ type: 'mark_stop', stopId })} onAnswer={(stopId, choiceId) => command({ type: 'answer', stopId, choiceId })}
    onContinue={stopId => command({ type: 'continue', stopId })} onSkip={stopId => command({ type: 'skip', stopId })} onConfirmReturn={() => command({ type: 'confirm_end' })}
    onRestart={() => void operate(async () => { await stopNative(); await stopAudio(); if (current.current?.session.phase === 'active') await dispatch({ type: 'pause' });
      if (current.current && !['completed', 'abandoned'].includes(current.current.session.phase)) await dispatch({ type: 'abandon' });
      setProposal(await prepareCanonicalWalk(locale)); })}
    onSpeak={stopId => speakEntry(`chapter:${stopId}:${locale}`)} onSpeakPart={(stopId, part) => {
      const questId = snapshot.bundle.stops.find(stop => stop.id === stopId)?.questId;
      if (questId) speakEntry(`${questId}:${part}:${locale}`);
    }} onStopAudio={() => void stopAudio().catch(() => setError(t.audioError))}
    onPauseAudio={() => { generation.current++; void preparedAudio.pause().catch(() => setError(t.audioError)); }}
    onOpenCity={() => void urgentStop(onOpenCity)} onOpenDiagnostics={() => void urgentStop(onOpenDiagnostics)} onBackToSaved={() => void urgentStop(onBack)}
    onAbandon={() => Alert.alert(({ ru: 'Завершить прогулку досрочно?', kk: 'Серуенді ерте аяқтау керек пе?', en: 'End this walk early?' })[locale],
      ({ ru: 'Отмеченные шаги сохранятся. Полное прохождение не будет присуждено.', kk: 'Белгіленген қадамдар сақталады. Толық өту берілмейді.', en: 'Recorded steps are kept. Full completion will not be awarded.' })[locale],
      [{ text: ({ ru: 'Продолжить', kk: 'Жалғастыру', en: 'Keep walking' })[locale], style: 'cancel' },
        { text: ({ ru: 'Завершить', kk: 'Аяқтау', en: 'End walk' })[locale], style: 'destructive', onPress: () => void urgentStop(() => dispatch({ type: 'abandon' })) }])}
    onOpenExternalRoute={() => { const [lon, lat] = snapshot.bundle.originalOrigin.coordinate; void Linking.openURL(`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`).catch(() => setError(t.error)); }} />;
}
const s = StyleSheet.create({ page: { flex: 1, backgroundColor: '#F8F6EF', justifyContent: 'center', padding: 24 }, loading: { gap: 22 }, title: { fontSize: 36, fontWeight: '700', color: '#173F3B' }, text: { fontSize: 17, lineHeight: 26, color: '#173F3B' }, button: { borderRadius: 16, padding: 16, backgroundColor: '#173F3B' }, buttonText: { color: '#FFF', textAlign: 'center', fontWeight: '600' }, link: { padding: 16, textAlign: 'center', color: '#173F3B' } });
