import { useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, Platform, Pressable, ScrollView, StyleSheet, Text, View, type AppStateStatus } from 'react-native';
import type { CityLocale } from '../../city/model';

export type CityOpeningProps = {
  locale: CityLocale;
  topInset: number;
  bottomInset: number;
  compact: boolean;
  reduceMotion: boolean;
  screenReader: boolean;
  accessibilityReady: boolean;
  mapReady: boolean;
  onMapReveal: () => void;
  onUiReveal: () => void;
  onFinish: () => void;
  onSkip: () => void;
};

const PAPER = '#F8F6EF';
const INK = '#173F3B';
function currentAppState(): AppStateStatus {
  const state = AppState.currentState;
  return state === 'active' || state === 'background' || state === 'inactive' || state === 'extension' ? state : 'unknown';
}
const COPY = {
  ru: { title: 'Добро пожаловать в Астану!', eyebrow: 'ГОРОД, КОТОРЫЙ ОТКРЫВАЕТСЯ', body: 'Начнём с реки. Затем откроем характер каждого района.', skip: 'Сразу к карте →', continue: 'Открыть город →', foot: 'АСТАНА · 51° N' },
  kk: { title: 'Астанаға қош келдіңіз!', eyebrow: 'ӨЗІН ЖАҢАША АШАТЫН ҚАЛА', body: 'Алдымен өзенмен танысайық. Содан соң әр ауданның ерекшелігін ашамыз.', skip: 'Бірден картаға →', continue: 'Қаланы ашу →', foot: 'АСТАНА · 51° N' },
  en: { title: 'Welcome to Astana!', eyebrow: 'A CITY WAITING TO BE DISCOVERED', body: 'Begin with the river. Then discover the character of each district.', skip: 'Straight to the map →', continue: 'Discover the city →', foot: 'ASTANA · 51° N' },
} as const;

/** A paper curtain over a stable native map; no animation transforms the map surface. */
export function CityOpening(props: CityOpeningProps) {
  const { locale, topInset, bottomInset, compact, reduceMotion, screenReader, accessibilityReady, mapReady } = props;
  const t = COPY[locale];
  const [layoutHeight, setLayoutHeight] = useState(0);
  const [appState, setAppState] = useState<AppStateStatus>(currentAppState);
  const callbacks = useRef(props);
  callbacks.current = props;
  const ready = useRef(mapReady);
  ready.current = mapReady;
  const generation = useRef(0);
  const mounted = useRef(true);
  const done = useRef(false);
  const mapRevealed = useRef(false);
  const uiRevealed = useRef(false);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const attemptReveal = useRef<() => void>(() => {});
  const greetingOpacity = useRef(new Animated.Value(1)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleY = useRef(new Animated.Value(14)).current;
  const sealProgress = useRef(new Animated.Value(0)).current;
  const ruleProgress = useRef(new Animated.Value(0)).current;
  const upperY = useRef(new Animated.Value(0)).current;
  const lowerY = useRef(new Animated.Value(0)).current;
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const values = useRef([greetingOpacity, titleOpacity, titleY, sealProgress, ruleProgress, upperY, lowerY, controlsOpacity]).current;

  const cancel = () => {
    generation.current += 1;
    for (const timer of timers.current) clearTimeout(timer);
    timers.current.clear();
    for (const value of values) value.stopAnimation();
    attemptReveal.current = () => {};
  };
  const skip = () => {
    if (done.current || !mounted.current) return;
    done.current = true;
    cancel();
    callbacks.current.onSkip();
  };

  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', next => {
      // Stop immediately on backgrounding, before React has committed the state.
      if (next !== 'active') cancel();
      setAppState(next);
    });
    return () => { mounted.current = false; cancel(); subscription.remove(); };
    // Animated values and lifetime refs are stable for this mounted opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    cancel();
    if (done.current || appState !== 'active' || !accessibilityReady || layoutHeight <= 0) return;

    // A partly opened curtain must never replay over an already moving map.
    if (mapRevealed.current) { skip(); return; }

    upperY.setValue(0);
    lowerY.setValue(0);
    greetingOpacity.setValue(1);
    controlsOpacity.setValue(1);
    const manual = reduceMotion || screenReader;
    titleOpacity.setValue(manual ? 1 : 0);
    titleY.setValue(manual ? 0 : 14);
    sealProgress.setValue(manual ? 1 : 0);
    ruleProgress.setValue(manual ? 1 : 0);
    // Readers and people requesting reduced motion choose when to leave.
    if (manual) return cancel;

    const token = generation.current;
    const current = () => mounted.current && !done.current && generation.current === token;
    const later = (delay: number, action: () => void) => {
      const timer = setTimeout(() => {
        timers.current.delete(timer);
        if (current()) action();
      }, delay);
      timers.current.add(timer);
    };
    const animate = (value: Animated.Value, toValue: number, duration: number) =>
      Animated.timing(value, { toValue, duration, easing: Easing.out(Easing.cubic), useNativeDriver: true });

    Animated.parallel([
      animate(titleOpacity, 1, 740), animate(titleY, 0, 900),
      animate(sealProgress, 1, 1100), animate(ruleProgress, 1, 1000),
    ]).start();

    let gateOpen = false;
    let preparing = false;
    let readinessWatchdog: ReturnType<typeof setTimeout> | null = null;
    attemptReveal.current = () => {
      if (!current() || !gateOpen || !ready.current || preparing) return;
      preparing = true;
      // Readiness is bounded; an already started reveal may finish normally.
      if (readinessWatchdog) {
        clearTimeout(readinessWatchdog);
        timers.current.delete(readinessWatchdog);
        readinessWatchdog = null;
      }
      animate(greetingOpacity, 0, 450).start();
      later(150, () => {
        mapRevealed.current = true;
        callbacks.current.onMapReveal();
        Animated.parallel([
          animate(upperY, -(layoutHeight / 2 + 4), 1100),
          animate(lowerY, layoutHeight / 2 + 4, 1100),
        ]).start();
        later(1100, () => {
          if (!uiRevealed.current) {
            uiRevealed.current = true;
            callbacks.current.onUiReveal();
          }
          animate(controlsOpacity, 0, 180).start();
        });
        later(1650, () => {
          done.current = true;
          cancel();
          callbacks.current.onFinish();
        });
      });
    };
    later(1300, () => { gateOpen = true; attemptReveal.current(); });
    // A missing native readiness event cannot strand the user behind a curtain.
    readinessWatchdog = setTimeout(() => {
      if (readinessWatchdog) timers.current.delete(readinessWatchdog);
      readinessWatchdog = null;
      if (current()) skip();
    }, 5000);
    timers.current.add(readinessWatchdog);
    return cancel;
    // Callbacks and readiness live in refs, so a parent render cannot restart motion.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessibilityReady, appState, layoutHeight, reduceMotion, screenReader]);

  useEffect(() => { if (mapReady) attemptReveal.current(); }, [mapReady]);

  const manual = reduceMotion || screenReader;
  const panelHeight = Math.ceil(layoutHeight / 2) + 2;
  return <View style={s.root} accessibilityViewIsModal onLayout={event => {
    const next = event.nativeEvent.layout.height;
    if (next > 0) setLayoutHeight(previous => Math.abs(previous - next) > .5 ? next : previous);
  }}>
    <Animated.View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden pointerEvents="none"
      style={[s.panel, { top: 0, height: layoutHeight > 0 ? panelHeight : '50.2%', transform: [{ translateY: upperY }] }]}>
      <View style={s.upperGlow} />
    </Animated.View>
    <Animated.View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden pointerEvents="none"
      style={[s.panel, { bottom: 0, height: layoutHeight > 0 ? panelHeight : '50.2%', transform: [{ translateY: lowerY }] }]}>
      <View style={s.lowerGlow} />
    </Animated.View>

    <Animated.View style={[s.greeting, { top: topInset + 76, bottom: bottomInset + (manual ? 110 : 48), opacity: greetingOpacity }]}>
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View style={[s.content, { opacity: titleOpacity, transform: [{ translateY: titleY }] }]}>
          <Animated.View accessible={false} importantForAccessibility="no-hide-descendants" style={[s.seal, { transform: [
            { scale: sealProgress.interpolate({ inputRange: [0, 1], outputRange: [.86, 1] }) },
            { rotate: sealProgress.interpolate({ inputRange: [0, 1], outputRange: ['-12deg', '0deg'] }) },
          ] }]}>
            <View style={s.orbit} /><Text style={s.glyph}>А</Text><View style={s.dot} />
          </Animated.View>
          <Text style={s.eyebrow}>{t.eyebrow}</Text>
          <Text accessibilityRole="header" style={[s.title, compact && s.titleCompact]}>{t.title}</Text>
          <Animated.View accessible={false} style={[s.rule, { transform: [{ scaleX: ruleProgress.interpolate({ inputRange: [0, 1], outputRange: [.1, 1] }) }] }]} />
          <Text style={s.body}>{t.body}</Text>
        </Animated.View>
      </ScrollView>
    </Animated.View>

    <Animated.View style={[s.top, { paddingTop: topInset + 12, opacity: controlsOpacity }]}>
      <Animated.Text style={[s.brand, { opacity: greetingOpacity }]}>ASTANA / AI</Animated.Text>
      <Pressable accessibilityRole="button" onPress={skip} style={({ pressed }) => [s.skip, pressed && s.pressed]}>
        <Text style={s.skipText}>{t.skip}</Text>
      </Pressable>
    </Animated.View>
    <Animated.View style={[s.footer, { paddingBottom: bottomInset + 24, opacity: greetingOpacity }]}>
      {manual && <Pressable accessibilityRole="button" onPress={skip} style={({ pressed }) => [s.continue, pressed && s.pressed]}>
        <Text style={s.continueText}>{t.continue}</Text>
      </Pressable>}
      <Text style={s.foot}>{t.foot}</Text>
    </Animated.View>
  </View>;
}

const s = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  panel: { position: 'absolute', left: 0, right: 0, backgroundColor: PAPER, overflow: 'hidden' },
  upperGlow: { position: 'absolute', width: 330, height: 330, borderRadius: 165, top: -130, right: -100, backgroundColor: '#E9EEE1', opacity: .65 },
  lowerGlow: { position: 'absolute', width: 300, height: 300, borderRadius: 150, bottom: -170, left: -100, backgroundColor: '#DDEFF0', opacity: .55 },
  greeting: { position: 'absolute', left: 24, right: 24 },
  scroll: { flex: 1 }, scrollContent: { flexGrow: 1, justifyContent: 'center', paddingVertical: 16 }, content: { alignItems: 'center', paddingHorizontal: 9 },
  seal: { width: 104, height: 104, borderRadius: 52, borderWidth: 1, borderColor: '#C8D6C4', alignItems: 'center', justifyContent: 'center', marginBottom: 30 },
  orbit: { position: 'absolute', width: 78, height: 78, borderWidth: 1, borderRadius: 39, borderColor: '#DDE4D8' },
  glyph: { color: INK, fontSize: 43, fontFamily: Platform.OS === 'android' ? 'serif' : 'Georgia' },
  dot: { position: 'absolute', top: 16, right: 7, width: 10, height: 10, borderRadius: 5, backgroundColor: '#5FBDD6', borderWidth: 2, borderColor: PAPER },
  eyebrow: { fontSize: 9, fontWeight: '700', color: '#5A6F66', letterSpacing: 2, textAlign: 'center', marginBottom: 18 },
  title: { color: INK, fontSize: 39, lineHeight: 47, textAlign: 'center', fontFamily: Platform.OS === 'android' ? 'serif' : 'Georgia', fontWeight: '700' },
  titleCompact: { fontSize: 32, lineHeight: 39 },
  rule: { width: 44, height: 1, backgroundColor: '#B69E6B', marginVertical: 23 },
  body: { color: '#5A6F66', fontSize: 14, lineHeight: 23, maxWidth: 285, textAlign: 'center' },
  top: { position: 'absolute', top: 0, left: 24, right: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' },
  brand: { color: INK, fontSize: 12, fontWeight: '700', letterSpacing: 2.4 },
  skip: { minHeight: 48, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 16, justifyContent: 'center', backgroundColor: '#F8F6EFF2' },
  skipText: { color: INK, fontSize: 12, lineHeight: 20, fontWeight: '700', textAlign: 'center' },
  footer: { position: 'absolute', bottom: 0, left: 24, right: 24, alignItems: 'center', gap: 20 },
  continue: { alignSelf: 'stretch', minHeight: 48, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 16, backgroundColor: INK, alignItems: 'center', justifyContent: 'center' },
  continueText: { color: '#FFFFFF', fontSize: 14, lineHeight: 20, fontWeight: '700', textAlign: 'center' },
  foot: { color: '#5A6F66', fontSize: 10, letterSpacing: 2, textAlign: 'center' },
  pressed: { opacity: .65 },
});

export default CityOpening;
