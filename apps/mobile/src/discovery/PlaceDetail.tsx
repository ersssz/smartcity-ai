import { useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, Image, Linking, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, View, useWindowDimensions, type ImageStyle, type StyleProp } from 'react-native';
import { DISCOVERY_COLORS as C, DISCOVERY_COPY } from './copy';
import type { DiscoveryLocale, DiscoveryPlace, PlaceDetailProps } from './types';

/** Receives a real licensed asset; a missing/failed image remains an honest empty state. */
export function DiscoveryPlacePhoto({ place, locale, style }: { place: DiscoveryPlace; locale: DiscoveryLocale; style?: StyleProp<ImageStyle> }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [place.id, place.photo?.source]);
  if (!place.photo || failed) return <View style={[s.photoFallback, style]} accessibilityLabel={DISCOVERY_COPY[locale].photoMissing}>
    <View style={s.photoFallbackRing}><Text style={s.photoFallbackIcon}>◇</Text></View>
    <Text style={s.photoFallbackText}>{failed ? DISCOVERY_COPY[locale].photoError : DISCOVERY_COPY[locale].photoMissing}</Text>
  </View>;
  return <Image source={place.photo.source} resizeMode="cover" accessibilityLabel={place.photo.alt[locale]} style={style} onError={() => setFailed(true)} />;
}

export default function PlaceDetail({ locale, place, busy = false, onBack, onShowOnMap, onBuildWalk, onOpenSource, insets, reason }: PlaceDetailProps) {
  const t = DISCOVERY_COPY[locale], { height, width } = useWindowDimensions();
  const [sourceError, setSourceError] = useState(false);
  const top = insets?.top ?? StatusBar.currentHeight ?? 28;
  const bottom = insets?.bottom ?? (Platform.OS === 'android' ? 36 : 28);
  const photoHeight = Math.min(360, Math.max(220, height * .39));
  const compact = width < 350;
  const actionLabel = place.walkActionLabel?.[locale] ?? (place.walkAvailable === true ? t.guided : t.externalMaps);
  useEffect(() => { setSourceError(false); }, [place.id]);
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => { if (!busy) onBack(); return true; });
    return () => listener.remove();
  }, [busy, onBack]);
  const openSource = (url: string) => {
    if (!/^https:\/\//i.test(url)) { setSourceError(true); return; }
    setSourceError(false);
    if (onOpenSource) { onOpenSource(url); return; }
    void Linking.openURL(url).catch(() => setSourceError(true));
  };
  return <View style={s.screen}>
    <StatusBar barStyle="light-content" />
    <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
      <View style={{ height: photoHeight }}>
        <DiscoveryPlacePhoto place={place} locale={locale} style={s.heroPhoto} />
        <View pointerEvents="none" style={s.heroShade} />
        <View style={[s.heroTop, { top: top + 10 }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={t.back} disabled={busy} onPress={onBack} style={({ pressed }) => [s.back, pressed && s.pressed]}><Text style={s.backText}>←</Text></Pressable>
          <View style={s.category}><Text style={s.categoryText}>{t[place.category]}</Text></View>
        </View>
      </View>
      <View style={s.story}>
        <View style={s.handle} />
        <Text accessibilityRole="header" style={s.title}>{place.title[locale]}</Text>
        <Text style={s.summary}>{place.summary[locale]}</Text>
        {reason ? <View style={s.reason}><View style={s.reasonDot} /><View style={s.flex}><Text style={s.reasonKicker}>{t.now}</Text><Text style={s.reasonText}>{reason}</Text></View></View> : null}
        <Text accessibilityRole="header" style={s.sectionTitle}>{t.why}</Text>
        <Text style={s.body}>{place.why[locale]}</Text>
        {place.photo && <View style={s.photoCredit}>
          <Text style={s.credit}>{place.photo.attribution}</Text>
          <View style={s.creditLinks}>
            <Pressable accessibilityRole="link" onPress={() => openSource(place.photo!.sourceUrl)} hitSlop={8}><Text style={s.creditLink}>{t.photoSource} ↗</Text></Pressable>
            {place.photo.licenseUrl && <Pressable accessibilityRole="link" onPress={() => openSource(place.photo!.licenseUrl!)} hitSlop={8}><Text style={s.creditLink}>{place.photo.licenseLabel ?? t.license} ↗</Text></Pressable>}
          </View>
        </View>}
        {!!place.factsSources?.length && <View style={s.sources}>
          <Text accessibilityRole="header" style={s.sourcesTitle}>{t.sources}</Text>
          {place.factsSources.map((source, index) => <Pressable accessibilityRole="link" key={`${source.url}:${index}`} onPress={() => openSource(source.url)} style={({ pressed }) => [s.source, pressed && s.pressed]}>
            <Text style={s.sourceText}>{source.label}</Text><Text style={s.sourceArrow}>↗</Text>
          </Pressable>)}
        </View>}
        {sourceError && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={s.sourceError}>{t.sourceError}</Text>}
      </View>
    </ScrollView>
    <View style={[s.footer, { paddingBottom: Math.max(14, bottom) }]}>
      {place.walkNote && <Text style={s.walkNote}>{place.walkNote[locale]}</Text>}
      <Pressable accessibilityRole="button" disabled={busy} accessibilityState={{ disabled: busy }} onPress={() => onShowOnMap(place.id)} style={({ pressed }) => [s.mapButton, pressed && s.pressed]}><Text style={s.mapButtonText}>⌖  {t.map}</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityHint={place.walkAvailable === true ? undefined : t.externalHint} disabled={busy} accessibilityState={{ disabled: busy, busy }} onPress={() => onBuildWalk(place.id)} style={({ pressed }) => [s.build, compact && s.buildCompact, busy && s.disabled, pressed && s.pressed]}>
        {busy && <ActivityIndicator color={C.paper} size="small" />}<Text style={s.buildText}>{busy ? t.building : actionLabel}  {place.walkAvailable === true ? '→' : '↗'}</Text>
      </Pressable>
    </View>
  </View>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.paper }, scroll: { flex: 1 }, flex: { flex: 1 },
  heroPhoto: { width: '100%', height: '100%' }, heroShade: { ...StyleSheet.absoluteFill, backgroundColor: '#102B2810' },
  heroTop: { position: 'absolute', left: 18, right: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  back: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#F8F6EFF2', alignItems: 'center', justifyContent: 'center', elevation: 3 }, backText: { color: C.ink, fontSize: 25 },
  category: { borderRadius: 20, backgroundColor: '#F8F6EFF2', paddingHorizontal: 15, paddingVertical: 9 }, categoryText: { color: C.ink, fontSize: 11, fontWeight: '700' },
  story: { marginTop: -24, borderTopLeftRadius: 30, borderTopRightRadius: 30, backgroundColor: C.paper, paddingTop: 13, paddingHorizontal: 25, paddingBottom: 22 },
  handle: { width: 34, height: 4, borderRadius: 2, backgroundColor: '#D4DCCF', alignSelf: 'center', marginBottom: 23 },
  title: { color: C.ink, fontFamily: 'serif', fontSize: 34, lineHeight: 40 }, summary: { color: C.muted, fontSize: 16, lineHeight: 25, marginTop: 12 },
  sectionTitle: { color: C.ink, fontFamily: 'serif', fontSize: 23, lineHeight: 30, marginTop: 28, marginBottom: 11 }, body: { color: C.ink, fontSize: 15, lineHeight: 26 },
  reason: { marginTop: 23, borderRadius: 18, backgroundColor: '#E8EFDF', padding: 15, flexDirection: 'row', gap: 11 }, reasonDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#6F9275', marginTop: 6 }, reasonKicker: { color: C.muted, fontSize: 10, fontWeight: '700', letterSpacing: .5, marginBottom: 4 }, reasonText: { color: C.ink, fontSize: 13, lineHeight: 21 },
  photoCredit: { marginTop: 25, paddingTop: 15, borderTopWidth: 1, borderTopColor: C.line, gap: 8 }, credit: { color: C.muted, fontSize: 10, lineHeight: 16 }, creditLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 }, creditLink: { color: C.ink, fontSize: 11, lineHeight: 18, textDecorationLine: 'underline' },
  sources: { marginTop: 25, gap: 9 }, sourcesTitle: { color: C.muted, fontSize: 10, fontWeight: '700', letterSpacing: .8, marginBottom: 3 }, source: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line }, sourceText: { flex: 1, color: C.ink, fontSize: 12, lineHeight: 20 }, sourceArrow: { color: C.muted, fontSize: 17 }, sourceError: { color: C.red, fontSize: 12, lineHeight: 20, marginTop: 13 },
  footer: { backgroundColor: C.paper, paddingTop: 8, paddingHorizontal: 20, gap: 7, borderTopWidth: 1, borderTopColor: C.line }, walkNote: { color: C.muted, fontSize: 10, lineHeight: 16, textAlign: 'center' }, mapButton: { minHeight: 40, justifyContent: 'center', alignItems: 'center', borderRadius: 14 }, mapButtonText: { color: C.ink, fontSize: 12, fontWeight: '600' },
  build: { minHeight: 52, borderRadius: 18, backgroundColor: C.ink, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 10, paddingVertical: 13, paddingHorizontal: 12 }, buildCompact: { paddingHorizontal: 8 }, buildText: { color: C.paper, fontSize: 14, lineHeight: 22, fontWeight: '700', textAlign: 'center' },
  photoFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#E4EBDD', padding: 16 }, photoFallbackRing: { borderWidth: 1, borderColor: '#A5BCA2', width: 47, height: 47, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 10 }, photoFallbackIcon: { color: '#6F8A6C', fontSize: 25 }, photoFallbackText: { color: C.muted, fontSize: 11, lineHeight: 18, textAlign: 'center' },
  pressed: { opacity: .72 }, disabled: { opacity: .6 },
});
