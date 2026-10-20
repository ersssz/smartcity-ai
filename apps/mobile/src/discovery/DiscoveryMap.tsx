import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Camera, GeoJSONSource, Layer, Map, ViewAnnotation, type CameraRef, type StyleSpecification } from '@maplibre/maplibre-react-native';
import type { CityGuide } from '../city/model';
import type { DiscoveryLocation } from './catalog';
import type { DiscoveryLocale, DiscoveryMapProps } from './types';

const PAPER: StyleSpecification = { version: 8, sources: {}, layers: [{ id: 'paper', type: 'background', paint: { 'background-color': '#F0F1E7' } }] };
const COPY = {
  ru: { all: 'Все места', scheme: 'Схема', streets: 'Улицы', offline: 'Улицы недоступны · места и река сохранены', select: 'Показать место' },
  kk: { all: 'Барлық орын', scheme: 'Сызба', streets: 'Көшелер', offline: 'Көшелер қолжетімсіз · орындар мен өзен сақталған', select: 'Орынды көрсету' },
  en: { all: 'All places', scheme: 'Diagram', streets: 'Streets', offline: 'Streets unavailable · places and river are saved', select: 'Show place' },
};
export default function DiscoveryMap({ places, guide, locale, selectedPlaceId, onSelectPlace, bottomPadding, reduceMotion,
  onReady, onReveal, topInset }: DiscoveryMapProps & {
  places: readonly DiscoveryLocation[]; guide: CityGuide; locale: DiscoveryLocale; reduceMotion: boolean;
  onReady?: () => void; onReveal?: { current: (() => void) | undefined }; topInset: number;
}) {
  const [streets, setStreets] = useState(true), [failed, setFailed] = useState(false), [ready, setReady] = useState(false);
  const [revision, setRevision] = useState(0);
  const camera = useRef<CameraRef>(null);
  const loaded = useRef(false);
  const selected = places.find(p => p.id === selectedPlaceId);
  const bounds = useMemo<[number, number, number, number]>(() => [Math.min(...places.map(p => p.coordinate[0])) - .004,
    Math.min(...places.map(p => p.coordinate[1])) - .004, Math.max(...places.map(p => p.coordinate[0])) + .004,
    Math.max(...places.map(p => p.coordinate[1])) + .004], [places]);
  const padding = useMemo(() => ({ top: topInset + 205, bottom: bottomPadding + 76, left: 36, right: 36 }), [bottomPadding, topInset]);
  const fitAll = () => camera.current?.fitBounds(bounds, { padding, duration: reduceMotion ? 0 : 850 });
  useEffect(() => {
    if (!streets) return;
    loaded.current = false;
    const timer = setTimeout(() => { if (!loaded.current) { setFailed(true); setStreets(false); } }, 7000);
    return () => clearTimeout(timer);
  }, [streets]);
  useEffect(() => {
    if (!ready) return;
    if (selected) camera.current?.fitBounds([selected.coordinate[0] - .0025, selected.coordinate[1] - .0017,
      selected.coordinate[0] + .0025, selected.coordinate[1] + .0017], { padding, duration: reduceMotion ? 0 : 750 });
    else fitAll();
  }, [ready, selectedPlaceId, revision, padding, reduceMotion]);
  useEffect(() => {
    if (!onReveal) return;
    onReveal.current = fitAll;
    return () => { onReveal.current = undefined; };
  });
  const t = COPY[locale];
  return <View style={s.root}>
    <Map style={StyleSheet.absoluteFill} mapStyle={streets ? 'https://tiles.openfreemap.org/styles/liberty' : PAPER}
      logo={false} attribution={streets} attributionPosition={{ bottom: bottomPadding + 58, left: 12 }} compass={false} touchPitch={false}
      onDidFinishLoadingStyle={() => setRevision(v => v + 1)} onDidFinishLoadingMap={() => { loaded.current = true; }}
      onDidFailLoadingMap={() => { setFailed(true); setStreets(false); }}
      onDidFinishRenderingMapFully={() => { setReady(true); onReady?.(); }}>
      <Camera ref={camera} initialViewState={{ bounds, padding }} />
      {!streets && <GeoJSONSource id="discovery-districts" data={guide.boundaries}>
        <Layer id="discovery-district-fill" type="fill" paint={{ 'fill-color': '#E0E9D3', 'fill-opacity': .65 }} />
        <Layer id="discovery-district-line" type="line" paint={{ 'line-color': '#FFFFFF', 'line-width': 1.5 }} />
      </GeoJSONSource>}
      {!streets && <GeoJSONSource id="discovery-river" data={guide.river}>
        <Layer id="discovery-river-line" type="line" paint={{ 'line-color': '#6CBAD2', 'line-width': 13 }} layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
      </GeoJSONSource>}
      {places.map(place => <ViewAnnotation key={`${place.id}-${locale}-${place.id === selectedPlaceId}`} id={`discovery-${place.id}-${locale}-${place.id === selectedPlaceId}`}
        lngLat={place.coordinate} onPress={() => onSelectPlace(place.id)}>
        <View collapsable={false} accessibilityLabel={`${t.select}: ${place.title[locale]}`} style={[s.marker, place.id === selectedPlaceId && s.selected]}>
          <Text style={[s.symbol, place.id === selectedPlaceId && s.light]}>{place.category === 'history' ? '◇' : place.category === 'river' ? '≈' : '✦'}</Text>
          <Text style={[s.label, place.id === selectedPlaceId && s.light]}>{place.title[locale]}</Text>
        </View>
      </ViewAnnotation>)}
    </Map>
    <View style={[s.tools, { top: topInset + 188 }]}>
      <Pressable accessibilityRole="button" onPress={fitAll} style={s.tool}><Text style={s.toolText}>⌖ {t.all}</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={() => { setFailed(false); setStreets(v => !v); }} style={s.tool}><Text style={s.toolText}>{streets ? t.scheme : t.streets}</Text></Pressable>
    </View>
    {!streets && <View style={[s.credit, { bottom: bottomPadding + 58 }]}>
      {failed && <Text style={s.small}>{t.offline}</Text>}
      <Pressable accessibilityRole="link" onPress={() => void Linking.openURL('https://www.openstreetmap.org/copyright').catch(() => {})}><Text style={s.small}>© OpenStreetMap</Text></Pressable>
    </View>}
  </View>;
}
const s = StyleSheet.create({ root: { flex: 1, backgroundColor: '#F0F1E7' }, tools: { position: 'absolute', left: 14, right: 14, flexDirection: 'row', justifyContent: 'space-between' },
  tool: { backgroundColor: '#F8F6EF', minHeight: 44, justifyContent: 'center', paddingHorizontal: 13, borderRadius: 15, borderWidth: 1, borderColor: '#DFE7D9' }, toolText: { fontSize: 12, fontWeight: '700', color: '#173F3B' },
  marker: { maxWidth: 158, minHeight: 38, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 15, backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#DFE7D9', flexDirection: 'row', alignItems: 'center', gap: 5 },
  selected: { backgroundColor: '#173F3B', borderColor: '#FFFFFF' }, symbol: { fontSize: 18, color: '#4B806E' }, label: { flexShrink: 1, fontSize: 11, fontWeight: '700', color: '#173F3B' }, light: { color: '#FFFFFF' },
  credit: { position: 'absolute', left: 14, backgroundColor: '#F8F6EF', padding: 6, borderRadius: 8, gap: 3 }, small: { fontSize: 9, color: '#5A6F66' } });
