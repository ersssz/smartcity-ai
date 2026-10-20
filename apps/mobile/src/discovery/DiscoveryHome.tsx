import { useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { DISCOVERY_COLORS as C, DISCOVERY_COPY } from './copy';
import { DiscoveryPlacePhoto } from './PlaceDetail';
import type { DiscoveryFilter, DiscoveryHomeProps } from './types';
export type { DiscoveryHomeProps, DiscoveryPlace, DiscoveryPhoto, DiscoveryContext, DiscoveryMapProps } from './types';

const FILTERS: readonly DiscoveryFilter[] = ['all', 'history', 'architecture', 'river'];

/** The map belongs to the application; discovery owns only lightweight overlays and intent. */
export default function DiscoveryHome({ locale, places, selectedPlaceId, busy = false, renderMap, onSelectPlace, onOpenPlace, onBuildWalk, onAboutCity, onLocaleChange, insets, context, reasonByPlace }: DiscoveryHomeProps) {
  const t = DISCOVERY_COPY[locale], { width, height } = useWindowDimensions();
  const [filter, setFilter] = useState<DiscoveryFilter>('all');
  const [contextExpanded, setContextExpanded] = useState(false);
  const [contextSourceError, setContextSourceError] = useState(false);
  const top = insets?.top ?? StatusBar.currentHeight ?? 28;
  const bottom = insets?.bottom ?? (Platform.OS === 'android' ? 36 : 28);
  const visible = filter === 'all' ? places : places.filter(place => place.category === filter);
  const cardWidth = Math.min(260, Math.max(214, width * .62));
  const bottomPadding = 214 + Math.max(14, bottom);
  const selected = places.find(place => place.id === selectedPlaceId);
  const openPlace = (id: string) => { onSelectPlace(id); onOpenPlace?.(id); };
  const openContextSource = () => {
    const url = context?.attribution?.url;
    if (!url || !/^https:\/\//i.test(url)) { setContextSourceError(true); return; }
    setContextSourceError(false);
    void Linking.openURL(url).catch(() => setContextSourceError(true));
  };
  return <View style={s.screen}>
    <StatusBar barStyle="dark-content" />
    <View style={StyleSheet.absoluteFill} accessibilityLabel={t.mapLabel}>
      {renderMap({ selectedPlaceId, onSelectPlace, bottomPadding })}
    </View>
    <View pointerEvents="box-none" style={[s.top, { top: top + 10 }]}>
      <View style={s.header}>
        <View style={s.heading}><Text accessibilityRole="header" style={s.title}>{t.title}</Text><Text style={s.subtitle}>{t.subtitle}</Text></View>
        {onAboutCity && <Pressable accessibilityRole="button" disabled={busy} onPress={onAboutCity} style={({ pressed }) => [s.about, pressed && s.pressed]}><Text style={s.aboutText}>{t.about} ↗</Text></Pressable>}
      </View>
      <View style={s.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filters} accessibilityRole="tablist">
          {FILTERS.map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: filter === value }} onPress={() => setFilter(value)} style={({ pressed }) => [s.filter, filter === value && s.filterSelected, pressed && s.pressed]}><Text style={[s.filterText, filter === value && s.filterTextSelected]}>{t[value]}</Text></Pressable>)}
        </ScrollView>
      </View>
      {context && <View style={s.contextContainer}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${t.contextOpen}: ${context.summary}`} accessibilityState={{ expanded: contextExpanded }} onPress={() => setContextExpanded(value => !value)} style={({ pressed }) => [s.contextBadge, pressed && s.pressed]}>
          {context.busy ? <ActivityIndicator size="small" color={C.muted} /> : <View style={s.contextDot} />}
          <Text numberOfLines={1} style={s.contextSummary}>{context.summary}</Text><Text style={s.contextArrow}>{contextExpanded ? '⌃' : '⌄'}</Text>
        </Pressable>
        {context.attribution && <Pressable accessibilityRole="link" onPress={openContextSource} hitSlop={4} style={s.contextAttribution}><Text style={s.contextAttributionText}>{context.attribution.label} ↗</Text></Pressable>}
        {contextSourceError && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={s.contextSourceError}>{t.sourceError}</Text>}
        {contextExpanded && <View style={[s.contextPanel, { maxHeight: Math.min(240, height * .3) }]}>
          <ScrollView showsVerticalScrollIndicator nestedScrollEnabled contentContainerStyle={s.contextContent}>
            {context.detail ? <Text style={s.contextDetail}>{context.detail}</Text> : null}
            {!!context.choices?.length && <View style={s.contextChoices}>{context.choices.map(choice => <Pressable key={choice.id} accessibilityRole="button" accessibilityState={{ selected: choice.selected }} onPress={choice.onPress} style={({ pressed }) => [s.contextChoice, choice.selected && s.contextChoiceSelected, pressed && s.pressed]}><Text style={[s.choiceText, choice.selected && s.choiceTextSelected]}>{choice.label}</Text></Pressable>)}</View>}
            <View style={s.contextActions}>
              {context.onRefresh && <Pressable accessibilityRole="button" accessibilityState={{ disabled: context.busy }} disabled={context.busy} onPress={context.onRefresh} style={s.contextAction}><Text style={s.contextActionText}>↻  {t.refresh}</Text></Pressable>}
              <Pressable accessibilityRole="button" onPress={() => setContextExpanded(false)} style={s.contextAction}><Text style={s.contextActionText}>{t.contextClose} ↑</Text></Pressable>
            </View>
          </ScrollView>
        </View>}
      </View>}
    </View>
    {onLocaleChange && <View style={[s.languages, { bottom: bottomPadding + 12 }]} accessibilityRole="tablist">{(['ru', 'kk', 'en'] as const).map(code => <Pressable key={code} accessibilityRole="tab" accessibilityState={{ selected: locale === code, disabled: busy }} disabled={busy} onPress={() => onLocaleChange(code)} style={[s.language, locale === code && s.languageSelected]}><Text style={[s.languageText, locale === code && s.languageTextSelected]}>{code.toUpperCase()}</Text></Pressable>)}</View>}
    {selected && <View pointerEvents="box-none" style={[s.mapSelection, { bottom: bottomPadding + 13 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={selected.walkAvailable === true ? (selected.walkActionLabel?.[locale] ?? t.guided) : `${t.open}: ${selected.title[locale]}`} disabled={busy} onPress={() => selected.walkAvailable === true ? onBuildWalk(selected.id) : openPlace(selected.id)} style={({ pressed }) => [s.selectionButton, pressed && s.pressed]}><View style={s.selectionDot} /><Text numberOfLines={1} style={s.selectionText}>{selected.walkAvailable === true ? (selected.walkActionLabel?.[locale] ?? t.guided) : selected.title[locale]}</Text><Text style={s.selectionArrow}>{selected.walkAvailable === true ? '→' : '↗'}</Text></Pressable>
    </View>}
    <View style={[s.bottom, { paddingBottom: Math.max(14, bottom) }]}>
      <View style={s.sectionHeading}><Text style={s.sectionTitle}>{t.nearby}</Text><Text style={s.placeCount}>{String(visible.length).padStart(2, '0')}</Text></View>
      {visible.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} decelerationRate="fast" snapToInterval={cardWidth + 12} contentContainerStyle={s.cards}>
        {visible.map(place => <View key={place.id} style={[s.card, { width: cardWidth }, selectedPlaceId === place.id && s.cardSelected]}>
          <Pressable accessibilityRole="button" accessibilityLabel={`${place.title[locale]}. ${place.summary[locale]}${reasonByPlace?.[place.id] ? `. ${reasonByPlace[place.id]}` : ''}`} accessibilityHint={t.detailsHint} disabled={busy} onPress={() => openPlace(place.id)} style={({ pressed }) => pressed && s.pressed}>
            <DiscoveryPlacePhoto place={place} locale={locale} style={s.cardPhoto} />
            <View style={s.cardContent}><View style={s.cardTitleRow}><Text numberOfLines={1} style={s.cardTitle}>{place.title[locale]}</Text><Text style={s.cardArrow}>↗</Text></View><Text numberOfLines={1} style={s.cardSummary}>{place.summary[locale]}</Text>{!!reasonByPlace?.[place.id] && <Text numberOfLines={1} style={s.cardReason}>{reasonByPlace[place.id]}</Text>}</View>
          </Pressable>
        </View>)}
      </ScrollView> : <View style={s.empty}><Text style={s.emptyTitle}>{t.empty}</Text><Text style={s.emptyHint}>{t.emptyHint}</Text></View>}
    </View>
  </View>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.pale }, top: { position: 'absolute', left: 16, right: 16, gap: 10 }, header: { flexDirection: 'row', alignItems: 'center', gap: 8 }, heading: { flex: 1, backgroundColor: '#F8F6EFF5', borderRadius: 19, paddingHorizontal: 14, paddingVertical: 9 }, title: { color: C.ink, fontFamily: 'serif', fontSize: 27, lineHeight: 32 }, subtitle: { color: C.muted, fontSize: 10, lineHeight: 16 }, about: { minHeight: 44, borderRadius: 17, backgroundColor: '#F8F6EFF5', borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 11 }, aboutText: { color: C.ink, fontSize: 10, fontWeight: '700' },
  filterRow: { flexDirection: 'row' }, filters: { gap: 7, paddingRight: 2 }, filter: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 19, backgroundColor: '#F8F6EFF5', borderWidth: 1, borderColor: C.line }, filterSelected: { backgroundColor: C.ink, borderColor: C.ink }, filterText: { color: C.ink, fontSize: 11, fontWeight: '600' }, filterTextSelected: { color: C.paper },
  contextContainer: { alignSelf: 'flex-start', maxWidth: '100%' }, contextBadge: { minHeight: 34, maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F8F6EFF5', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: C.line }, contextDot: { height: 6, width: 6, borderRadius: 3, backgroundColor: '#7C997B' }, contextSummary: { color: C.ink, fontSize: 10, lineHeight: 17, flexShrink: 1 }, contextArrow: { color: C.muted, fontSize: 14 }, contextAttribution: { alignSelf: 'flex-start', backgroundColor: '#F8F6EFF0', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 8, marginTop: 3 }, contextAttributionText: { color: C.muted, fontSize: 9, lineHeight: 13 }, contextSourceError: { backgroundColor: C.paper, padding: 8, borderRadius: 10, color: C.red, fontSize: 11, lineHeight: 17, marginTop: 3 },
  contextPanel: { marginTop: 6, backgroundColor: C.paper, borderRadius: 18, borderWidth: 1, borderColor: C.line, minWidth: '100%', elevation: 3, overflow: 'hidden' }, contextContent: { padding: 14, gap: 12 }, contextDetail: { color: C.muted, fontSize: 12, lineHeight: 21 }, contextChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, contextChoice: { minHeight: 38, paddingHorizontal: 11, paddingVertical: 9, borderRadius: 14, borderWidth: 1, borderColor: C.line, backgroundColor: C.white, justifyContent: 'center' }, contextChoiceSelected: { borderColor: C.ink, backgroundColor: '#E8EFDF' }, choiceText: { color: C.muted, fontSize: 11, lineHeight: 17 }, choiceTextSelected: { color: C.ink, fontWeight: '700' }, contextActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 6 }, contextAction: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 3 }, contextActionText: { color: C.ink, fontSize: 11, fontWeight: '600' },
  languages: { position: 'absolute', right: 16, padding: 3, flexDirection: 'row', borderRadius: 14, backgroundColor: '#F8F6EFF5', borderWidth: 1, borderColor: C.line }, language: { minWidth: 35, minHeight: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, languageSelected: { backgroundColor: C.ink }, languageText: { color: C.muted, fontSize: 10, fontWeight: '700' }, languageTextSelected: { color: C.paper },
  mapSelection: { position: 'absolute', left: 16, right: 141 }, selectionButton: { minHeight: 40, borderRadius: 15, borderWidth: 1, borderColor: C.line, backgroundColor: C.paper, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 11 }, selectionDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.ink }, selectionText: { color: C.ink, fontSize: 11, flex: 1, fontWeight: '600' }, selectionArrow: { color: C.muted, fontSize: 15 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 12, backgroundColor: '#F8F6EFF7', borderTopLeftRadius: 25, borderTopRightRadius: 25, borderTopWidth: 1, borderColor: '#E0E6D9', elevation: 6 }, sectionHeading: { paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }, sectionTitle: { color: C.ink, fontSize: 12, fontWeight: '700' }, placeCount: { color: C.muted, fontSize: 10, letterSpacing: 1 }, cards: { paddingHorizontal: 16, gap: 12, paddingBottom: 2 }, card: { maxHeight: 190, borderRadius: 19, backgroundColor: C.white, borderWidth: 2, borderColor: '#F8F6EF', overflow: 'hidden' }, cardSelected: { borderColor: C.ink }, cardPhoto: { width: '100%', height: 91 }, cardContent: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10, gap: 4 }, cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, cardTitle: { color: C.ink, fontSize: 14, lineHeight: 20, fontWeight: '700', flex: 1 }, cardArrow: { color: C.muted, fontSize: 15 }, cardSummary: { color: C.muted, fontSize: 10, lineHeight: 15, minHeight: 15 }, cardReason: { color: '#496C50', fontSize: 10, lineHeight: 15, minHeight: 15 },
  empty: { paddingHorizontal: 22, paddingTop: 20, paddingBottom: 25, gap: 8 }, emptyTitle: { color: C.ink, fontSize: 14, fontWeight: '600' }, emptyHint: { color: C.muted, fontSize: 12, lineHeight: 19 }, pressed: { opacity: .72 },
});
