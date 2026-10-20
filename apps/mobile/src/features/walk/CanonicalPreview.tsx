import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, BackHandler, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Camera, GeoJSONSource, Layer, Map, ViewAnnotation } from '@maplibre/maplibre-react-native';
import type { Locale, PackVerification, WalkBundleV1 } from '@astanaai/contracts';
import { canonicalMaterials, toCanonicalUiWalk } from '../../canonical/presentation';

export type CanonicalPreviewProps = {
  bundle: WalkBundleV1; locale: Locale; busy?: boolean; verification?: PackVerification;
  error?: string | null;
  storyOnly?: boolean;
  onChoose: () => void; onCancel: () => void; onLocaleChange: (locale: Locale) => void;
};
const COPY = {
  ru: { back: '← К сохранённой прогулке', choose: 'Выбрать эту прогулку', choosing: 'Сохраняем выбор…', preview: 'НОВАЯ СТОРОНА ГОРОДА', minutes: 'мин', km: 'км', stops: 'остановки', expand: 'Маршрут и материалы', collapse: 'Больше карты', start: 'Старт', end: 'Финиш', walk: 'Переходы', visit: 'Истории', reserve: 'Резерв', chapters: 'Как разворачивается история', materials: 'ЧТО В ПАКЕТЕ', saved: 'Сохранённая прогулка, её прогресс и журнал останутся на этом телефоне. Выбор маршрута не включает GPS.', fallback: 'Сохранённая линия · уличная подложка недоступна', map: 'Карта выбранной прогулки', info: 'Перед прогулкой', sources: 'Основание истории',
  },
  kk: { back: '← Сақталған серуенге', choose: 'Осы серуенді таңдау', choosing: 'Таңдау сақталуда…', preview: 'ҚАЛАНЫҢ ЖАҢА ҚЫРЫ', minutes: 'мин', km: 'км', stops: 'аялдама', expand: 'Маршрут пен материалдар', collapse: 'Картаны үлкейту', start: 'Бастау', end: 'Аяқтау', walk: 'Жол', visit: 'Хикаялар', reserve: 'Қор', chapters: 'Хикая қалай өрбиді', materials: 'ПАКЕТ ҚҰРАМЫ', saved: 'Сақталған серуен, ілгерілеу мен күнделік осы телефонда қалады. Маршрутты таңдау GPS қоспайды.', fallback: 'Сақталған сызық · көше картасы қолжетімсіз', map: 'Таңдалған серуен картасы', info: 'Серуен алдында', sources: 'Хикаяның негізі',
  },
  en: { back: '← Back to the saved walk', choose: 'Choose this walk', choosing: 'Saving your choice…', preview: 'ANOTHER SIDE OF THE CITY', minutes: 'min', km: 'km', stops: 'stops', expand: 'Route and materials', collapse: 'More map', start: 'Start', end: 'Finish', walk: 'Walking', visit: 'Stories', reserve: 'Reserve', chapters: 'How the story unfolds', materials: 'IN THIS PACKAGE', saved: 'Your saved walk, its progress and journal stay on this phone. Choosing a walk does not enable GPS.', fallback: 'Saved route line · street base map unavailable', map: 'Map of the selected walk', info: 'Before you go', sources: 'Story evidence',
  },
} as const;
const STORY = {
  ru: { back: '← К местам', heading: 'Пешая прогулка с историями', expand: 'Маршрут и истории', listen: 'Истории и записанная озвучка на каждой остановке.', read: 'Истории можно читать. Доступность озвучки проверяется отдельно.', map: 'Уличная карта загружается из интернета.', info: 'Что важно знать и источники', hideInfo: 'Скрыть подробности', saved: 'Прогресс чтения сохранится на этом телефоне.' },
  kk: { back: '← Орындарға', heading: 'Хикаялары бар жаяу серуен', expand: 'Маршрут пен хикаялар', listen: 'Әр аялдамада хикая мен дайын дыбыстау бар.', read: 'Хикаяларды оқуға болады. Дыбыстау қолжетімділігі бөлек тексеріледі.', map: 'Көше картасы интернеттен жүктеледі.', info: 'Маңызды ақпарат және дереккөздер', hideInfo: 'Мәліметті жасыру', saved: 'Оқу ілгерілеуі осы телефонда сақталады.' },
  en: { back: '← Back to places', heading: 'A walk with stories', expand: 'Route and stories', listen: 'Stories and prepared narration at every stop.', read: 'The stories are available to read. Narration availability is checked separately.', map: 'The street map loads from the internet.', info: 'What to know and sources', hideInfo: 'Hide details', saved: 'Your reading progress stays on this phone.' },
} as const;
const C = { ink: '#173F3B', paper: '#F8F6EF', mint: '#D8F0D4', muted: '#536861', line: '#DCE3D8', pale: '#ECF0E7', white: '#FFFFFF' };
const SAVED_STYLE = { version: 8 as const, sources: {}, layers: [{ id: 'paper', type: 'background' as const, paint: { 'background-color': C.pale } }] };

/** A view of an already validated bundle. Selection, persistence and acquisition belong to Root. */
export default function CanonicalPreview({ bundle, locale, busy = false, verification, error, storyOnly = false, onChoose, onCancel, onLocaleChange }: CanonicalPreviewProps) {
  const t = COPY[locale];
  const story = STORY[locale];
  const walk = useMemo(() => toCanonicalUiWalk(bundle, locale), [bundle, locale]);
  const materials = useMemo(() => canonicalMaterials(bundle, locale, verification), [bundle, locale, verification]);
  const { height } = useWindowDimensions();
  const [expanded, setExpanded] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mapFailed, setMapFailed] = useState(false);
  const [infoShown, setInfoShown] = useState(false);
  const narrationReady = verification && verification.state !== 'invalid_bundle' && bundle.stops.length > 0 && bundle.stops.every(stop => {
    const audio = bundle.content.chapters.find(chapter => chapter.id === stop.chapterId)?.audio[locale];
    return audio?.state === 'available' && !verification.missing.some(item => item.id === audio.assetId);
  });
  const narrationNote = narrationReady ? story.listen : story.read;
  const bottomInset = Platform.OS === 'android' ? 44 : 28;
  const collapsedHeight = Math.max(218, Math.min(282, height * .35));
  const sheetHeight = expanded ? Math.min(height * .68, 640) : collapsedHeight;
  const topInset = (StatusBar.currentHeight ?? 28) + 14;
  const shape = useMemo<GeoJSON.Feature<GeoJSON.LineString>>(() => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: walk.route } }), [walk.route]);
  const bounds = useMemo<[number, number, number, number]>(() => {
    const points = [...walk.route, walk.startCoordinate, walk.endCoordinate];
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    return [Math.min(...xs) - .0008, Math.min(...ys) - .0008, Math.max(...xs) + .0008, Math.max(...ys) + .0008];
  }, [walk.route, walk.startCoordinate, walk.endCoordinate]);
  useEffect(() => { setExpanded(false); setSelectedIndex(0); setMapFailed(false); setInfoShown(false); }, [bundle.sha256]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (expanded) setExpanded(false); else if (!busy) onCancel();
      return true;
    });
    return () => subscription.remove();
  }, [expanded, busy, onCancel]);
  const stop = walk.stops[selectedIndex];
  return <View style={s.screen}>
    <StatusBar barStyle="dark-content" />
    <Map key={bundle.sha256} style={StyleSheet.absoluteFill} mapStyle={mapFailed ? SAVED_STYLE : 'https://tiles.openfreemap.org/styles/liberty'}
      attribution compass attributionPosition={{ top: topInset + 66, right: 12 }} compassPosition={{ top: topInset + 66, right: 56 }}
      onDidFailLoadingMap={() => setMapFailed(true)} accessibilityLabel={t.map}>
      <Camera initialViewState={{ bounds, padding: { top: topInset + 116, bottom: collapsedHeight + 24, left: 42, right: 42 } }} />
      {walk.route.length >= 2 && <GeoJSONSource id="canonical-preview-route" data={shape}>
        <Layer id="canonical-preview-route-halo" type="line" paint={{ 'line-color': C.white, 'line-width': 10, 'line-opacity': .95 }} layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
        <Layer id="canonical-preview-route-line" type="line" paint={{ 'line-color': C.ink, 'line-width': 5 }} layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
      </GeoJSONSource>}
      {walk.stops.map((item, index) => <ViewAnnotation key={item.id} id={`canonical-preview-${item.id}`} lngLat={item.coordinate} title={item.title}
        onPress={() => { setSelectedIndex(index); setExpanded(true); }}>
        <View collapsable={false} style={[s.pin, selectedIndex === index && s.pinSelected]}><Text style={[s.pinText, selectedIndex === index && s.pinTextSelected]}>{index + 1}</Text></View>
      </ViewAnnotation>)}
      <ViewAnnotation id="canonical-preview-finish" lngLat={walk.endCoordinate} title={`${t.end}: ${walk.endLabel}`}>
        <View collapsable={false} style={s.finish}><Text style={s.finishText}>⚑</Text></View>
      </ViewAnnotation>
    </Map>
    <View pointerEvents="box-none" style={[s.top, { top: topInset }]}>
      <View style={s.topRow}>
        <Pressable accessibilityRole="button" disabled={busy} accessibilityState={{ disabled: busy }} onPress={onCancel} style={({ pressed }) => [s.back, pressed && s.pressed]}><Text style={s.backText}>{storyOnly ? story.back : t.back}</Text></Pressable>
        <View style={s.languages} accessibilityRole="tablist">{(['ru', 'kk', 'en'] as const).map(code => <Pressable key={code} accessibilityRole="tab" accessibilityState={{ selected: locale === code, disabled: busy }} disabled={busy} onPress={() => onLocaleChange(code)} style={[s.language, locale === code && s.languageSelected]}><Text style={[s.languageText, locale === code && s.languageTextSelected]}>{code.toUpperCase()}</Text></Pressable>)}</View>
      </View>
      <View style={s.provenance}><Text style={s.provenanceDot}>●</Text><Text style={s.provenanceText}>{storyOnly ? story.heading : walk.eyebrow}</Text></View>
      {mapFailed && <View style={s.provenance}><Text style={s.provenanceText}>{t.fallback}</Text></View>}
    </View>
    <View style={[s.sheet, { height: sheetHeight }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={expanded ? t.collapse : t.expand} accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)} style={s.handleButton}>
        <View style={s.handle} /><Text style={s.handleText}>{expanded ? '⌄' : '⌃'}  {expanded ? t.collapse : storyOnly ? story.expand : t.expand}</Text>
      </Pressable>
      <ScrollView style={s.scroll} contentContainerStyle={s.content} nestedScrollEnabled showsVerticalScrollIndicator={expanded}>
        <Text style={s.eyebrow}>{t.preview}</Text>
        <Text accessibilityRole="header" numberOfLines={expanded ? undefined : 1} style={s.title}>{walk.title}</Text>
        <View style={s.metrics}><Text style={s.metricStrong}>≈ {walk.minutes} {t.minutes}</Text><Text style={s.metric}>·</Text><Text style={s.metric}>{(walk.distanceMeters / 1000).toLocaleString(locale, { maximumFractionDigits: 1 })} {t.km}</Text><Text style={s.metric}>·</Text><Text style={s.metric}>{walk.stops.length} {t.stops}</Text></View>
        <Text style={s.ending}>{walk.ending.label}</Text>
        {expanded && <>
          <Text style={s.description}>{walk.description}</Text>
          <View style={s.endpoints}><Text style={s.endpoint}><Text style={s.endpointKicker}>{t.start}  </Text>{walk.startLabel}</Text><Text style={s.endpoint}><Text style={s.endpointKicker}>{t.end}  </Text>{walk.endLabel}</Text></View>
          <Text style={s.small}>{t.walk} {walk.walkMinutes} {t.minutes}  ·  {t.visit} {walk.visitMinutes} {t.minutes}  ·  {t.reserve} {walk.reserveMinutes} {t.minutes}</Text>
          <Text accessibilityRole="header" style={s.sectionTitle}>{t.chapters}</Text>
          {walk.stops.map((item, index) => <Pressable accessibilityRole="button" accessibilityState={{ selected: selectedIndex === index }} key={item.id} onPress={() => setSelectedIndex(index)} style={[s.stop, selectedIndex === index && s.stopSelected]}>
            <View style={s.stopNumber}><Text style={s.stopNumberText}>{index + 1}</Text></View><View style={s.flex}><Text style={s.stopTitle}>{item.title}</Text><Text style={s.small}>{item.storyTitle} · {item.minutes} {t.minutes}</Text></View>
          </Pressable>)}
          {stop && <Text style={s.small}>{stop.kicker}</Text>}
          {storyOnly && <><Text style={s.description}>{narrationNote}</Text><Text style={s.small}>{story.map}</Text>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: infoShown }} onPress={() => setInfoShown(value => !value)} style={s.infoButton}><Text style={s.infoButtonText}>{infoShown ? story.hideInfo : story.info} {infoShown ? '⌃' : '⌄'}</Text></Pressable></>}
          {(!storyOnly || infoShown) && <>
            <View style={s.materials}><Text style={s.eyebrow}>{t.materials}</Text><Text style={s.materialTitle}>{materials.title}</Text><Text style={s.small}>{materials.label}</Text><Text style={s.small}>{materials.detail}</Text></View>
            <Text accessibilityRole="header" style={s.sectionTitle}>{t.info}</Text><Text style={s.small}>{walk.originNote}</Text><Text style={s.small}>{walk.fieldNote}</Text>
            {storyOnly && <Text style={s.small}>{walk.eyebrow}</Text>}
            <Text style={s.eyebrow}>{t.sources}</Text><Text style={s.small}>{bundle.sources.map(source => source.title).join(' · ')}</Text>
            <Text style={s.attribution}>{walk.attribution}</Text>
          </>}
          <Text style={s.retention}>{storyOnly ? story.saved : t.saved}</Text>
        </>}
      </ScrollView>
      <View style={[s.footer, { paddingBottom: bottomInset }]}>
        {!expanded && <Text numberOfLines={2} style={s.materialSummary}>{storyOnly ? narrationNote : materials.label}</Text>}
        {error && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" numberOfLines={expanded ? undefined : 2} style={s.errorText}>{error}</Text>}
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy || !materials.canChoose, busy }} disabled={busy || !materials.canChoose} onPress={onChoose} style={({ pressed }) => [s.choose, (busy || !materials.canChoose) && s.disabled, pressed && s.pressed]}>
          {busy ? <ActivityIndicator size="small" color={C.paper} /> : null}<Text style={s.chooseText}>{busy ? t.choosing : t.choose}  →</Text>
        </Pressable>
      </View>
    </View>
  </View>;
}
const s = StyleSheet.create({
  infoButton: { minHeight: 44, paddingVertical: 11, paddingHorizontal: 12, borderWidth: 1, borderColor: C.line, borderRadius: 14, marginTop: 5 }, infoButtonText: { color: C.ink, fontSize: 12, lineHeight: 20, fontWeight: '600' },
  screen: { flex: 1, backgroundColor: C.pale }, top: { position: 'absolute', left: 14, right: 14, gap: 10 }, topRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  back: { flexShrink: 1, minHeight: 46, justifyContent: 'center', backgroundColor: C.paper, borderRadius: 17, paddingHorizontal: 13, borderWidth: 1, borderColor: C.line }, backText: { color: C.ink, fontSize: 12, fontWeight: '600' },
  languages: { flexDirection: 'row', padding: 4, borderRadius: 16, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line }, language: { minWidth: 36, minHeight: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center' }, languageSelected: { backgroundColor: C.ink }, languageText: { color: C.muted, fontSize: 11, fontWeight: '700' }, languageTextSelected: { color: C.paper },
  provenance: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F8F6EFF2', paddingVertical: 7, paddingHorizontal: 11, borderRadius: 11, maxWidth: '95%' }, provenanceDot: { color: '#719475', fontSize: 8 }, provenanceText: { color: C.muted, fontSize: 10, lineHeight: 15, flexShrink: 1 },
  pin: { width: 34, height: 34, borderRadius: 17, borderWidth: 3, borderColor: C.white, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' }, pinSelected: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.mint, borderColor: C.ink }, pinText: { color: C.paper, fontSize: 12, fontWeight: '700' }, pinTextSelected: { color: C.ink }, finish: { marginLeft: 31, marginTop: -24, paddingHorizontal: 6, borderRadius: 8, backgroundColor: C.paper }, finishText: { fontSize: 21, color: C.ink },
  sheet: { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 30, borderTopRightRadius: 30, backgroundColor: C.paper, borderWidth: 1, borderColor: '#E5E8DE', shadowColor: C.ink, shadowOpacity: .12, shadowRadius: 16, elevation: 8, overflow: 'hidden' },
  handleButton: { minHeight: 37, alignItems: 'center', paddingTop: 9, paddingBottom: 5, gap: 4 }, handle: { width: 34, height: 4, borderRadius: 2, backgroundColor: '#CBD4C9' }, handleText: { color: C.muted, fontSize: 9, letterSpacing: .3 }, scroll: { flex: 1 }, content: { paddingHorizontal: 23, paddingTop: 3, paddingBottom: 12, gap: 10 }, eyebrow: { color: C.muted, fontSize: 9, letterSpacing: 1.2, fontWeight: '700' }, title: { color: C.ink, fontFamily: 'serif', fontSize: 28, lineHeight: 34 }, metrics: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }, metricStrong: { color: C.ink, fontSize: 13, fontWeight: '700' }, metric: { color: C.muted, fontSize: 12 }, ending: { color: '#496C50', fontSize: 12, lineHeight: 18, fontWeight: '600' },
  description: { color: C.ink, fontSize: 15, lineHeight: 24, marginTop: 7 }, endpoints: { gap: 7, paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.line }, endpoint: { color: C.ink, fontSize: 13, lineHeight: 20 }, endpointKicker: { color: C.muted, fontSize: 11 }, small: { color: C.muted, fontSize: 12, lineHeight: 20 }, sectionTitle: { fontFamily: 'serif', color: C.ink, fontSize: 22, marginTop: 14, marginBottom: 3 }, stop: { minHeight: 66, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderColor: C.line, borderRadius: 17 }, stopSelected: { backgroundColor: '#EAF1E4', borderColor: '#A5BCA0' }, stopNumber: { height: 29, width: 29, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: C.ink }, stopNumberText: { color: C.paper, fontSize: 11, fontWeight: '700' }, stopTitle: { color: C.ink, fontSize: 14, lineHeight: 21, fontWeight: '600' }, flex: { flex: 1 }, materials: { marginTop: 8, padding: 16, borderRadius: 17, backgroundColor: '#EAF0E3', gap: 8 }, materialTitle: { color: C.ink, fontSize: 14, lineHeight: 21, fontWeight: '600' }, retention: { color: C.muted, fontSize: 11, lineHeight: 18, marginTop: 12 }, attribution: { color: C.muted, fontSize: 9, lineHeight: 14 },
  footer: { paddingTop: 8, paddingHorizontal: 23, borderTopWidth: 1, borderTopColor: C.line, gap: 7 }, materialSummary: { color: C.muted, fontSize: 10, lineHeight: 14 }, errorText: { color: '#8A3228', fontSize: 12, lineHeight: 17 }, choose: { minHeight: 48, flexDirection: 'row', gap: 10, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 13, paddingVertical: 12, borderRadius: 17, backgroundColor: C.ink }, chooseText: { color: C.paper, fontSize: 13, lineHeight: 20, fontWeight: '700', textAlign: 'center' }, disabled: { opacity: .55 }, pressed: { opacity: .7 },
});
