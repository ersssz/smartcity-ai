import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, BackHandler, Easing, Linking, PanResponder, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, View, useWindowDimensions, type ScrollViewInstance } from 'react-native';
import { Camera, GeoJSONSource, Layer, Map, ViewAnnotation, type CameraRef, type StyleSpecification } from '@maplibre/maplibre-react-native';
import type { CityBounds, CityGuide, CityLocale, DistrictId } from '../../city/model';
import { CityOpening } from './CityOpening';

export type CityIntroProps = {
  guide: CityGuide;
  locale: CityLocale;
  onLocaleChange: (locale: CityLocale) => void;
  onFinish: () => void;
  busy?: boolean;
  error?: string | null;
  replay?: boolean;
};

const C = { paper: '#F8F6EF', ink: '#173F3B', forest: '#174D43', muted: '#5A6F66', line: '#DDE4D8', white: '#FFFFFF', water: '#5FBDD6', waterDark: '#2586A4', soft: '#E8EEE2', warning: '#8A4B29' };
const STREET_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
/** This style has no network sources: bundled geography is visible before any street tiles. */
const SCHEMATIC_STYLE: StyleSpecification = {
  version: 8, sources: {}, layers: [{ id: 'city-paper', type: 'background', paint: { 'background-color': '#F0F1E7' } }],
};
const COPY = {
  ru: {
    city: 'АСТАНА', subtitle: 'Знакомство с городом',
    riverEyebrow: '01 / РЕКА И ДВА БЕРЕГА', districtEyebrow: '02 / ХАРАКТЕР РАЙОНОВ', districtsTitle: 'У каждого района — свой характер',
    districtsBody: 'Коснитесь цветной области на карте или выберите название. Начните с того, что привлекло ваше внимание.',
    discover: 'Познакомиться с районами →', whole: 'Обзор города', river: 'Река и берега', districtCount: 'районов · выберите любой',
    experience: 'КАК ЗНАКОМИТЬСЯ', sources: 'О карте и источниках', hideSources: 'Скрыть источники', sourceDate: 'Проверено',
    firstWalk: 'К первой прогулке →', returnWalk: 'Вернуться к прогулке →', saving: 'Сохраняем…',
    streets: 'Улицы', scheme: 'Схема', streetLoading: 'Загружаем улицы… Схема остаётся доступной.',
    offline: 'Улицы не загрузились. Районы и река доступны на сохранённой схеме.',
    schemeHint: 'Сохранённая схема · улицы можно включить', onlineHint: 'Уличная подложка · интернет',
    selected: 'Выбран район', selectDistrict: 'Открыть район', wholeHint: 'Вернуться к обзору города', sourceError: 'Не удалось открыть источник. Попробуйте позже.',
    labels: 'Названия районов', geometry: 'Карта для знакомства с городом', openSourcesHint: 'Источники откроются во внешнем браузере.', leftBank: 'ЛЕВЫЙ БЕРЕГ', rightBank: 'ПРАВЫЙ БЕРЕГ', riverName: 'Есиль (Ишим)',
    expand: 'Развернуть карточку', collapse: 'Свернуть к карте', sheetHint: 'Текст внутри карточки можно прокручивать.',
    allBounds: 'Все границы районов', replayOpening: 'Повторить открытие города',
  },
  kk: {
    city: 'АСТАНА', subtitle: 'Қаламен танысу',
    riverEyebrow: '01 / ӨЗЕН ЖӘНЕ ЕКІ ЖАҒАЛАУ', districtEyebrow: '02 / АУДАНДАРДЫҢ ЕРЕКШЕЛІГІ', districtsTitle: 'Әр ауданның өз ерекшелігі бар',
    districtsBody: 'Картадағы түсті аймақты түртіңіз немесе атауын таңдаңыз. Назарыңызды аударған ауданнан бастаңыз.',
    discover: 'Аудандармен танысу →', whole: 'Қалаға шолу', river: 'Өзен және жағалаулар', districtCount: 'аудан · кез келгенін таңдаңыз',
    experience: 'ҚАЛАЙ ТАНЫСУҒА БОЛАДЫ', sources: 'Карта және дереккөздер', hideSources: 'Дереккөздерді жасыру', sourceDate: 'Тексерілді',
    firstWalk: 'Алғашқы серуенге →', returnWalk: 'Серуенге оралу →', saving: 'Сақталуда…',
    streets: 'Көшелер', scheme: 'Сызба', streetLoading: 'Көшелер жүктелуде… Сызба қолжетімді.',
    offline: 'Көшелер жүктелмеді. Аудандар мен өзен сақталған сызбада қолжетімді.',
    schemeHint: 'Сақталған сызба · көшелерді қосуға болады', onlineHint: 'Көше картасы · интернет',
    selected: 'Таңдалған аудан', selectDistrict: 'Ауданды ашу', wholeHint: 'Қала шолуына оралу', sourceError: 'Дереккөз ашылмады. Кейінірек қайталап көріңіз.',
    labels: 'Аудан атаулары', geometry: 'Қаламен танысу картасы', openSourcesHint: 'Дереккөздер сыртқы браузерде ашылады.', leftBank: 'СОЛ ЖАҒАЛАУ', rightBank: 'ОҢ ЖАҒАЛАУ', riverName: 'Есіл (Ишим)',
    expand: 'Карточканы ашу', collapse: 'Картаға жинау', sheetHint: 'Карточка ішіндегі мәтінді айналдыруға болады.',
    allBounds: 'Аудандардың барлық шекаралары', replayOpening: 'Қаланың ашылуын қайта көру',
  },
  en: {
    city: 'ASTANA', subtitle: 'Get to know the city',
    riverEyebrow: '01 / A RIVER AND TWO BANKS', districtEyebrow: '02 / SIX DIFFERENT CHARACTERS', districtsTitle: 'Every district has its own character',
    districtsBody: 'Tap a coloured area on the map or choose its name. Begin with the one that catches your eye.',
    discover: 'Meet the districts →', whole: 'City overview', river: 'River and banks', districtCount: 'districts · choose any one',
    experience: 'A WAY TO EXPLORE', sources: 'About this map and sources', hideSources: 'Hide sources', sourceDate: 'Checked',
    firstWalk: 'To your first walk →', returnWalk: 'Return to your walk →', saving: 'Saving…',
    streets: 'Streets', scheme: 'Outline', streetLoading: 'Loading streets… The saved outline remains available.',
    offline: 'Streets did not load. Districts and the river are available in the saved outline.',
    schemeHint: 'Saved outline · add streets if you like', onlineHint: 'Street base map · internet',
    selected: 'Selected district', selectDistrict: 'Explore district', wholeHint: 'Return to the city overview', sourceError: 'Could not open this source. Please try again later.',
    labels: 'District names', geometry: 'A first look at the city', openSourcesHint: 'Sources open in your external browser.', leftBank: 'LEFT BANK', rightBank: 'RIGHT BANK', riverName: 'Esil (Ishim)',
    expand: 'Expand card', collapse: 'Collapse to map', sheetHint: 'Scroll inside the card to read more.',
    allBounds: 'All district boundaries', replayOpening: 'Replay the city opening',
  },
} as const;

function openingBounds(bounds: CityBounds): CityBounds {
  const horizontal = (bounds[2] - bounds[0]) * .08;
  const vertical = (bounds[3] - bounds[1]) * .08;
  return [bounds[0] - horizontal, bounds[1] - vertical, bounds[2] + horizontal, bounds[3] + vertical];
}

function Action({ label, onPress, quiet = false, disabled = false, selected = false, accessibilityLabel }: {
  label: string; onPress: () => void; quiet?: boolean; disabled?: boolean; selected?: boolean; accessibilityLabel?: string;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ disabled, selected }}
    disabled={disabled} onPress={onPress} style={({ pressed }) => [s.action, quiet ? s.quietAction : s.primaryAction, pressed && s.pressed, disabled && s.disabled]}>
    <Text style={[s.actionText, quiet ? s.quietActionText : s.primaryActionText]}>{label}</Text>
  </Pressable>;
}

/** Browsing only: this module neither requests location nor changes any walk progress. */
export function CityIntro({ guide, locale, onLocaleChange, onFinish, busy = false, error, replay = false }: CityIntroProps) {
  const t = COPY[locale];
  const { height, width, fontScale } = useWindowDimensions();
  const [viewportHeight, setViewportHeight] = useState(height);
  const [stage, setStage] = useState<'river' | 'districts'>(replay ? 'districts' : 'river');
  const [fullOverview, setFullOverview] = useState(false);
  const [selectedId, setSelectedId] = useState<DistrictId | null>(null);
  const [welcoming, setWelcoming] = useState(!replay);
  const [openingLabelsVisible, setOpeningLabelsVisible] = useState(replay);
  const [reduceMotion, setReduceMotion] = useState(true);
  const [motionKnown, setMotionKnown] = useState(false);
  const [screenReader, setScreenReader] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [linkError, setLinkError] = useState(false);
  const [streetMode, setStreetMode] = useState(false);
  const [streetLoaded, setStreetLoaded] = useState(false);
  const [streetFailed, setStreetFailed] = useState(false);
  const [mapRevision, setMapRevision] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [captionHeight, setCaptionHeight] = useState(44);
  const [footerHeight, setFooterHeight] = useState(124);
  const [chromeHeight, setChromeHeight] = useState(0);
  const camera = useRef<CameraRef>(null);
  const scroll = useRef<ScrollViewInstance>(null);
  const mounted = useRef(true);
  const introUi = useRef(new Animated.Value(replay ? 1 : 0)).current;
  const captionReveal = useRef(new Animated.Value(replay ? 1 : 0)).current;
  const introMapRevealed = useRef(false);
  const snapNextFit = useRef(false);
  const cardOpacity = useRef(new Animated.Value(1)).current;
  const sheetHeight = useRef(new Animated.Value(height * .35)).current;
  const dragOrigin = useRef(0);
  const topInset = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 44;
  // Edge-to-edge Android can lay this root underneath the system bars while
  // WindowDimensions excludes them. Measure the actual root, then reserve its
  // excess below the status bar. Without a WindowInsets provider, 48dp is an
  // explicit conservative fallback for the verified three-button navigation UI.
  const bottomInset = Platform.OS === 'android' ? Math.max(48, viewportHeight - height - topInset) : 20;
  const compact = viewportHeight < 690 || width < 350;
  // Keep a compact reading viewport above the fixed CTA. Short screens and
  // larger text get a little more room, without making the default a half-sheet.
  const collapsedHeight = Math.min(viewportHeight * .45, Math.max(viewportHeight * .35, footerHeight + 44 + 96 * Math.min(fontScale, 1.5)));
  const expandedHeight = Math.max(collapsedHeight, Math.min(viewportHeight * .60, viewportHeight - topInset - 148));
  const targetHeight = sheetExpanded ? expandedHeight : collapsedHeight;
  const selected = guide.districts.find(district => district.id === selectedId) ?? null;
  const overviewBounds = useMemo<CityBounds>(() => {
    if (stage !== 'river') return fullOverview ? guide.bounds : (guide.overviewBounds ?? guide.bounds);
    const bounds = guide.riverBounds ?? guide.bounds;
    // Bank names are editorial annotation anchors outside the river's own
    // bounds. Include them in the camera only; source coordinates stay intact.
    const anchors = [...Object.values(guide.bankLabelPoints ?? {}), ...(guide.riverLabelPoint ? [guide.riverLabelPoint] : [])];
    return [Math.min(bounds[0], ...anchors.map(point => point[0])), Math.min(bounds[1], ...anchors.map(point => point[1])),
      Math.max(bounds[2], ...anchors.map(point => point[0])), Math.max(bounds[3], ...anchors.map(point => point[1]))];
  }, [fullOverview, guide.bankLabelPoints, guide.bounds, guide.overviewBounds, guide.riverBounds, guide.riverLabelPoint, stage]);
  const mapPadding = useMemo(() => ({ top: Math.max(topInset + 140, chromeHeight + 24), left: 16, right: 16, bottom: targetHeight + captionHeight + 12 }), [captionHeight, chromeHeight, targetHeight, topInset]);
  const initialView = useRef({ bounds: replay ? overviewBounds : openingBounds(overviewBounds), padding: mapPadding });
  const districts = useMemo<GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon>>(() => ({
    ...guide.boundaries,
    features: guide.boundaries.features.map(feature => ({ ...feature, properties: { ...feature.properties,
      displayColor: guide.districts.find(district => district.id === feature.properties.id)?.color ?? C.soft,
    } })),
  }), [guide.boundaries, guide.districts]);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    // Both probes must finish before an automatic opening can begin.
    void Promise.all([
      AccessibilityInfo.isReduceMotionEnabled().catch(() => true),
      AccessibilityInfo.isScreenReaderEnabled().catch(() => true),
    ]).then(([motion, reader]) => {
      if (active) { setReduceMotion(motion); setScreenReader(reader); setMotionKnown(true); }
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    const readerSubscription = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReader);
    return () => { active = false; mounted.current = false; subscription.remove(); readerSubscription.remove(); };
  }, []);

  useEffect(() => () => { introUi.stopAnimation(); captionReveal.stopAnimation(); cardOpacity.stopAnimation(); sheetHeight.stopAnimation(); }, [captionReveal, cardOpacity, introUi, sheetHeight]);

  const animateSheet = useCallback((toValue: number) => {
    sheetHeight.stopAnimation();
    if (reduceMotion) { sheetHeight.setValue(toValue); return; }
    Animated.timing(sheetHeight, { toValue, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [reduceMotion, sheetHeight]);
  useEffect(() => { animateSheet(targetHeight); }, [animateSheet, targetHeight]);
  const settleSheet = useCallback((expanded: boolean) => {
    setSheetExpanded(expanded);
    // A drag may settle in its existing state, so the state effect alone is
    // insufficient to snap its temporary height back to the exact target.
    animateSheet(expanded ? expandedHeight : collapsedHeight);
  }, [animateSheet, collapsedHeight, expandedHeight]);
  const handlePan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dy) > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderGrant: () => { sheetHeight.stopAnimation(value => { dragOrigin.current = value; }); },
    onPanResponderMove: (_event, gesture) => {
      if (!reduceMotion) sheetHeight.setValue(Math.max(collapsedHeight, Math.min(expandedHeight, dragOrigin.current - gesture.dy)));
    },
    onPanResponderRelease: (_event, gesture) => {
      const expanded = Math.abs(gesture.dy) > 24 || Math.abs(gesture.vy) > .25 ? gesture.dy < 0 : dragOrigin.current - gesture.dy > (collapsedHeight + expandedHeight) / 2;
      settleSheet(expanded);
    },
    onPanResponderTerminate: () => settleSheet(sheetExpanded),
  }), [collapsedHeight, expandedHeight, reduceMotion, settleSheet, sheetExpanded, sheetHeight]);

  const fit = useCallback((bounds: CityBounds, duration = 850) => {
    if (mapReady) camera.current?.fitBounds(bounds, { padding: mapPadding, duration: reduceMotion ? 0 : duration, easing: 'ease' });
  }, [mapPadding, mapReady, reduceMotion]);
  useEffect(() => {
    if (!mapReady) return;
    if (welcoming) {
      if (!introMapRevealed.current) fit(openingBounds(overviewBounds), 0);
      return;
    }
    fit(selected?.bounds ?? overviewBounds, snapNextFit.current ? 0 : 850);
    snapNextFit.current = false;
  }, [fit, mapReady, overviewBounds, selected?.bounds, mapRevision, welcoming]);
  const finishOpening = useCallback(() => {
    introUi.stopAnimation(); captionReveal.stopAnimation();
    introUi.setValue(1); captionReveal.setValue(1);
    setOpeningLabelsVisible(true);
    snapNextFit.current = true;
    setWelcoming(false);
  }, [captionReveal, introUi]);
  const revealMap = useCallback(() => {
    // Skip/Back/Reduce Motion settles the same final state without a late camera fly.
    snapNextFit.current = true;
    fit(overviewBounds, 0);
    finishOpening();
  }, [finishOpening, fit, overviewBounds]);
  const revealOpeningMap = useCallback(() => {
    introMapRevealed.current = true;
    fit(overviewBounds, 1100);
    Animated.timing(captionReveal, { toValue: 1, duration: reduceMotion ? 0 : 250, useNativeDriver: true }).start();
  }, [captionReveal, fit, overviewBounds, reduceMotion]);
  const revealOpeningUi = useCallback(() => {
    // Android annotations are bitmap snapshots: mount final, static children.
    // Native-driver opacity on their child would leave an invisible cached bitmap.
    setOpeningLabelsVisible(true);
    Animated.timing(introUi, { toValue: 1, duration: reduceMotion ? 0 : 550, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [introUi, reduceMotion]);
  const beginOpening = useCallback(() => {
    introUi.stopAnimation(); captionReveal.stopAnimation();
    introUi.setValue(0); captionReveal.setValue(0);
    introMapRevealed.current = false; snapNextFit.current = false;
    setOpeningLabelsVisible(false);
    setSelectedId(null); setFullOverview(false); setStage('river'); setShowSources(false);
    if (streetMode) setMapReady(false);
    setStreetMode(false); setStreetFailed(false); settleSheet(false); setWelcoming(true);
  }, [captionReveal, introUi, settleSheet, streetMode]);
  useEffect(() => {
    cardOpacity.stopAnimation();
    cardOpacity.setValue(reduceMotion ? 1 : .55);
    const transition = Animated.timing(cardOpacity, { toValue: 1, duration: reduceMotion ? 0 : 320, useNativeDriver: true });
    transition.start();
    scroll.current?.scrollTo({ y: 0, animated: false });
    setShowSources(false); setLinkError(false);
    return () => transition.stop();
  }, [cardOpacity, reduceMotion, selectedId, stage]);

  const wholeCity = useCallback(() => { setStage('districts'); setFullOverview(false); setSelectedId(null); settleSheet(false); fit(guide.overviewBounds ?? guide.bounds); }, [fit, guide.bounds, guide.overviewBounds, settleSheet]);
  const allBoundaries = useCallback(() => {
    setStage('districts'); setFullOverview(true); setSelectedId(null); settleSheet(false); fit(guide.bounds);
  }, [fit, guide.bounds, settleSheet]);
  const selectDistrict = useCallback((id: string | undefined) => {
    const district = guide.districts.find(item => item.id === id);
    if (!district) return;
    if (welcoming) revealMap();
    setStage('districts'); setFullOverview(false); setSelectedId(district.id); settleSheet(false);
    fit(district.bounds);
  }, [fit, guide.districts, revealMap, settleSheet, welcoming]);
  const onBack = useCallback(() => {
    if (welcoming) revealMap();
    else if (sheetExpanded) settleSheet(false);
    else if (showSources) setShowSources(false);
    else if (fullOverview) wholeCity();
    else if (selectedId) wholeCity();
    else if (stage === 'districts' && !replay) setStage('river');
    else if (!busy) onFinish();
    return true;
  }, [busy, fullOverview, onFinish, replay, revealMap, selectedId, settleSheet, sheetExpanded, showSources, stage, welcoming, wholeCity]);
  useEffect(() => { const subscription = BackHandler.addEventListener('hardwareBackPress', onBack); return () => subscription.remove(); }, [onBack]);

  const failStreets = useCallback(() => { setStreetMode(false); setStreetLoaded(false); setStreetFailed(true); }, []);
  useEffect(() => {
    if (!streetMode || streetLoaded) return;
    const timer = setTimeout(failStreets, 6000);
    return () => clearTimeout(timer);
  }, [failStreets, streetLoaded, streetMode]);
  const toggleStreets = useCallback(() => {
    setStreetMode(current => !current); setStreetLoaded(false); setStreetFailed(false);
  }, []);
  const openSource = useCallback(async (url: string) => {
    setLinkError(false);
    try { await Linking.openURL(url); } catch { if (mounted.current) setLinkError(true); }
  }, []);
  const sources = selected ? selected.sources : guide.riverSources;
  const transitionDuration = reduceMotion ? 0 : 420;

  return <View style={s.screen} onLayout={event => {
    const measured = event.nativeEvent.layout.height;
    if (measured > 0) setViewportHeight(previous => Math.abs(previous - measured) > .5 ? measured : previous);
  }}>
    <StatusBar barStyle="dark-content" />
    <View style={s.mapContainer} pointerEvents={welcoming ? 'none' : 'auto'} accessibilityElementsHidden={welcoming} importantForAccessibility={welcoming ? 'no-hide-descendants' : 'auto'}>
      <Map style={s.map} mapStyle={streetMode ? STREET_STYLE : SCHEMATIC_STYLE} attribution={streetMode} logo={false} compass={false}
        attributionPosition={{ top: topInset + 112, right: 12 }} touchRotate={false} touchPitch={false}
        onDidFailLoadingMap={() => { if (streetMode) failStreets(); }}
        onDidFinishLoadingMap={() => { if (streetMode) setStreetLoaded(true); }}
        onDidFinishRenderingMapFully={() => setMapReady(true)}
        onDidFinishLoadingStyle={() => setMapRevision(value => value + 1)}>
        <Camera ref={camera} initialViewState={initialView.current} />
        <GeoJSONSource id="city-districts" data={districts} onPress={event => {
          const id: unknown = event.nativeEvent.features[0]?.properties?.id;
          if (typeof id === 'string') selectDistrict(id);
        }}>
          <Layer id="city-district-fill" type="fill" paint={{
            'fill-color': ['get', 'displayColor'],
            'fill-opacity': stage === 'river' ? .20 : selectedId ? ['case', ['==', ['get', 'id'], selectedId], .74, .17] : .54,
            'fill-opacity-transition': { duration: transitionDuration, delay: 0 },
            'fill-color-transition': { duration: transitionDuration, delay: 0 },
          }} />
          <Layer id="city-district-outline" type="line" paint={{
            'line-color': selectedId ? ['case', ['==', ['get', 'id'], selectedId], C.ink, '#FFFFFF'] : '#FFFFFF',
            'line-width': selectedId ? ['case', ['==', ['get', 'id'], selectedId], 2.8, 1.3] : 1.7,
            'line-opacity': .93,
          }} />
        </GeoJSONSource>
        <GeoJSONSource id="city-esil" data={guide.river}>
          <Layer id="city-esil-halo" type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }} paint={{ 'line-color': '#F8FFFF', 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 5, 12, 13, 16, 20], 'line-opacity': .95 }} />
          <Layer id="city-esil-water" type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }} paint={{ 'line-color': C.water, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 2.5, 12, 8, 16, 14], 'line-opacity': 1 }} />
        </GeoJSONSource>
        {stage === 'river' && openingLabelsVisible && guide.bankLabelPoints && <>
          <ViewAnnotation key={`left-${locale}`} id={`city-left-bank-${locale}`} lngLat={guide.bankLabelPoints.left}>
            <View collapsable={false} style={s.bankLabel}><Text style={s.bankLabelText}>{t.leftBank}</Text></View>
          </ViewAnnotation>
          <ViewAnnotation key={`right-${locale}`} id={`city-right-bank-${locale}`} lngLat={guide.bankLabelPoints.right}>
            <View collapsable={false} style={s.bankLabel}><Text style={s.bankLabelText}>{t.rightBank}</Text></View>
          </ViewAnnotation>
        </>}
        {stage === 'river' && openingLabelsVisible && guide.riverLabelPoint && <ViewAnnotation key={`river-${locale}`} id={`city-river-name-${locale}`} lngLat={guide.riverLabelPoint}>
          <View collapsable={false} style={s.riverMapLabel}><Text style={s.riverMapLabelText}>{t.riverName}</Text></View>
        </ViewAnnotation>}
        {stage === 'districts' && guide.districts.map(district => <ViewAnnotation key={`${district.id}-${locale}-${selectedId === district.id}`} id={`city-label-${district.id}-${locale}-${selectedId === district.id}`} lngLat={district.center} onPress={() => selectDistrict(district.id)}>
          <View collapsable={false} style={[s.mapLabel, selectedId === district.id && s.selectedMapLabel]}>
            <Text style={[s.mapLabelText, selectedId === district.id && s.selectedMapLabelText]}>{district.name}</Text>
          </View>
        </ViewAnnotation>)}
      </Map>
    </View>

    <Animated.View pointerEvents={welcoming ? 'none' : 'box-none'} style={[s.chrome, { paddingTop: topInset + 8, opacity: introUi, transform: [{ translateY: introUi.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]} onLayout={event => setChromeHeight(event.nativeEvent.layout.height)} accessibilityElementsHidden={welcoming} importantForAccessibility={welcoming ? 'no-hide-descendants' : 'auto'}>
      <View style={s.header}>
        <View style={s.headerTitle}>
          <Text style={s.city} maxFontSizeMultiplier={1.2}>{t.city}</Text><Text style={s.subtitle} maxFontSizeMultiplier={1.3}>{t.subtitle}</Text>
        </View>
        <View style={s.languages} accessibilityLabel="Language">
          {(['ru', 'kk', 'en'] as CityLocale[]).map(language => <Pressable key={language} accessibilityRole="button" accessibilityLabel={{ ru: 'Русский', kk: 'Қазақша', en: 'English' }[language]}
            accessibilityState={{ selected: locale === language }} onPress={() => onLocaleChange(language)} style={({ pressed }) => [s.language, locale === language && s.languageSelected, pressed && s.pressed]}>
            <Text maxFontSizeMultiplier={1.3} style={[s.languageText, locale === language && s.languageTextSelected]}>{language === 'kk' ? 'ҚАЗ' : language.toUpperCase()}</Text>
          </Pressable>)}
        </View>
      </View>
      <View style={s.tools}>
        <Pressable accessibilityRole="button" accessibilityLabel={t.wholeHint} onPress={wholeCity} style={({ pressed }) => [s.tool, pressed && s.pressed]}>
          <Text style={s.toolIcon}>⌖</Text><Text style={s.toolText}>{t.whole}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t.replayOpening} onPress={beginOpening} style={({ pressed }) => [s.tool, pressed && s.pressed]}>
          <Text style={s.toolIcon}>↻</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: streetMode }} onPress={toggleStreets} style={({ pressed }) => [s.tool, streetMode && s.toolSelected, pressed && s.pressed]}>
          <Text style={[s.toolText, streetMode && s.toolTextSelected]}>{streetMode ? t.scheme : t.streets}</Text>
        </Pressable>
      </View>
    </Animated.View>

    <View pointerEvents={welcoming ? 'none' : 'box-none'} style={s.bottom} accessibilityElementsHidden={welcoming} importantForAccessibility={welcoming ? 'no-hide-descendants' : 'auto'}>
      <Animated.View style={[s.mapCaption, { opacity: captionReveal }]} onLayout={event => setCaptionHeight(event.nativeEvent.layout.height)}><View style={s.waterDot} /><Text style={s.mapCaptionText}>{streetMode ? (streetLoaded ? t.onlineHint : t.streetLoading) : (streetFailed ? t.offline : t.schemeHint)}</Text>
        <Pressable accessibilityRole="link" onPress={() => { void openSource('https://www.openstreetmap.org/copyright'); }} style={s.mapCredit}><Text style={s.mapCreditText}>© OpenStreetMap</Text></Pressable>
      </Animated.View>
      <Animated.View style={{ opacity: introUi, transform: [{ translateY: introUi.interpolate({ inputRange: [0, 1], outputRange: [36, 0] }) }] }}>
      <Animated.View style={[s.card, { height: sheetHeight }]}>
        <View {...handlePan.panHandlers}>
          <Pressable accessibilityRole="button" accessibilityLabel={sheetExpanded ? t.collapse : t.expand} accessibilityHint={t.sheetHint}
            accessibilityState={{ expanded: sheetExpanded }} onPress={() => settleSheet(!sheetExpanded)} style={({ pressed }) => [s.handleButton, pressed && s.pressed]}>
            <View style={s.handle} /><Text style={s.handleText}>{sheetExpanded ? '⌄ ' : '⌃ '}{sheetExpanded ? t.collapse : t.expand}</Text>
          </Pressable>
        </View>
        <ScrollView ref={scroll} style={s.cardScroll} contentContainerStyle={s.cardContent} showsVerticalScrollIndicator keyboardShouldPersistTaps="handled">
          <Animated.View style={{ opacity: cardOpacity }}>
            <View style={s.eyebrowRow}><View style={[s.chapterDot, selected && { backgroundColor: selected.color }]} /><Text style={s.eyebrow}>{stage === 'river' ? t.riverEyebrow : t.districtEyebrow}</Text></View>
            {stage === 'river' ? <>
              <Text accessibilityRole="header" style={[s.title, compact && s.titleCompact]}>{guide.riverTitle}</Text>
              <Text style={s.body}>{guide.riverDescription}</Text>
              <View style={s.riverLegend}><View style={s.riverLine} /><Text style={s.riverLegendText}>{t.riverName}</Text></View>
              <Action label={t.discover} onPress={wholeCity} />
            </> : <>
              <Text accessibilityRole="header" style={[s.title, compact && s.titleCompact]}>{selected ? selected.name : t.districtsTitle}</Text>
              {selected ? <Text style={s.tagline}>{selected.tagline}</Text> : <Text style={s.body}>{t.districtsBody}</Text>}
              <Text style={s.districtCount}>{guide.districts.length} {t.districtCount}</Text>
              <View style={s.districtChips} accessibilityLabel={t.labels}>
                {guide.districts.map(district => <Pressable key={district.id} accessibilityRole="button" accessibilityState={{ selected: selectedId === district.id }}
                  accessibilityLabel={`${t.selectDistrict}: ${district.name}`} onPress={() => selectDistrict(district.id)}
                  style={({ pressed }) => [s.chip, selectedId === district.id && s.selectedChip, pressed && s.pressed]}>
                  <View style={[s.chipDot, { backgroundColor: district.color }]} /><Text style={[s.chipText, selectedId === district.id && s.selectedChipText]}>{district.name}</Text>
                </Pressable>)}
              </View>
              {selected && <>
                <Text style={s.body}>{selected.description}</Text>
                <View style={s.experience}><Text style={s.experienceEyebrow}>{t.experience}</Text><Text style={s.experienceBody}>{selected.experience}</Text></View>
              </>}
              <View style={s.browseActions}>
                {selected && <Action label={t.whole} quiet onPress={wholeCity} />}
                <Action label={t.river} quiet onPress={() => { setSelectedId(null); setFullOverview(false); setStage('river'); settleSheet(false); }} />
              </View>
            </>}
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: showSources }} onPress={() => setShowSources(value => !value)} style={s.sourceToggle}>
              <Text style={s.sourceToggleText}>{showSources ? '−' : '+'} {showSources ? t.hideSources : t.sources}</Text>
            </Pressable>
            {showSources && <View style={s.sourcePanel}>
              <Text style={s.sourceHeading}>{t.geometry}</Text><Text style={s.note}>{guide.geometryNote}</Text>
              <Action label={t.allBounds} quiet onPress={allBoundaries} />
              <Text style={s.note}>{guide.attribution}</Text>
              <Pressable accessibilityRole="link" onPress={() => { void openSource('https://www.openstreetmap.org/copyright'); }} style={s.sourceLink}><Text style={s.sourceLinkText}>© OpenStreetMap contributors · ODbL</Text></Pressable>
              {streetMode && <Pressable accessibilityRole="link" onPress={() => { void openSource('https://openfreemap.org/'); }} style={s.sourceLink}><Text style={s.sourceLinkText}>OpenFreeMap · OpenMapTiles</Text></Pressable>}
              <Text style={s.note}>{t.openSourcesHint}</Text>
              {sources.map(source => <Pressable key={source.id} accessibilityRole="link" onPress={() => { void openSource(source.url); }} style={s.sourceLink}>
                <Text style={s.sourceLinkText}>{source.title} ↗</Text><Text style={s.sourceDate}>{t.sourceDate}: {source.checkedAt}</Text>
              </Pressable>)}
              {linkError && <Text accessibilityRole="alert" style={s.error}>{t.sourceError}</Text>}
            </View>}
          </Animated.View>
        </ScrollView>
        <View style={[s.footer, { paddingBottom: 18 + bottomInset }]} onLayout={event => setFooterHeight(event.nativeEvent.layout.height)}>
          {error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
          <Action label={busy ? t.saving : replay ? t.returnWalk : t.firstWalk} onPress={onFinish} disabled={busy} />
        </View>
      </Animated.View>
      </Animated.View>
    </View>

    {welcoming && <CityOpening locale={locale} topInset={topInset} bottomInset={bottomInset} compact={compact}
      reduceMotion={reduceMotion} screenReader={screenReader} accessibilityReady={motionKnown} mapReady={mapReady}
      onMapReveal={revealOpeningMap} onUiReveal={revealOpeningUi} onFinish={finishOpening} onSkip={revealMap} />}
  </View>;
}

const s = StyleSheet.create({
  mapCredit: { minHeight: 44, justifyContent: 'center', marginLeft: 8 }, mapCreditText: { fontSize: 10, color: C.ink, textDecorationLine: 'underline' },
  screen: { flex: 1, backgroundColor: C.paper }, mapContainer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }, map: { flex: 1 },
  chrome: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 16, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F8F6EFF5', borderRadius: 22, paddingLeft: 18, paddingRight: 7, paddingVertical: 9, elevation: 3, shadowColor: C.ink, shadowOffset: { width: 0, height: 3 }, shadowOpacity: .08, shadowRadius: 12 },
  headerTitle: { flex: 1 }, city: { color: C.ink, fontSize: 23, fontFamily: Platform.OS === 'android' ? 'serif' : 'Georgia', letterSpacing: 2.4, fontWeight: '700' }, subtitle: { color: C.muted, fontSize: 11, marginTop: 2 },
  languages: { flexDirection: 'row', backgroundColor: C.soft, borderRadius: 15, padding: 2 }, language: { minWidth: 44, minHeight: 44, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center', borderRadius: 13 }, languageSelected: { backgroundColor: C.ink }, languageText: { color: C.ink, fontSize: 10, fontWeight: '700' }, languageTextSelected: { color: C.white },
  tools: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 }, tool: { minHeight: 44, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 16, flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: '#F8F6EFF5', elevation: 2 }, toolSelected: { backgroundColor: C.ink }, toolIcon: { fontSize: 22, color: C.ink }, toolText: { fontSize: 12, fontWeight: '700', color: C.ink }, toolTextSelected: { color: C.white },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0 }, mapCaption: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginLeft: 16, marginRight: 16, marginBottom: 4, paddingHorizontal: 10, borderRadius: 12, backgroundColor: '#F8F6EFF0', maxWidth: '92%' }, waterDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.waterDark, marginRight: 7 }, mapCaptionText: { flexShrink: 1, fontSize: 10, color: C.muted, lineHeight: 14 },
  card: { backgroundColor: C.paper, borderTopLeftRadius: 30, borderTopRightRadius: 30, overflow: 'hidden', elevation: 12, shadowColor: C.ink, shadowOffset: { width: 0, height: -3 }, shadowOpacity: .12, shadowRadius: 18 }, handleButton: { minHeight: 44, paddingVertical: 6, alignItems: 'center', justifyContent: 'center', gap: 4 }, handle: { width: 34, height: 4, borderRadius: 3, backgroundColor: '#CDD6C9' }, handleText: { fontSize: 10, color: C.muted }, cardScroll: { flex: 1, minHeight: 0 }, cardContent: { paddingHorizontal: 24, paddingBottom: 16 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }, chapterDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: C.water }, eyebrow: { color: C.muted, fontSize: 10, letterSpacing: 1.4, fontWeight: '700', flexShrink: 1 },
  title: { color: C.ink, fontSize: 29, lineHeight: 34, fontFamily: Platform.OS === 'android' ? 'serif' : 'Georgia', fontWeight: '700', marginBottom: 9 }, titleCompact: { fontSize: 25, lineHeight: 30 }, body: { color: C.muted, fontSize: 14, lineHeight: 21, marginBottom: 14 }, tagline: { color: C.ink, fontSize: 16, lineHeight: 23, marginBottom: 12 },
  riverLegend: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 14 }, riverLine: { width: 25, height: 4, borderRadius: 3, backgroundColor: C.water }, riverLegendText: { fontSize: 11, color: C.waterDark, fontWeight: '700' },
  districtCount: { color: C.muted, fontSize: 10, letterSpacing: .6, marginBottom: 8 }, districtChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 15 }, chip: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#FFFFFFB8', borderRadius: 15, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12, paddingVertical: 9 }, selectedChip: { backgroundColor: C.ink, borderColor: C.ink }, chipDot: { width: 9, height: 9, borderRadius: 5 }, chipText: { color: C.ink, fontSize: 12, fontWeight: '600' }, selectedChipText: { color: C.white },
  experience: { backgroundColor: C.soft, borderRadius: 16, padding: 15, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: C.forest }, experienceEyebrow: { color: C.forest, fontSize: 9, fontWeight: '700', letterSpacing: 1.3, marginBottom: 6 }, experienceBody: { color: C.ink, fontSize: 13, lineHeight: 20 }, browseActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  sourceToggle: { minHeight: 44, justifyContent: 'center', paddingVertical: 10 }, sourceToggleText: { color: C.muted, fontSize: 11, textDecorationLine: 'underline' }, sourcePanel: { padding: 13, borderRadius: 14, backgroundColor: '#EDF0E7', marginBottom: 6 }, sourceHeading: { color: C.ink, fontWeight: '700', fontSize: 11, marginBottom: 7 }, note: { color: C.muted, fontSize: 11, lineHeight: 17, marginBottom: 7 }, sourceLink: { minHeight: 44, justifyContent: 'center', paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line }, sourceLinkText: { color: C.forest, fontSize: 12, lineHeight: 18, textDecorationLine: 'underline' }, sourceDate: { color: C.muted, fontSize: 10, marginTop: 3 },
  footer: { flexShrink: 0, paddingHorizontal: 24, paddingTop: 10, paddingBottom: 18, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line }, action: { minHeight: 48, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 16 }, primaryAction: { backgroundColor: C.ink }, quietAction: { backgroundColor: 'transparent' }, actionText: { fontSize: 13, lineHeight: 20, fontWeight: '700', textAlign: 'center' }, primaryActionText: { color: C.white }, quietActionText: { color: C.ink }, pressed: { opacity: .65 }, disabled: { opacity: .5 }, error: { fontSize: 12, lineHeight: 18, color: C.warning, marginBottom: 8 },
  mapLabel: { minHeight: 44, minWidth: 44, justifyContent: 'center', paddingHorizontal: 9, paddingVertical: 6, borderRadius: 12, backgroundColor: '#F8F6EFDB', borderWidth: 1, borderColor: '#FFFFFFE8' }, selectedMapLabel: { backgroundColor: C.ink, borderColor: C.ink }, mapLabelText: { color: C.ink, fontSize: 11, fontWeight: '700', textAlign: 'center' }, selectedMapLabelText: { color: C.white },
  bankLabel: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 9, backgroundColor: '#F8F6EFC7' }, bankLabelText: { color: C.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, textAlign: 'center' }, riverMapLabel: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 9, backgroundColor: '#EDFCFFD9' }, riverMapLabelText: { color: C.waterDark, fontSize: 11, fontStyle: 'italic', fontFamily: Platform.OS === 'android' ? 'serif' : 'Georgia' },
});

export default CityIntro;
