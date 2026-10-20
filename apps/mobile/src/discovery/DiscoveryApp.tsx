import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, BackHandler, Linking, Platform, StatusBar, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { CityGuide } from '../city/model';
import { CityOpening } from '../features/city/CityOpening';
import DiscoveryHome from './DiscoveryHome';
import PlaceDetail from './PlaceDetail';
import DiscoveryMap from './DiscoveryMap';
import { discoveryPlaces } from './catalog';
import { useDiscoveryContext } from './useDiscoveryContext';
import type { DiscoveryLocale } from './types';

/** A stable map under the welcome curtain; photo detail never destroys its surface. */
export default function DiscoveryApp({ locale, guide, playOpening, onLocaleChange, onAboutCity, onGuidedWalk, busy = false, error }: {
  locale: DiscoveryLocale; guide: CityGuide; playOpening: boolean; onLocaleChange: (locale: DiscoveryLocale) => void;
  onAboutCity: () => void; onGuidedWalk: () => void;
  busy?: boolean; error?: string | null;
}) {
  const { height, width } = useWindowDimensions();
  const [selectedId, setSelectedId] = useState<string>();
  const [detailId, setDetailId] = useState<string>();
  const [welcoming, setWelcoming] = useState(playOpening);
  const [mapReady, setMapReady] = useState(false);
  const [motionKnown, setMotionKnown] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(true);
  const [screenReader, setScreenReader] = useState(false);
  const reveal = useRef<(() => void) | undefined>(undefined);
  const top = Platform.OS === 'android' ? StatusBar.currentHeight ?? 28 : 44;
  const bottom = Platform.OS === 'android' ? 48 : 28;
  const { context, reasonByPlace, rankedPlaceIds } = useDiscoveryContext(locale, discoveryPlaces);
  const places = useMemo(() => rankedPlaceIds.map(id => discoveryPlaces.find(p => p.id === id)!).filter(Boolean), [rankedPlaceIds]);
  const detail = discoveryPlaces.find(p => p.id === detailId);
  useEffect(() => {
    let active = true;
    void Promise.all([AccessibilityInfo.isReduceMotionEnabled().catch(() => true), AccessibilityInfo.isScreenReaderEnabled().catch(() => true)])
      .then(([reduced, reader]) => { if (active) { setReduceMotion(reduced); setScreenReader(reader); setMotionKnown(true); } });
    const reduced = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    const reader = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReader);
    return () => { active = false; reduced.remove(); reader.remove(); };
  }, []);
  useEffect(() => {
    if (!detailId) return;
    const listener = BackHandler.addEventListener('hardwareBackPress', () => { setDetailId(undefined); return true; });
    return () => listener.remove();
  }, [detailId]);
  const select = (id: string) => setSelectedId(id);
  const action = (id: string) => {
    const place = discoveryPlaces.find(p => p.id === id);
    if (!place) return;
    if (place.walkAvailable) { onGuidedWalk(); return; }
    const [lon, lat] = place.coordinate;
    void Linking.openURL(`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`).catch(() => Alert.alert(
      ({ ru: 'Не удалось открыть карты', kk: 'Карта ашылмады', en: 'Could not open maps' })[locale],
      ({ ru: 'Место остаётся доступным на карте приложения.', kk: 'Орын қолданба картасында қолжетімді.', en: 'The place remains available on the app map.' })[locale]));
  };
  return <View style={s.root}>
    <View style={s.root} pointerEvents={welcoming || detail ? 'none' : 'auto'} accessibilityElementsHidden={welcoming || !!detail} importantForAccessibility={welcoming || detail ? 'no-hide-descendants' : 'auto'}>
      <DiscoveryHome locale={locale} places={places} selectedPlaceId={selectedId} context={context} reasonByPlace={reasonByPlace} busy={busy}
        insets={{ top, bottom }} onSelectPlace={select} onOpenPlace={id => { select(id); setDetailId(id); }}
        onBuildWalk={action} onAboutCity={onAboutCity} onLocaleChange={onLocaleChange}
        renderMap={props => <DiscoveryMap {...props} places={discoveryPlaces} guide={guide} locale={locale} reduceMotion={reduceMotion}
          topInset={top} onReady={() => setMapReady(true)} onReveal={reveal} />} />
    </View>
    {detail && !welcoming && <View style={s.overlay} accessibilityViewIsModal>
      <PlaceDetail locale={locale} place={detail} insets={{ top, bottom }} reason={reasonByPlace[detail.id]} busy={busy} onBack={() => setDetailId(undefined)}
        onShowOnMap={id => { select(id); setDetailId(undefined); }} onBuildWalk={action} />
    </View>}
    {error && !welcoming && <View style={[s.error, { top: top + 232 }]}><Text accessibilityRole="alert" style={s.errorText}>{error}</Text></View>}
    {welcoming && <CityOpening locale={locale} topInset={top} bottomInset={bottom} compact={height < 690 || width < 350}
      reduceMotion={reduceMotion} screenReader={screenReader} accessibilityReady={motionKnown} mapReady={mapReady}
      onMapReveal={() => reveal.current?.()} onUiReveal={() => {}} onFinish={() => setWelcoming(false)} onSkip={() => setWelcoming(false)} />}
  </View>;
}
const s = StyleSheet.create({ root: { flex: 1, backgroundColor: '#F8F6EF' }, overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#F8F6EF' },
  error: { position: 'absolute', left: 18, right: 18, padding: 14, backgroundColor: '#FAEAE2', borderRadius: 15 }, errorText: { color: '#8A4B29', fontSize: 13, lineHeight: 20 } });
