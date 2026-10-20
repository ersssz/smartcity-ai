import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, BackHandler, Keyboard, Linking, PanResponder, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View, useWindowDimensions, type ScrollViewInstance } from 'react-native';
import { Camera, GeoJSONSource, Layer, Map, ViewAnnotation } from '@maplibre/maplibre-react-native';

export type WalkLocale = 'ru' | 'kk' | 'en';
export type UiWalkStop = {
  id: string;
  title: string;
  kicker: string;
  coordinate: [number, number];
  minutes: number;
  storyTitle: string;
  story: string;
  observation: string;
  quest: { question: string; choices: { id: string; label: string }[]; hint: string };
  sources: { label: string; url: string; checkedAt?: string }[];
};

/** All copy is already localized by the caller; this view never generates facts or routes. */
export type UiWalk = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  eyebrow: string;
  minutes: number;
  distanceMeters: number;
  walkMinutes: number;
  visitMinutes: number;
  reserveMinutes: number;
  startLabel: string;
  endLabel: string;
  route: [number, number][];
  stops: UiWalkStop[];
  attribution: string;
  fieldNote: string;
  closing?: string;
  collectionTitle?: string;
  collectionDescription?: string;
};

export type UiWalkSession = {
  phase: 'ready' | 'active' | 'paused' | 'completed';
  currentStopIndex: number;
  completedStopIds: string[];
  skippedStopIds: string[];
  manualStopIds: string[];
  answers: Record<string, { choiceId: string; correct: boolean; feedback: string }>;
};

/** Callbacks are commands owned by the domain. The view owns only browsing and disclosure state. */
export type WalkExperienceProps = {
  locale: WalkLocale;
  walk: UiWalk;
  session: UiWalkSession;
  busy?: boolean;
  error?: string | null;
  locationStatus?: string;
  livePosition?: { coordinate: [number, number]; accuracyMeters: number | null };
  audio?: { available: boolean; playing: boolean; label?: string };
  tracking?: { active: boolean; label: string; unavailableReason?: string };
  bottomInset?: number;
  discoveries?: { walkId: string; title: string }[];
  onLocaleChange: (locale: WalkLocale) => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onMarkStop: (stopId: string) => void;
  onContinue: (stopId: string) => void;
  onAnswer: (stopId: string, choiceId: string) => void;
  onSkip: (stopId: string) => void;
  onSpeak: (stopId: string) => void;
  onStopAudio: () => void;
  onOpenExternalRoute?: () => void;
  onToggleTracking?: () => void;
  onRestart: () => void;
  onConfirmReturn: () => void;
  onOpenDiagnostics: () => void;
  onOpenCity?: () => void;
};

const COPY = {
  ru: {
    city: 'АСТАНА · ГОРОДСКИЕ ИСТОРИИ', explore: 'Исследовать', journal: 'Мой журнал',
    introduction: 'Знакомый город.\nНовый взгляд.', introductionBody: 'Замедлиться, заметить деталь, связать её с историей. Одна прогулка — несколько открытий.',
    route: 'ВАША ПРОГУЛКА', minutes: 'мин', km: 'км', stops: 'остановки', walk: 'переходы', visit: 'истории и задания', reserve: 'запас времени',
    preview: 'Рассмотреть прогулку', back: '← К прогулке', start: 'Начать прогулку', resume: 'Продолжить', pause: 'Пауза', stop: 'Остановить и сохранить',
    startLabel: 'СТАРТ', endLabel: 'ФИНИШ', anchorNote: 'Я выбираю этот публичный старт. Путь от моего текущего местоположения до него в маршрут и время не включён.',
    itinerary: 'Как разворачивается история', itineraryBody: 'Небольшие главы, реальные места и задания на внимательность. Можно пропустить любую остановку.',
    routeMap: 'МАРШРУТ ПРОГУЛКИ', mapUnavailable: 'Подложка карты недоступна. Геометрия сохранённого маршрута и список остановок остаются в пакете.', noRoute: 'Для этой прогулки ещё нет подтверждённой геометрии пути.',
    navigation: 'Открыть точку старта в картах', ready: 'ПОДГОТОВЛЕНА ДЛЯ ВАС', active: 'ПРОГУЛКА НАЧАЛАСЬ', paused: 'ПРОГУЛКА НА ПАУЗЕ', completed: 'ПРОГУЛКА ЗАВЕРШЕНА',
    chapter: 'ГЛАВА', look: 'ПРИСМОТРИТЕСЬ', quest: 'НЕБОЛЬШОЕ ОТКРЫТИЕ', hint: 'Показать подсказку', hideHint: 'Скрыть подсказку',
    listen: 'Послушать главу', stopAudio: 'Остановить звук', audioUnavailable: 'Озвучка недоступна. Весь рассказ можно прочитать ниже.',
    manual: 'Я у остановки · ручная отметка', manualHelp: 'Это ваша ручная отметка. Она не подтверждает GPS-прибытие или вход в здание.', marked: 'Вы отметили знакомство вручную',
    skip: 'Пропустить эту остановку', skipped: 'Остановка пропущена', done: 'Глава пройдена', sources: 'Источники и проверка', sourceDate: 'Проверено',
    progress: 'ВАШ ПРОГРЕСС', next: 'Следующая глава →', previous: '← Предыдущая', overview: 'Все остановки',
    collection: 'Город становится вашим', collectionBody: 'Вы сохранили впечатления и открыли ещё одну сторону Астаны. Ваш журнал хранится на этом телефоне.',
    collectionEmpty: 'Здесь появятся ваши открытия', collectionEmptyBody: 'Начните прогулку и отмечайте знакомство с остановками. Журнал будет сохранять ваш прогресс.',
    local: 'ЛОКАЛЬНАЯ КОЛЛЕКЦИЯ', manualCollection: 'Ручная отметка', skippedCollection: 'Пропущено', questSolved: 'Задание выполнено', questPending: 'Задание ещё не выполнено',
    viewed: 'открыто', privacy: 'Публикация выключена. Ваш журнал доступен только на этом телефоне.', diagnostics: 'Техническая проверка',
    returnToRoute: 'Вернуться к прогулке', saving: 'Сохраняем…', important: 'ПЕРЕД ПРОГУЛКОЙ', pausedBody: 'Ваш прогресс сохранён. Нажмите «Продолжить», когда будете готовы идти дальше.',
    continue: 'Сохранить главу и продолжить →', restart: 'Пройти прогулку заново', partial: 'ПРОГУЛКА ЗАВЕРШЕНА ЧАСТИЧНО', mapOnline: 'Подложка карты загружается из интернета. Текст, задания и линия маршрута входят в сохранённый пакет.', trackingOn: 'Остановить GPS-сопровождение', trackingOff: 'Включить GPS-сопровождение', previewChapter: 'Предварительный просмотр. Задание и отметка доступны у текущей остановки.', motto: 'ЧУТЬ ДАЛЬШЕ. ЧУТЬ БОЛЬШЕ ОТКРЫТИЙ.',
    returning: 'ПОРА ВЕРНУТЬСЯ К СТАРТУ', returnTitle: 'Замыкаем круг', returnBody: 'Главы закончились, а прогулка продолжается: впереди обратный участок по сохранённому маршруту. Подтвердите возвращение, когда будете у старта.', confirmReturn: 'Я вернулся к старту · ручное подтверждение', returnTab: 'Возвращение',
    savedDiscoveries: 'Сохранённые открытия', manualProof: 'Ручное прохождение', savedBody: 'Открытия прежних прогулок сохранены в вашем журнале на этом телефоне.',
    expand: 'Развернуть карточку', collapse: 'Свернуть к карте', search: 'Остановка этой прогулки', noSearchResults: 'В этой прогулке нет такой остановки', map: 'Карта', current: 'Сейчас', more: 'Маршрут и главы',
  },
  kk: {
    city: 'АСТАНА · ҚАЛА ХИКАЯЛАРЫ', explore: 'Зерттеу', journal: 'Менің күнделігім',
    introduction: 'Таныс қала.\nЖаңа көзқарас.', introductionBody: 'Асықпай жүріп, бір бөлшекті байқап, оның тарихын тану. Бір серуен — бірнеше жаңалық.',
    route: 'СІЗДІҢ СЕРУЕНІҢІЗ', minutes: 'мин', km: 'км', stops: 'аялдама', walk: 'жолға', visit: 'хикаялар мен тапсырмалар', reserve: 'уақыт қоры',
    preview: 'Серуенмен танысу', back: '← Серуенге оралу', start: 'Серуенді бастау', resume: 'Жалғастыру', pause: 'Үзіліс', stop: 'Тоқтатып, сақтау',
    startLabel: 'БАСТАУ', endLabel: 'АЯҚТАУ', anchorNote: 'Осы қоғамдық бастау нүктесін таңдаймын. Қазіргі орнымнан оған дейінгі жол маршрут пен уақыт есебіне кірмейді.',
    itinerary: 'Хикая қалай өрбиді', itineraryBody: 'Шағын тараулар, нақты орындар және байқағыштық тапсырмалары. Кез келген аялдаманы өткізіп жіберуге болады.',
    routeMap: 'СЕРУЕН МАРШРУТЫ', mapUnavailable: 'Карта жүктелмеді. Сақталған маршрут сызығы мен аялдамалар тізімі пакетте қалады.', noRoute: 'Бұл серуеннің расталған маршрут геометриясы әзірге жоқ.',
    navigation: 'Бастау нүктесін картада ашу', ready: 'СІЗ ҮШІН ДАЙЫНДАЛДЫ', active: 'СЕРУЕН БАСТАЛДЫ', paused: 'СЕРУЕН ҮЗІЛІСТЕ', completed: 'СЕРУЕН АЯҚТАЛДЫ',
    chapter: 'ТАРАУ', look: 'НАЗАР АУДАРЫҢЫЗ', quest: 'ШАҒЫН ЖАҢАЛЫҚ', hint: 'Көмекті көрсету', hideHint: 'Көмекті жасыру',
    listen: 'Тарауды тыңдау', stopAudio: 'Дыбысты тоқтату', audioUnavailable: 'Дыбыстау қолжетімсіз. Хикаяның толық мәтіні төменде.',
    manual: 'Аялдамадамын · қолмен белгілеу', manualHelp: 'Бұл — сіздің қолмен қойған белгіңіз. Ол GPS арқылы келуді немесе ғимаратқа кіруді растамайды.', marked: 'Танысуды қолмен белгіледіңіз',
    skip: 'Бұл аялдаманы өткізіп жіберу', skipped: 'Аялдама өткізілді', done: 'Тарау аяқталды', sources: 'Дереккөздер және тексеру', sourceDate: 'Тексерілді',
    progress: 'СІЗДІҢ ІЛГЕРІЛЕУІҢІЗ', next: 'Келесі тарау →', previous: '← Алдыңғы', overview: 'Барлық аялдама',
    collection: 'Қала сізге жақындай түсті', collectionBody: 'Сіз әсерлеріңізді сақтап, Астананың тағы бір қырын аштыңыз. Күнделік осы телефонда сақталады.',
    collectionEmpty: 'Мұнда жаңалықтарыңыз пайда болады', collectionEmptyBody: 'Серуенді бастап, аялдамалармен танысуды белгілеңіз. Күнделік ілгерілеуіңізді сақтайды.',
    local: 'ЖЕКЕ ЖИНАҚ', manualCollection: 'Қолмен белгіленді', skippedCollection: 'Өткізілді', questSolved: 'Тапсырма орындалды', questPending: 'Тапсырма әлі орындалған жоқ',
    viewed: 'ашылды', privacy: 'Жариялау өшірулі. Күнделігіңіз тек осы телефонда қолжетімді.', diagnostics: 'Техникалық тексеру',
    returnToRoute: 'Серуенге оралу', saving: 'Сақталуда…', important: 'СЕРУЕН АЛДЫНДА', pausedBody: 'Ілгерілеуіңіз сақталды. Дайын болғанда «Жалғастыру» түймесін басыңыз.',
    continue: 'Тарауды сақтап, жалғастыру →', restart: 'Серуенді қайта өту', partial: 'СЕРУЕН ІШІНАРА АЯҚТАЛДЫ', mapOnline: 'Карта интернеттен жүктеледі. Мәтін, тапсырмалар және маршрут сызығы сақталған пакетке кіреді.', trackingOn: 'GPS сүйемелдеуін тоқтату', trackingOff: 'GPS сүйемелдеуін қосу', previewChapter: 'Алдын ала қарау. Тапсырма мен белгі ағымдағы аялдамада қолжетімді.', motto: 'БІРАЗ ЖҮРІП, КӨБІРЕК ЖАҢАЛЫҚ АШ.',
    returning: 'БАСТАУ НҮКТЕСІНЕ ОРАЛАТЫН УАҚЫТ', returnTitle: 'Шеңберді тұйықтаймыз', returnBody: 'Тараулар аяқталды, бірақ серуен жалғасады: сақталған маршрутпен кері қайту керек. Бастау нүктесіне жеткенде оралғаныңызды растаңыз.', confirmReturn: 'Бастау нүктесіне оралдым · қолмен растау', returnTab: 'Оралу',
    savedDiscoveries: 'Сақталған жаңалықтар', manualProof: 'Қолмен расталған өту', savedBody: 'Бұрынғы серуендерде ашқан жаңалықтарыңыз осы телефондағы күнделікте сақталған.',
    expand: 'Карточканы ашу', collapse: 'Картаға жинау', search: 'Осы серуеннің аялдамасы', noSearchResults: 'Бұл серуенде мұндай аялдама жоқ', map: 'Карта', current: 'Қазір', more: 'Маршрут пен тараулар',
  },
  en: {
    city: 'ASTANA · CITY STORIES', explore: 'Explore', journal: 'My journal',
    introduction: 'A familiar city.\nA different view.', introductionBody: 'Slow down, notice a detail, discover its story. One walk. A few new ways to see the city.',
    route: 'YOUR WALK', minutes: 'min', km: 'km', stops: 'stops', walk: 'walking', visit: 'stories and quests', reserve: 'time in reserve',
    preview: 'Explore this walk', back: '← Back to the walk', start: 'Start the walk', resume: 'Continue', pause: 'Pause', stop: 'Stop and save',
    startLabel: 'START', endLabel: 'FINISH', anchorNote: 'I choose this public starting point. The journey from my current location to it is not included in this route or its time.',
    itinerary: 'How the story unfolds', itineraryBody: 'Short chapters, real places and small observation quests. You can skip any stop.',
    routeMap: 'YOUR WALKING ROUTE', mapUnavailable: 'The base map is unavailable. Saved route geometry and the stop list remain in the walk package.', noRoute: 'Confirmed route geometry is not yet available for this walk.',
    navigation: 'Open the starting point in maps', ready: 'READY WHEN YOU ARE', active: 'YOUR WALK HAS BEGUN', paused: 'WALK PAUSED', completed: 'WALK COMPLETED',
    chapter: 'CHAPTER', look: 'LOOK A LITTLE CLOSER', quest: 'A SMALL DISCOVERY', hint: 'Show a hint', hideHint: 'Hide hint',
    listen: 'Listen to this chapter', stopAudio: 'Stop audio', audioUnavailable: 'Audio is unavailable. The complete story is below.',
    manual: 'I am at this stop · manual mark', manualHelp: 'This is your manual mark. It does not confirm a GPS arrival or entry into a building.', marked: 'You marked this stop manually',
    skip: 'Skip this stop', skipped: 'Stop skipped', done: 'Chapter completed', sources: 'Sources and verification', sourceDate: 'Checked',
    progress: 'YOUR PROGRESS', next: 'Next chapter →', previous: '← Previous', overview: 'All stops',
    collection: 'Make the city your own', collectionBody: 'You saved a few impressions and discovered another side of Astana. Your journal stays on this phone.',
    collectionEmpty: 'Your discoveries will live here', collectionEmptyBody: 'Start a walk and mark the places you explore. Your journal will keep your progress.',
    local: 'LOCAL COLLECTION', manualCollection: 'Manual mark', skippedCollection: 'Skipped', questSolved: 'Quest completed', questPending: 'Quest not yet completed',
    viewed: 'discovered', privacy: 'Sharing is off. Your journal is available only on this phone.', diagnostics: 'Technical diagnostics',
    returnToRoute: 'Return to the walk', saving: 'Saving…', important: 'BEFORE YOU GO', pausedBody: 'Your progress is saved. Tap Continue when you are ready to go on.',
    continue: 'Save chapter and continue →', restart: 'Walk this route again', partial: 'WALK PARTIALLY COMPLETED', mapOnline: 'The base map loads from the internet. Text, quests and the route line are included in the saved package.', trackingOn: 'Stop GPS guidance', trackingOff: 'Enable GPS guidance', previewChapter: 'Chapter preview. The quest and manual mark are available at the current stop.', motto: 'WALK A LITTLE. DISCOVER MORE.',
    returning: 'TIME TO RETURN TO THE START', returnTitle: 'Complete the circle', returnBody: 'The chapters are finished, but the walk continues: follow the saved route back. Confirm your return when you reach the starting point.', confirmReturn: 'I returned to the start · manual confirmation', returnTab: 'Return',
    savedDiscoveries: 'Saved discoveries', manualProof: 'Manual completion', savedBody: 'Discoveries from your earlier walks are saved in your journal on this phone.',
    expand: 'Expand walk card', collapse: 'Collapse to map', search: 'Find a stop on this walk', noSearchResults: 'No matching stop on this walk', map: 'Map', current: 'Now', more: 'Route and chapters',
  },
} as const;
type Labels = typeof COPY[WalkLocale];
const COLORS = { ink: '#173F3B', deep: '#103A36', mint: '#D8F0D4', paper: '#F8F6EF', white: '#FFFFFF', muted: '#536861', line: '#DCE3D8', ochre: '#E0A964', pale: '#ECF0E7', error: '#8A3228' };

function Button({ label, onPress, disabled = false, tone = 'primary', compact = false }: {
  label: string; onPress: () => void; disabled?: boolean; tone?: 'primary' | 'secondary' | 'quiet' | 'danger'; compact?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} onPress={onPress} disabled={disabled}
    style={({ pressed }) => [s.button, compact && s.compactButton, tone === 'secondary' && s.secondaryButton, tone === 'quiet' && s.quietButton,
      tone === 'danger' && s.dangerButton, disabled && s.disabled, pressed && !disabled && s.pressed]}>
    <Text style={[s.buttonLabel, (tone === 'secondary' || tone === 'quiet') && s.darkButtonLabel, tone === 'danger' && s.dangerLabel]}>{label}</Text>
  </Pressable>;
}

function Eyebrow({ children, light = false }: { children: string; light?: boolean }) {
  return <Text style={[s.eyebrow, light && s.lightEyebrow]}>{children}</Text>;
}

function RouteMap({ walk, labels, selectedId, livePosition, bottomPadding, onSelectStop }: { walk: UiWalk; labels: Labels; selectedId?: string; livePosition?: WalkExperienceProps['livePosition']; bottomPadding: number; onSelectStop: (index: number) => void }) {
  const [failed, setFailed] = useState(false);
  const shape = useMemo<GeoJSON.Feature<GeoJSON.LineString>>(() => ({
    type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: walk.route },
  }), [walk.route]);
  const bounds = useMemo<[number, number, number, number] | null>(() => {
    if (walk.route.length < 2) return null;
    const lng = walk.route.map(point => point[0]);
    const lat = walk.route.map(point => point[1]);
    return [Math.min(...lng), Math.min(...lat), Math.max(...lng), Math.max(...lat)];
  }, [walk.route]);
  return <View style={s.mapCanvas} accessibilityLabel={labels.routeMap}>
      {bounds ? <Map key={walk.id} style={s.map} mapStyle="https://tiles.openfreemap.org/styles/liberty" attribution compass
        attributionPosition={{ top: (StatusBar.currentHeight ?? 24) + 154, right: 12 }} compassPosition={{ top: (StatusBar.currentHeight ?? 24) + 154, right: 58 }}
        onDidFailLoadingMap={() => setFailed(true)} onDidFinishLoadingMap={() => setFailed(false)}>
        <Camera initialViewState={{ bounds, padding: { top: 155, bottom: bottomPadding, left: 46, right: 46 } }} />
        <GeoJSONSource id="walk-route" data={shape}>
          <Layer id="walk-route-casing" type="line" paint={{ 'line-color': '#FFFFFF', 'line-width': 9, 'line-opacity': 0.95 }} layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
          <Layer id="walk-route-line" type="line" paint={{ 'line-color': COLORS.ink, 'line-width': 5 }} layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
        </GeoJSONSource>
        {walk.stops.map((stop, index) => <ViewAnnotation key={stop.id} id={`stop-${stop.id}`} lngLat={stop.coordinate} title={stop.title} onPress={() => onSelectStop(index)}>
          <View collapsable={false} style={[s.mapPin, selectedId === stop.id && s.selectedMapPin]}>
            <Text style={[s.mapPinText, selectedId === stop.id && s.selectedMapPinText]}>{index + 1}</Text>
          </View>
        </ViewAnnotation>)}
        {livePosition && <ViewAnnotation id="actual-deviceposition" lngLat={livePosition.coordinate}>
          <View collapsable={false} style={s.livePositionRing}><View style={s.livePositionDot} /></View>
        </ViewAnnotation>}
      </Map> : <View style={s.noMap}><Text style={s.body}>{labels.noRoute}</Text></View>}
      {failed && <View pointerEvents="none" style={s.mapFailureOverlay}><Text accessibilityLiveRegion="polite" style={s.mapFailure}>{labels.mapUnavailable}</Text></View>}
  </View>;
}

function Metrics({ walk, labels, locale }: { walk: UiWalk; labels: Labels; locale: WalkLocale }) {
  const distance = (walk.distanceMeters / 1000).toLocaleString(locale, { maximumFractionDigits: 1 });
  return <View style={s.metrics}>
    <View style={s.metric}><Text style={s.metricValue}>{walk.minutes}<Text style={s.metricUnit}> {labels.minutes}</Text></Text><Text style={s.metricLabel}>{labels.route.toLocaleLowerCase(locale)}</Text></View>
    <View style={[s.metric, s.metricDivider]}><Text style={s.metricValue}>{distance}<Text style={s.metricUnit}> {labels.km}</Text></Text><Text style={s.metricLabel}>{labels.walk}</Text></View>
    <View style={[s.metric, s.metricDivider]}><Text style={s.metricValue}>{walk.stops.length}</Text><Text style={s.metricLabel}>{labels.stops}</Text></View>
  </View>;
}

function StopSources({ stop, labels }: { stop: UiWalkStop; labels: Labels }) {
  return <View style={s.sources}>{stop.sources.map(source => <Pressable key={source.url} accessibilityRole="link" onPress={() => {
    if (/^https:\/\//i.test(source.url)) void Linking.openURL(source.url).catch(() => undefined);
  }} style={s.sourceLink}>
    <Text style={s.sourceLabel}>{source.label} ↗</Text>{source.checkedAt && <Text style={s.meta}>{labels.sourceDate}: {source.checkedAt}</Text>}
  </Pressable>)}</View>;
}

export default function WalkExperience(props: WalkExperienceProps) {
  const { walk, session, locale, busy = false, error, audio } = props;
  const t = COPY[locale];
  const [tab, setTab] = useState<'explore' | 'journal'>('explore');
  const [detail, setDetail] = useState(false);
  const [preparedPlace, setPreparedPlace] = useState(false);
  const [anchorChosen, setAnchorChosen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(session.currentStopIndex);
  const [hintShown, setHintShown] = useState(false);
  const [sourcesShown, setSourcesShown] = useState(false);
  const previousPhase = useRef<UiWalkSession['phase'] | null>(null);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const isPrepared = session.phase === 'ready';
  const isComplete = session.phase === 'completed';
  const inSession = session.phase === 'active' || session.phase === 'paused';
  const returning = inSession && session.currentStopIndex === walk.stops.length;
  const showReturn = returning && selectedIndex >= walk.stops.length;
  const stop = walk.stops[selectedIndex] ?? walk.stops[session.currentStopIndex] ?? walk.stops[0];
  const doneCount = session.completedStopIds.length;
  const fullCompletion = isComplete && doneCount === walk.stops.length;
  const hasSavedDiscoveries = !!props.discoveries?.length;
  const answer = stop ? session.answers[stop.id] : undefined;
  const marked = stop ? session.manualStopIds.includes(stop.id) : false;
  const skipped = stop ? session.skippedStopIds.includes(stop.id) : false;
  const stopDone = stop ? session.completedStopIds.includes(stop.id) : false;
  const currentStop = stop?.id === walk.stops[session.currentStopIndex]?.id;
  const canAct = !busy && session.phase === 'active' && currentStop;
  const journalShown = tab === 'journal';
  const { height: viewportHeight } = useWindowDimensions();
  const bottomInset = Math.max(20, props.bottomInset ?? (Platform.OS === 'ios' ? 28 : 48));
  const navigationHeight = 56 + bottomInset;
  const footerHeight = navigationHeight + (inSession ? 64 : 0);
  const collapsedHeight = 204;
  const sheetHeight = Math.max(260, viewportHeight - footerHeight - Math.max(154, viewportHeight * 0.2));
  const collapsedOffset = Math.max(0, sheetHeight - collapsedHeight);
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const sheetOffset = useRef(new Animated.Value(collapsedOffset)).current;
  const offsetRef = useRef(collapsedOffset);
  const dragOrigin = useRef(collapsedOffset);
  const expandedRef = useRef(false);
  const settleSheet = useCallback((nextExpanded: boolean) => {
    expandedRef.current = nextExpanded;
    setExpanded(nextExpanded);
    if (nextExpanded) setDetail(true);
    Keyboard.dismiss(); setSearchFocused(false);
    Animated.spring(sheetOffset, { toValue: nextExpanded ? 0 : collapsedOffset, tension: 80, friction: 14, useNativeDriver: true }).start();
  }, [collapsedOffset, sheetOffset]);
  const settleSheetRef = useRef(settleSheet);
  useEffect(() => { settleSheetRef.current = settleSheet; }, [settleSheet]);
  useEffect(() => {
    const listener = sheetOffset.addListener(({ value }) => { offsetRef.current = value; });
    return () => sheetOffset.removeListener(listener);
  }, [sheetOffset]);
  useEffect(() => {
    sheetOffset.setValue(expandedRef.current ? 0 : collapsedOffset);
  }, [collapsedOffset, sheetOffset]);
  const drag = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderGrant: () => { Keyboard.dismiss(); setExpanded(true); sheetOffset.stopAnimation(value => { dragOrigin.current = value; }); },
    onPanResponderMove: (_, gesture) => { sheetOffset.setValue(Math.max(0, Math.min(collapsedOffset, dragOrigin.current + gesture.dy))); },
    onPanResponderRelease: (_, gesture) => settleSheet(gesture.vy < -0.25 || (gesture.vy <= 0.25 && offsetRef.current < collapsedOffset / 2)),
    onPanResponderTerminate: () => settleSheet(expandedRef.current),
  }), [collapsedOffset, settleSheet, sheetOffset]);
  useEffect(() => {
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (searchFocused || query) { setSearchFocused(false); setQuery(''); Keyboard.dismiss(); return true; }
      if (expandedRef.current) { settleSheet(false); return true; }
      return false;
    });
    return () => back.remove();
  }, [query, searchFocused, settleSheet]);
  useEffect(() => { if (error) { settleSheet(true); scrollRef.current?.scrollTo({ y: 0, animated: true }); } }, [error, settleSheet]);
  const matches = useMemo(() => walk.stops.map((item, index) => ({ item, index })).filter(({ item }) =>
    `${item.title} ${item.kicker}`.toLocaleLowerCase(locale).includes(query.trim().toLocaleLowerCase(locale))), [walk.stops, locale, query]);

  useEffect(() => {
    if (session.phase === 'completed') {
      if (previousPhase.current !== 'completed') { setTab('journal'); settleSheetRef.current(true); }
      setSelectedIndex(0);
    } else setSelectedIndex(session.currentStopIndex);
    previousPhase.current = session.phase;
  }, [session.currentStopIndex, session.phase]);
  useEffect(() => { setHintShown(false); setSourcesShown(false); }, [stop?.id]);
  useEffect(() => { setAnchorChosen(false); setDetail(false); setPreparedPlace(false); }, [walk.id]);
  const go = (nextTab: 'explore' | 'journal') => { setTab(nextTab); settleSheet(nextTab === 'journal'); scrollRef.current?.scrollTo({ y: 0, animated: true }); };
  const selectStop = (index: number) => { setSelectedIndex(index); if (isPrepared) setPreparedPlace(true); setTab('explore'); setQuery(''); setSearchFocused(false); settleSheet(true); scrollRef.current?.scrollTo({ y: 0, animated: true }); };

  return <View style={s.root}>
    <StatusBar barStyle="dark-content" />
    <RouteMap walk={walk} labels={t} selectedId={showReturn ? walk.stops[0]?.id : stop?.id} livePosition={inSession ? props.livePosition : undefined} bottomPadding={collapsedHeight + footerHeight + 25} onSelectStop={selectStop} />
    <View pointerEvents="box-none" style={s.floatingTop}>
    <View style={s.header}>
      <Text style={s.searchIcon}>⌕</Text><TextInput value={query} onChangeText={setQuery} onFocus={() => setSearchFocused(true)} placeholder={t.search} placeholderTextColor="#6F8078" style={s.searchInput}
        accessibilityLabel={t.search} returnKeyType="search" onSubmitEditing={() => { if (matches[0]) selectStop(matches[0].index); }} />
      {(query || searchFocused) ? <Pressable accessibilityRole="button" accessibilityLabel={t.collapse} onPress={() => { setQuery(''); setSearchFocused(false); Keyboard.dismiss(); }} style={s.searchClear}><Text style={s.searchClearLabel}>×</Text></Pressable> : null}
      <View style={s.languages} accessibilityRole="tablist">
        {(['ru', 'kk', 'en'] as const).map(code => <Pressable key={code} accessibilityRole="tab" accessibilityState={{ selected: code === locale }}
          onPress={() => props.onLocaleChange(code)} style={[s.language, code === locale && s.languageSelected]}>
          <Text style={[s.languageLabel, code === locale && s.languageLabelSelected]}>{code.toUpperCase()}</Text>
        </Pressable>)}
      </View>
    </View>
    {searchFocused && <View style={s.searchResults}><ScrollView keyboardShouldPersistTaps="handled" style={s.searchScroll}>
      {matches.length ? matches.map(({ item, index }) => <Pressable key={item.id} accessibilityRole="button" onPress={() => selectStop(index)} style={s.searchResult}>
        <View style={s.searchNumber}><Text style={s.searchNumberText}>{index + 1}</Text></View><View style={s.flex}><Text style={s.searchResultTitle}>{item.title}</Text><Text style={s.meta}>{item.kicker}</Text></View>
      </Pressable>) : <Text style={s.searchEmpty}>{t.noSearchResults}</Text>}
    </ScrollView></View>}
    {!searchFocused && <View style={s.mapBrandRow}><View pointerEvents="none" style={s.mapBrand}><Text style={s.mapBrandText}>astana<Text style={s.wordmarkDot}>.</Text></Text><Text style={s.mapBrandCaption}>{t.route}</Text></View>
      {props.onOpenCity && <Pressable accessibilityRole="button" disabled={busy} accessibilityState={{ disabled: busy }} onPress={props.onOpenCity} style={s.cityButton}><Text style={s.cityButtonText}>{({ ru: 'О городе ↗', kk: 'Қала туралы ↗', en: 'City guide ↗' })[locale]}</Text></Pressable>}
    </View>}
    </View>
    <Animated.View style={[s.sheet, { bottom: footerHeight, height: sheetHeight, transform: [{ translateY: sheetOffset }] }]}>
      <View {...drag.panHandlers} style={s.sheetHandleArea}>
        <Pressable accessibilityRole="button" accessibilityLabel={expanded ? t.collapse : t.expand} accessibilityState={{ expanded }} onPress={() => settleSheet(!expandedRef.current)} style={s.sheetHandleButton}><View style={s.sheetHandle} /><Text style={s.sheetToggle}>{expanded ? '⌄' : '⌃'}</Text></Pressable>
      </View>
      <View style={s.sheetSummary}>
        <View style={s.summaryTop}><Text numberOfLines={1} style={[s.eyebrow, s.flex]}>{journalShown ? t.local : showReturn ? t.returning : isPrepared ? walk.eyebrow : isComplete ? t.completed : session.phase === 'paused' ? t.paused : `${t.current} · ${stop?.title ?? walk.title}`}</Text>{busy && <ActivityIndicator size="small" color={COLORS.ink} />}</View>
        <Text accessibilityRole="header" numberOfLines={expanded ? 1 : 2} style={s.summaryTitle}>{journalShown ? t.journal : showReturn ? t.returnTitle : isPrepared && preparedPlace && stop ? stop.title : walk.title}</Text>
        <View style={s.summaryMetrics}><Text style={s.summaryMetric}>{walk.minutes} {t.minutes}</Text><Text style={s.summaryMetricDot}>·</Text><Text style={s.summaryMetric}>{(walk.distanceMeters / 1000).toLocaleString(locale, { maximumFractionDigits: 1 })} {t.km}</Text><Text style={s.summaryMetricDot}>·</Text><Text style={s.summaryMetric}>{isPrepared ? `${walk.stops.length} ${t.stops}` : `${doneCount}/${walk.stops.length} ${t.viewed}`}</Text></View>
        {!expanded && <Button compact label={journalShown ? t.journal : isPrepared ? t.preview : t.more} onPress={() => settleSheet(true)} />}
      </View>
    <ScrollView ref={scrollRef} style={[s.sheetScroll, !expanded && s.hiddenSheetContent]} scrollEnabled={expanded} pointerEvents={expanded ? 'auto' : 'none'} importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
      {error && <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={s.errorBox}><Text style={s.errorText}>{error}</Text></View>}
      {busy && <View accessibilityLiveRegion="polite" style={s.saving}><ActivityIndicator color={COLORS.ink} size="small" /><Text style={s.meta}>{t.saving}</Text></View>}

      {journalShown ? <View>
        <View style={s.journalHero}>
          <Eyebrow light>{isComplete ? doneCount === walk.stops.length ? t.completed : t.partial : t.local}</Eyebrow>
          <View style={s.discoveryMark}><Text style={s.discoveryMarkText}>✦</Text></View>
          <Text accessibilityRole="header" style={s.journalTitle}>{fullCompletion ? walk.collectionTitle ?? t.collection : doneCount || hasSavedDiscoveries ? t.collection : t.collectionEmpty}</Text>
          <Text style={s.journalBody}>{fullCompletion ? walk.collectionDescription ?? t.collectionBody : doneCount ? t.collectionBody : hasSavedDiscoveries ? t.savedBody : t.collectionEmptyBody}</Text>
          <View style={s.journalCount}><Text style={s.journalCountValue}>{doneCount}<Text style={s.journalCountTotal}> / {walk.stops.length}</Text></Text><Text style={s.journalCountLabel}>{t.viewed}</Text></View>
        </View>
        <View style={s.section}>
          {fullCompletion && walk.closing && <View style={s.closingCard}><Eyebrow>{walk.title}</Eyebrow><Text style={s.storyBody}>{walk.closing}</Text></View>}
          {hasSavedDiscoveries && <View><Text accessibilityRole="header" style={s.sectionTitle}>{t.savedDiscoveries}</Text>
            {props.discoveries?.map(discovery => <View key={discovery.walkId} style={s.savedDiscoveryCard}>
              <View style={s.collectionSeal}><Text style={s.collectionSealText}>✦</Text></View><View style={s.flex}><Text style={s.cardTitle}>{discovery.title}</Text><Text style={s.meta}>{t.manualProof}</Text></View>
            </View>)}
          </View>}
          {walk.stops.filter(item => session.completedStopIds.includes(item.id) || session.manualStopIds.includes(item.id) || session.skippedStopIds.includes(item.id)).map((item, index) =>
            <View key={item.id} style={s.collectionCard}>
              <View style={s.collectionSeal}><Text style={s.collectionSealText}>{index + 1}</Text></View>
              <View style={s.flex}><Text style={s.cardTitle}>{item.title}</Text><Text style={s.meta}>{session.skippedStopIds.includes(item.id) ? t.skippedCollection : session.manualStopIds.includes(item.id) ? t.manualCollection : t.done}</Text>
                <Text style={s.collectionQuest}>{session.answers[item.id]?.correct ? t.questSolved : t.questPending}</Text></View>
            </View>)}
          <Text style={s.privacy}>{t.privacy}</Text>
          {!isComplete && <Button label={t.returnToRoute} onPress={() => go('explore')} />}
          {isComplete && <Button label={t.restart} disabled={busy} onPress={() => { setTab('explore'); setAnchorChosen(false); setDetail(true); setPreparedPlace(false); props.onRestart(); }} />}
        </View>
      </View> : isPrepared ? <View>
        <View style={s.section}>
          {preparedPlace && stop && <View style={s.placePreview}>
            <View style={s.placePreviewHeading}><View style={s.stopNumber}><Text style={s.stopNumberLabel}>{String(selectedIndex + 1).padStart(2, '0')}</Text></View><View style={s.flex}><Text style={s.stopKicker}>{stop.kicker}</Text><Text accessibilityRole="header" style={s.cardTitle}>{stop.title}</Text></View></View>
            <Text style={s.storyTitle}>{stop.storyTitle}</Text><Text style={s.storyBody}>{stop.story.split('\n\n')[0]}</Text>
            <View style={s.observation}><Eyebrow>{t.look}</Eyebrow><Text style={s.observationText}>{stop.observation}</Text></View>
            <Text style={s.meta}>{stop.minutes} {t.minutes} · {t.previewChapter}</Text>
            <Button tone="secondary" label={t.sources} onPress={() => setSourcesShown(value => !value)} />
            {sourcesShown && <StopSources stop={stop} labels={t} />}
            <Button tone="quiet" label={t.back} onPress={() => { setPreparedPlace(false); setSourcesShown(false); scrollRef.current?.scrollTo({ y: 0, animated: true }); }} />
          </View>}
          <Metrics walk={walk} labels={t} locale={locale} />
          <Text style={s.body}>{walk.description}</Text>
          {!detail ? <Button label={t.preview} onPress={() => { setDetail(true); scrollRef.current?.scrollTo({ y: 0, animated: true }); }} /> : <>
            <View style={s.budget}>
              {[[t.walk, walk.walkMinutes], [t.visit, walk.visitMinutes], [t.reserve, walk.reserveMinutes]].map(([label, value]) => <View key={label} style={s.budgetRow}><Text style={s.meta}>{label}</Text><Text style={s.budgetValue}>{value} {t.minutes}</Text></View>)}
            </View>
            <View style={s.endpointCard}><View style={s.endpointRow}><View style={s.endpointDot} /><View style={s.flex}><Eyebrow>{t.startLabel}</Eyebrow><Text style={s.endpointTitle}>{walk.startLabel}</Text></View></View>
              <View style={s.endpointConnector} /><View style={s.endpointRow}><View style={s.endpointFinish} /><View style={s.flex}><Eyebrow>{t.endLabel}</Eyebrow><Text style={s.endpointTitle}>{walk.endLabel}</Text></View></View></View>
            <Text accessibilityRole="header" style={s.sectionTitle}>{t.itinerary}</Text><Text style={s.body}>{t.itineraryBody}</Text>
            {walk.stops.map((item, index) => <View key={item.id} style={[s.itineraryItem, selectedIndex === index && s.itinerarySelected]}>
              <View style={s.stopNumber}><Text style={s.stopNumberLabel}>{String(index + 1).padStart(2, '0')}</Text></View>
              <View style={s.flex}><Text style={s.stopKicker}>{item.kicker}</Text><Text style={s.cardTitle}>{item.title}</Text><Text style={s.body}>{item.observation}</Text><Text style={s.meta}>{item.minutes} {t.minutes}</Text></View>
            </View>)}
            <View style={s.fieldNote}><Eyebrow>{t.important}</Eyebrow><Text style={s.noteBody}>{walk.fieldNote}</Text></View>
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: anchorChosen }} onPress={() => setAnchorChosen(value => !value)} style={s.consent}>
              <View style={[s.checkbox, anchorChosen && s.checkboxSelected]}><Text style={s.checkmark}>{anchorChosen ? '✓' : ''}</Text></View><Text style={s.consentText}>{t.anchorNote}</Text>
            </Pressable>
            <Button label={t.start} disabled={busy || !anchorChosen || walk.route.length < 2} onPress={props.onStart} />
          </>}
        </View>
      </View> : (inSession || isComplete) && stop ? <View>
        <View style={s.activeHeading}><Eyebrow>{isComplete ? doneCount === walk.stops.length ? t.completed : t.partial : session.phase === 'paused' ? t.paused : showReturn ? t.returning : t.active}</Eyebrow><Text accessibilityRole="header" style={s.activeTitle}>{walk.title}</Text><Text style={s.meta}>{props.locationStatus ?? walk.subtitle}</Text></View>
        <View style={s.progressPanel}><View style={s.progressHeading}><Eyebrow>{t.progress}</Eyebrow><Text style={s.progressCount}>{doneCount} / {walk.stops.length}</Text></View>
          <View style={s.progressTrack}>{walk.stops.map(item => <View key={item.id} style={[s.progressSegment, session.completedStopIds.includes(item.id) && s.progressSegmentDone, session.skippedStopIds.includes(item.id) && s.progressSegmentSkipped]} />)}</View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chapterTabs}>
            {walk.stops.map((item, index) => <Pressable key={item.id} onPress={() => selectStop(index)} accessibilityRole="tab" accessibilityState={{ selected: !showReturn && item.id === stop.id }} style={[s.chapterTab, !showReturn && item.id === stop.id && s.chapterTabSelected]}>
              <Text style={[s.chapterTabNumber, !showReturn && item.id === stop.id && s.chapterTabNumberSelected]}>{String(index + 1).padStart(2, '0')}</Text><Text style={[s.chapterTabTitle, !showReturn && item.id === stop.id && s.chapterTabTitleSelected]} numberOfLines={1}>{item.title}</Text>
            </Pressable>)}
            {returning && <Pressable accessibilityRole="tab" accessibilityState={{ selected: showReturn }} onPress={() => selectStop(walk.stops.length)} style={[s.chapterTab, showReturn && s.chapterTabSelected]}><Text style={[s.chapterTabTitle, showReturn && s.chapterTabTitleSelected]}>↩ {t.returnTab}</Text></Pressable>}
          </ScrollView>
        </View>
        {session.phase === 'paused' && <View style={s.pauseCard}><Text style={s.body}>{t.pausedBody}</Text><Button label={t.resume} onPress={props.onResume} disabled={busy} /></View>}
        <View style={s.section}>
          {props.onOpenExternalRoute && <Button tone="secondary" label={t.navigation} onPress={props.onOpenExternalRoute} />}
          {props.tracking && <View style={s.trackingCard}><Text style={s.noteBody}>{props.tracking.label}</Text>
            {props.tracking.unavailableReason && <Text style={s.audioNote}>{props.tracking.unavailableReason}</Text>}
            {props.onToggleTracking && <Button tone="secondary" label={props.tracking.active ? t.trackingOn : t.trackingOff} onPress={props.onToggleTracking} disabled={!props.tracking.active && (busy || !!props.tracking.unavailableReason || session.phase !== 'active')} />}
          </View>}
          {showReturn ? <View style={s.returnCard}>
            <Eyebrow>{t.returning}</Eyebrow><Text accessibilityRole="header" style={s.storyTitle}>{t.returnTitle}</Text>
            <Text style={s.body}>{t.returnBody}</Text><View style={s.endpointCard}><Eyebrow>{t.startLabel}</Eyebrow><Text style={s.endpointTitle}>{walk.startLabel}</Text></View>
            <Text style={s.noteBody}>{t.manualHelp}</Text><Button label={t.confirmReturn} onPress={props.onConfirmReturn} disabled={busy || session.phase !== 'active'} />
          </View> : <>
          <View style={s.chapterHeader}><Eyebrow>{`${t.chapter} ${String(selectedIndex + 1).padStart(2, '0')} · ${stop.minutes} ${t.minutes}`}</Eyebrow><Text accessibilityRole="header" style={s.storyTitle}>{stop.storyTitle}</Text><Text style={s.storyPlace}>{stop.title}</Text></View>
          {audio?.available ? <Button tone="secondary" label={audio.playing ? `Ⅱ  ${t.stopAudio}` : `▷  ${t.listen}`} onPress={audio.playing ? props.onStopAudio : () => props.onSpeak(stop.id)} disabled={busy} /> : <Text style={s.audioNote}>{audio?.label ?? t.audioUnavailable}</Text>}
          {audio?.available && audio.label && <Text style={s.audioNote}>{audio.label}</Text>}
          <Text selectable style={s.storyBody}>{stop.story}</Text>
          <View style={s.observation}><Eyebrow>{t.look}</Eyebrow><Text style={s.observationText}>{stop.observation}</Text></View>
          <View style={s.markCard}>
            <Text style={s.noteBody}>{marked ? t.marked : skipped ? t.skipped : stopDone ? t.done : t.manualHelp}</Text>
            {!marked && !stopDone && !skipped && <Button label={t.manual} onPress={() => props.onMarkStop(stop.id)} disabled={!canAct} />}
          </View>
          <View style={s.questCard}>
            <View style={s.questHeading}><Text style={s.questStar}>✦</Text><Eyebrow>{t.quest}</Eyebrow></View><Text accessibilityRole="header" style={s.questQuestion}>{stop.quest.question}</Text>
            {!currentStop && !stopDone && !skipped && <Text style={s.audioNote}>{t.previewChapter}</Text>}
            {stop.quest.choices.map((choice, index) => {
              const selected = answer?.choiceId === choice.id;
              return <Pressable key={choice.id} accessibilityRole="radio" accessibilityState={{ checked: selected, disabled: !canAct || !marked || answer?.correct === true }}
                disabled={!canAct || !marked || answer?.correct === true} onPress={() => props.onAnswer(stop.id, choice.id)} style={({ pressed }) => [s.choice, selected && s.choiceSelected, selected && answer?.correct && s.choiceCorrect, pressed && s.pressed]}>
                <View style={[s.choiceLetter, selected && s.choiceLetterSelected]}><Text style={[s.choiceLetterText, selected && s.choiceLetterSelectedText]}>{String.fromCharCode(65 + index)}</Text></View><Text style={s.choiceText}>{choice.label}</Text>
              </Pressable>;
            })}
            {answer && <View accessibilityLiveRegion="polite" style={[s.feedback, answer.correct && s.correctFeedback]}><Text style={s.feedbackText}>{answer.correct ? '✓  ' : ''}{answer.feedback}</Text></View>}
            <Button tone="quiet" compact label={hintShown ? t.hideHint : t.hint} onPress={() => setHintShown(value => !value)} />
            {hintShown && <Text style={s.hintText}>{stop.quest.hint}</Text>}
            {answer?.correct && currentStop && !skipped && <Button label={t.continue} onPress={() => props.onContinue(stop.id)} disabled={!canAct || !marked} />}
          </View>
          {!stopDone && !skipped && <Button tone="quiet" label={t.skip} onPress={() => props.onSkip(stop.id)} disabled={!canAct} />}
          <View style={s.chapterNavigation}>
            {selectedIndex > 0 && <View style={s.flex}><Button compact tone="secondary" label={t.previous} onPress={() => selectStop(selectedIndex - 1)} /></View>}
            {selectedIndex < walk.stops.length - 1 && <View style={s.flex}><Button compact tone="secondary" label={t.next} onPress={() => selectStop(selectedIndex + 1)} /></View>}
          </View>
          <Button tone="quiet" label={t.sources} onPress={() => setSourcesShown(value => !value)} />
          {sourcesShown && <StopSources stop={stop} labels={t} />}
          {returning && <Button tone="secondary" label={`↩ ${t.returnTab}`} onPress={() => selectStop(walk.stops.length)} />}
          </>}
        </View>
      </View> : null}

      <View style={s.attributionFooter}><Text style={s.attribution}>{walk.attribution}</Text><Text style={s.attribution}>{t.mapOnline}</Text></View>
      <View style={s.footer}><Text style={s.footerBrand}>astana<Text style={s.wordmarkDot}>.</Text></Text><Button tone="quiet" compact label={t.diagnostics} onPress={props.onOpenDiagnostics} /></View>
    </ScrollView>
    </Animated.View>
    {inSession && <View style={[s.persistentActions, { bottom: navigationHeight }]}><View style={s.flex}><Button compact tone="secondary" label={session.phase === 'active' ? t.pause : t.resume} onPress={session.phase === 'active' ? props.onPause : props.onResume} disabled={busy} /></View><View style={s.flex}><Button compact tone="danger" label={t.stop} onPress={props.onStop} /></View></View>}
    <View style={[s.bottomBar, { height: navigationHeight, paddingBottom: bottomInset }]}>
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: !journalShown }} onPress={() => go('explore')} style={s.bottomTab}><Text style={[s.bottomIcon, !journalShown && s.bottomSelected]}>⌁</Text><Text style={[s.bottomLabel, !journalShown && s.bottomSelected]}>{t.map}</Text></Pressable>
      <View style={s.bottomDivider} />
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: journalShown }} onPress={() => go('journal')} style={s.bottomTab}><Text style={[s.bottomIcon, journalShown && s.bottomSelected]}>▤</Text><Text style={[s.bottomLabel, journalShown && s.bottomSelected]}>{t.journal}</Text>{doneCount > 0 && <View style={s.tabBadge}><Text style={s.tabBadgeText}>{doneCount}</Text></View>}</Pressable>
    </View>
  </View>;
}

const s = StyleSheet.create({
    mapBrandRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
    cityButton: { minHeight: 44, paddingHorizontal: 15, paddingVertical: 12, borderRadius: 16, marginTop: 12, backgroundColor: COLORS.paper, borderWidth: 1, borderColor: COLORS.line, justifyContent: 'center' },
    cityButtonText: { color: COLORS.ink, fontSize: 13, fontWeight: '700' },
    placePreview: { paddingBottom: 20, marginBottom: 4, borderBottomWidth: 1, borderBottomColor: COLORS.line, gap: 16 },
    placePreviewHeading: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    root: { flex: 1, backgroundColor: COLORS.paper, overflow: 'hidden' },
    floatingTop: { position: 'absolute', top: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + 12 : 52, left: 14, right: 14, zIndex: 30 },
    header: { minHeight: 58, paddingLeft: 14, paddingRight: 5, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#E2E9DC', borderRadius: 21, backgroundColor: COLORS.white, elevation: 6, shadowColor: '#173F3B', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 3 } },
    searchIcon: { fontSize: 29, lineHeight: 32, color: COLORS.ink }, searchInput: { flex: 1, minHeight: 48, fontSize: 13, color: COLORS.ink, paddingVertical: 8, paddingHorizontal: 0 }, searchClear: { width: 30, height: 44, alignItems: 'center', justifyContent: 'center' }, searchClearLabel: { fontSize: 25, color: COLORS.muted },
    searchResults: { backgroundColor: COLORS.white, borderRadius: 20, marginTop: 8, elevation: 8, borderWidth: 1, borderColor: COLORS.line, overflow: 'hidden' }, searchScroll: { maxHeight: 240 }, searchResult: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1, borderBottomColor: COLORS.line }, searchNumber: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.pale, alignItems: 'center', justifyContent: 'center' }, searchNumberText: { color: COLORS.ink, fontWeight: '700', fontSize: 13 }, searchResultTitle: { color: COLORS.ink, fontSize: 14, fontWeight: '600', marginBottom: 3 }, searchEmpty: { padding: 20, fontSize: 14, lineHeight: 22, color: COLORS.muted },
    mapBrand: { alignSelf: 'flex-start', marginTop: 12, marginLeft: 2, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: COLORS.paper, borderRadius: 16, borderWidth: 1, borderColor: '#DCE5D7' }, mapBrandText: { fontSize: 20, lineHeight: 23, color: COLORS.ink, fontWeight: '800', letterSpacing: -1 }, mapBrandCaption: { color: COLORS.muted, fontSize: 8, fontWeight: '800', letterSpacing: 1.2 },
    sheet: { position: 'absolute', left: 0, right: 0, backgroundColor: COLORS.paper, borderTopLeftRadius: 26, borderTopRightRadius: 26, overflow: 'hidden', zIndex: 20, elevation: 12, shadowColor: '#173F3B', shadowOpacity: 0.17, shadowRadius: 20, shadowOffset: { width: 0, height: -4 } },
    sheetHandleArea: { height: 44 }, sheetHandleButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' }, sheetHandle: { width: 38, height: 4, backgroundColor: '#B7C4B7', borderRadius: 3 }, sheetToggle: { position: 'absolute', right: 22, top: 7, fontSize: 23, color: COLORS.muted },
    sheetSummary: { paddingHorizontal: 22, paddingBottom: 12 }, summaryTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, alignItems: 'center' }, summaryTitle: { fontSize: 21, lineHeight: 25, fontWeight: '700', color: COLORS.ink, letterSpacing: -0.5, marginTop: 3 }, summaryMetrics: { flexDirection: 'row', gap: 9, marginTop: 6, marginBottom: 10, alignItems: 'center' }, summaryMetric: { fontSize: 12, color: COLORS.muted, fontWeight: '500' }, summaryMetricDot: { color: '#98AA98', fontSize: 14 }, sheetScroll: { flex: 1, borderTopWidth: 1, borderTopColor: COLORS.line }, hiddenSheetContent: { opacity: 0 },
    mapCanvas: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#DCE9D7' }, mapFailureOverlay: { position: 'absolute', top: (StatusBar.currentHeight ?? 24) + 142, left: 16, right: 16, backgroundColor: '#F9EEE4', borderRadius: 14, padding: 12 }, attributionFooter: { paddingVertical: 16, borderTopWidth: 1, borderTopColor: COLORS.line }, itinerarySelected: { borderLeftWidth: 3, borderLeftColor: '#709875', paddingLeft: 12 },
    wordmarkDot: { color: '#668F68' },
    languages: { flexDirection: 'row', backgroundColor: COLORS.pale, borderRadius: 24, padding: 3 }, language: { minWidth: 40, minHeight: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }, languageSelected: { backgroundColor: COLORS.ink }, languageLabel: { color: COLORS.muted, fontSize: 11, fontWeight: '700' }, languageLabelSelected: { color: COLORS.white },
    scrollContent: { paddingBottom: 12 }, eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.8, color: COLORS.muted, lineHeight: 16 }, lightEyebrow: { color: '#C4D7C9' },
    map: { flex: 1 }, noMap: { padding: 28, paddingTop: 80, flex: 1, justifyContent: 'center' }, mapPin: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.white, borderWidth: 2.5, borderColor: COLORS.ink, alignItems: 'center', justifyContent: 'center' }, selectedMapPin: { backgroundColor: COLORS.ink, borderColor: COLORS.paper, width: 38, height: 38, borderRadius: 19 }, mapPinText: { color: COLORS.ink, fontSize: 13, fontWeight: '800' }, selectedMapPinText: { color: COLORS.mint }, mapFailure: { marginHorizontal: 24, marginTop: 12, color: COLORS.error, fontSize: 12, lineHeight: 18 }, attribution: { color: COLORS.muted, fontSize: 9, lineHeight: 14, marginHorizontal: 24, marginTop: 8 },
    section: { padding: 24, gap: 18 }, metrics: { flexDirection: 'row', paddingVertical: 12, marginBottom: 4 }, metric: { flex: 1, alignItems: 'center', paddingHorizontal: 4 }, metricDivider: { borderLeftWidth: 1, borderLeftColor: COLORS.line }, metricValue: { color: COLORS.ink, fontSize: 27, fontWeight: '600', letterSpacing: -1 }, metricUnit: { fontSize: 12, fontWeight: '500', letterSpacing: 0 }, metricLabel: { fontSize: 10, color: COLORS.muted, marginTop: 6, textAlign: 'center', lineHeight: 14 }, body: { fontSize: 15, lineHeight: 24, color: COLORS.muted }, meta: { fontSize: 12, lineHeight: 19, color: COLORS.muted },
    button: { minHeight: 52, paddingVertical: 14, paddingHorizontal: 18, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.ink }, compactButton: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 11 }, secondaryButton: { backgroundColor: COLORS.pale, borderWidth: 1, borderColor: COLORS.line }, quietButton: { backgroundColor: 'transparent' }, dangerButton: { backgroundColor: '#F4E9E2', borderColor: '#EBD1C5', borderWidth: 1 }, buttonLabel: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: COLORS.paper, textAlign: 'center' }, darkButtonLabel: { color: COLORS.ink }, dangerLabel: { color: COLORS.error }, disabled: { opacity: 0.42 }, pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
    budget: { padding: 18, backgroundColor: COLORS.pale, borderRadius: 16, gap: 10 }, budgetRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 }, budgetValue: { fontSize: 12, fontWeight: '700', color: COLORS.ink }, endpointCard: { padding: 20, borderWidth: 1, borderColor: COLORS.line, borderRadius: 18, backgroundColor: COLORS.white }, endpointRow: { flexDirection: 'row', alignItems: 'center', gap: 16 }, endpointDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: COLORS.ink }, endpointFinish: { width: 12, height: 12, borderWidth: 2, borderColor: COLORS.ink, borderRadius: 3 }, endpointConnector: { height: 26, borderLeftWidth: 1, borderLeftColor: '#9DB2A3', marginLeft: 5, marginVertical: 6 }, endpointTitle: { fontSize: 14, lineHeight: 22, color: COLORS.ink, marginTop: 3, fontWeight: '600' },
    sectionTitle: { fontFamily: 'serif', fontSize: 28, lineHeight: 34, color: COLORS.ink, marginTop: 8 }, itineraryItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 16, borderTopWidth: 1, borderTopColor: COLORS.line, paddingTop: 20, paddingBottom: 2 }, stopNumber: { width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.pale, alignItems: 'center', justifyContent: 'center' }, stopNumberLabel: { color: COLORS.ink, fontFamily: 'serif', fontSize: 19 }, stopKicker: { color: COLORS.muted, fontSize: 9, lineHeight: 15, fontWeight: '800', letterSpacing: 1.3, textTransform: 'uppercase', marginBottom: 4 }, cardTitle: { color: COLORS.ink, fontSize: 19, lineHeight: 26, fontWeight: '600', marginBottom: 7 }, flex: { flex: 1 },
    fieldNote: { backgroundColor: '#EFEBDD', borderRadius: 16, padding: 18, gap: 8 }, noteBody: { color: COLORS.muted, fontSize: 13, lineHeight: 21 }, consent: { flexDirection: 'row', gap: 13, minHeight: 44, alignItems: 'flex-start', paddingVertical: 8 }, checkbox: { marginTop: 2, width: 24, height: 24, borderWidth: 1.5, borderColor: '#7F9987', borderRadius: 7, alignItems: 'center', justifyContent: 'center' }, checkboxSelected: { backgroundColor: COLORS.ink, borderColor: COLORS.ink }, checkmark: { color: COLORS.white, fontSize: 15, fontWeight: '700' }, consentText: { flex: 1, color: COLORS.muted, fontSize: 12, lineHeight: 19 },
    activeHeading: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 20, gap: 10 }, activeTitle: { fontFamily: 'serif', color: COLORS.ink, fontSize: 29, lineHeight: 35 }, progressPanel: { paddingHorizontal: 24, paddingBottom: 20 }, progressHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }, progressCount: { fontSize: 12, fontWeight: '700', color: COLORS.ink }, progressTrack: { flexDirection: 'row', gap: 6 }, progressSegment: { flex: 1, height: 5, borderRadius: 3, backgroundColor: COLORS.line }, progressSegmentDone: { backgroundColor: '#4D795B' }, progressSegmentSkipped: { backgroundColor: '#B8B3A4' }, chapterTabs: { paddingTop: 18, gap: 8 }, chapterTab: { borderWidth: 1, borderColor: COLORS.line, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 13, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: 230 }, chapterTabSelected: { backgroundColor: COLORS.ink, borderColor: COLORS.ink }, chapterTabNumber: { fontSize: 12, fontWeight: '700', color: COLORS.muted }, chapterTabNumberSelected: { color: COLORS.mint }, chapterTabTitle: { fontSize: 12, color: COLORS.muted, flexShrink: 1 }, chapterTabTitleSelected: { color: COLORS.paper }, pauseCard: { margin: 16, marginTop: 0, backgroundColor: COLORS.mint, padding: 20, borderRadius: 18, gap: 14 },
    chapterHeader: { gap: 12, marginTop: 10 }, storyTitle: { fontFamily: 'serif', color: COLORS.ink, fontSize: 35, lineHeight: 41, letterSpacing: -0.6 }, storyPlace: { color: COLORS.muted, fontSize: 13, lineHeight: 19 }, storyBody: { fontFamily: 'serif', color: '#2C4D43', fontSize: 19, lineHeight: 31 }, audioNote: { fontSize: 11, lineHeight: 18, color: COLORS.muted }, observation: { borderLeftWidth: 3, borderLeftColor: '#719475', paddingLeft: 18, paddingVertical: 6, gap: 10 }, observationText: { color: COLORS.ink, fontSize: 16, lineHeight: 25, fontWeight: '500' },
    questCard: { backgroundColor: COLORS.white, padding: 20, borderRadius: 22, borderWidth: 1, borderColor: COLORS.line, gap: 14, marginTop: 4 }, questHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 }, questStar: { fontSize: 23, color: '#719475' }, questQuestion: { fontFamily: 'serif', fontSize: 24, lineHeight: 31, color: COLORS.ink, marginBottom: 4 }, choice: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: COLORS.line, padding: 12, borderRadius: 14 }, choiceSelected: { borderColor: '#799B7E', backgroundColor: '#F0F5EB' }, choiceCorrect: { borderColor: '#507E59', backgroundColor: '#E9F3E4' }, choiceLetter: { width: 29, height: 29, borderRadius: 15, backgroundColor: COLORS.pale, alignItems: 'center', justifyContent: 'center' }, choiceLetterSelected: { backgroundColor: COLORS.ink }, choiceLetterText: { fontSize: 11, fontWeight: '700', color: COLORS.muted }, choiceLetterSelectedText: { color: COLORS.white }, choiceText: { fontSize: 14, lineHeight: 22, color: COLORS.ink, flex: 1 }, feedback: { padding: 14, borderRadius: 12, backgroundColor: '#F4EDE1' }, correctFeedback: { backgroundColor: '#DFEEDA' }, feedbackText: { fontSize: 13, lineHeight: 22, color: COLORS.ink }, hintText: { fontSize: 13, lineHeight: 22, color: COLORS.muted, paddingHorizontal: 6, paddingBottom: 6 },
    markCard: { gap: 12, paddingTop: 8 }, chapterNavigation: { flexDirection: 'row', gap: 10 }, sources: { backgroundColor: COLORS.pale, borderRadius: 16, padding: 8 }, sourceLink: { minHeight: 48, padding: 12, gap: 5 }, sourceLabel: { fontSize: 13, lineHeight: 21, fontWeight: '600', color: COLORS.ink, textDecorationLine: 'underline' },
    trackingCard: { padding: 16, borderRadius: 16, backgroundColor: COLORS.pale, gap: 12 },
    returnCard: { gap: 18, paddingVertical: 8 }, livePositionRing: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#C7DFEF', borderColor: COLORS.white, borderWidth: 2, alignItems: 'center', justifyContent: 'center' }, livePositionDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#2874A6', borderWidth: 2, borderColor: COLORS.white },
    closingCard: { borderBottomWidth: 1, borderBottomColor: COLORS.line, gap: 16, paddingBottom: 24, marginBottom: 2 },
    savedDiscoveryCard: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 18, marginTop: 16, borderRadius: 20, borderWidth: 1, borderColor: '#C5D3AF', backgroundColor: '#EDF2E3' },
    persistentActions: { position: 'absolute', left: 0, right: 0, height: 64, zIndex: 25, flexDirection: 'row', gap: 10, paddingTop: 10, paddingBottom: 10, paddingHorizontal: 20, borderTopWidth: 1, borderTopColor: COLORS.line, backgroundColor: COLORS.paper },
    journalHero: { backgroundColor: COLORS.ink, margin: 16, padding: 28, borderRadius: 24, alignItems: 'center', gap: 18 }, discoveryMark: { width: 84, height: 84, borderRadius: 42, borderColor: '#70917B', borderWidth: 1, marginTop: 8, justifyContent: 'center', alignItems: 'center', backgroundColor: '#214B40' }, discoveryMarkText: { fontSize: 50, color: '#DFEBC4' }, journalTitle: { fontFamily: 'serif', fontSize: 34, lineHeight: 40, color: COLORS.paper, textAlign: 'center' }, journalBody: { fontSize: 14, lineHeight: 23, color: '#CADBCC', textAlign: 'center' }, journalCount: { alignItems: 'center', paddingTop: 10 }, journalCountValue: { color: COLORS.paper, fontSize: 38, fontFamily: 'serif' }, journalCountTotal: { color: '#91AE98', fontSize: 24 }, journalCountLabel: { color: '#C4D7C9', fontSize: 11, marginTop: 4 }, collectionCard: { paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: COLORS.line, flexDirection: 'row', gap: 16, alignItems: 'flex-start' }, collectionSeal: { width: 48, height: 48, backgroundColor: '#E4ECCE', borderRadius: 24, borderWidth: 1, borderColor: '#C5D3AF', justifyContent: 'center', alignItems: 'center' }, collectionSealText: { color: '#466646', fontFamily: 'serif', fontSize: 22 }, collectionQuest: { color: '#52745A', fontSize: 11, marginTop: 6 }, privacy: { color: COLORS.muted, fontSize: 12, lineHeight: 20, textAlign: 'center', paddingVertical: 8 },
    footer: { borderTopWidth: 1, borderTopColor: COLORS.line, paddingVertical: 22, paddingHorizontal: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, footerBrand: { fontSize: 24, fontWeight: '800', color: '#829484', letterSpacing: -1.3 }, bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 25, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingTop: 8, borderTopWidth: 1, borderTopColor: COLORS.line, backgroundColor: COLORS.paper }, bottomTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, minHeight: 48 }, bottomIcon: { fontSize: 26, lineHeight: 30, color: '#8A9B8A' }, bottomLabel: { fontSize: 12, color: COLORS.muted, fontWeight: '600' }, bottomSelected: { color: COLORS.ink }, bottomDivider: { height: 24, width: 1, backgroundColor: COLORS.line }, tabBadge: { minWidth: 19, height: 19, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.ink }, tabBadgeText: { color: COLORS.paper, fontSize: 9, fontWeight: '700' },
    errorBox: { margin: 16, backgroundColor: '#F4E5DF', padding: 16, borderRadius: 14, borderWidth: 1, borderColor: '#E6C9BE' }, errorText: { color: COLORS.error, fontSize: 13, lineHeight: 21 }, saving: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 24, paddingVertical: 12 }
});
