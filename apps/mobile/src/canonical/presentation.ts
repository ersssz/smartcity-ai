import type { Locale, WalkBundleV1, PackVerification } from '@astanaai/contracts';
import type { UiWalk, UiWalkSession } from '../features/walk/WalkExperience';

export type CanonicalEnding = { kind: WalkBundleV1['request']['endRule']['kind']; label: string; title: string; body: string; confirmLabel: string; tabLabel: string };
export type CanonicalUiWalk = UiWalk & {
  ending: CanonicalEnding; startCoordinate: [number, number]; endCoordinate: [number, number]; originNote: string;
  cues: Record<keyof WalkBundleV1['content']['cues'], string>;
  collections: { id: string; title: string; description: string; proof: string }[];
};
/** Projection only. The repository owns validation, transitions, awards and immutable identity. */
export type CanonicalPresentationSession = {
  phase: 'prepared' | 'active' | 'paused' | 'completed' | 'abandoned';
  currentStopIndex: number; manualStopIds: string[]; completedStopIds: string[]; skippedStopIds: string[];
  answers: Record<string, { choiceId: string; correct: boolean }>;
  bundleHash: string; bundleRevision: number;
};
const COPY = {
  ru: { fact: 'Факт', fiction: 'Художественная рамка', idea: 'Приглядитесь', outdoor: 'Наружная точка осмотра', indoor: 'Посещение внутри',
    start: 'Выбранный старт', end: 'Выбранный финиш', replay: 'Реальные данные · сохранённый маршрут', fixture: 'Тестовый пример · не полевая прогулка', live: 'Прогулка по данным каталога',
    field: 'Полевое прохождение этого пакета не подтверждено.', translation: 'Языковая редактура ещё не завершена.',
    anchor: 'Старт — выбранная общественная точка. Подход от вашего текущего положения до неё не включён во время прогулки.', point: 'Прогулка начинается у выбранной точки. Её подходы и окончание входят в сохранённый расчёт.',
    returned: 'Возврат к старту', returnTitle: 'Возвращаемся к началу', returnBody: 'Главы закончились. Пройдите оставшийся участок по сохранённому маршруту и подтвердите окончание у старта.', returnConfirm: 'Я у старта · завершить', returnTab: 'Возвращение',
    last: 'Финиш у последней остановки', lastTitle: 'Последняя остановка — ваш финал', lastBody: 'Этот маршрут заканчивается у последней остановки. Возвращение к старту в него не входит.', lastConfirm: 'Завершить у последней остановки', lastTab: 'Финал',
    pointTitle: 'До выбранного финиша', pointBody: 'Пройдите оставшийся участок до выбранного финиша по сохранённому маршруту. Подтвердите окончание, когда будете на месте.', pointConfirm: 'Я у финиша · завершить',
    abandoned: 'Прогулка завершена досрочно. Подтверждённые шаги сохранены; полное прохождение не присуждается.',
    audio: 'Озвучка', mapMissing: 'Карта без сети пока не готова', mapPresent: 'Карта указана в пакете', partial: 'Пакет готов частично', ready: 'Пакет проверен для работы без сети', unverified: 'Файлы ещё не проверены', invalid: 'Материалы не прошли проверку',
    partialBody: 'Сохранённые маршрут и тексты доступны. Полная работа без сети потребует проверки карты и всех аудиофайлов.', referenceBody: 'Количество озвучек показано по составу пакета. Наличие файлов проверяется отдельно на устройстве.',
  },
  kk: { fact: 'Дерек', fiction: 'Көркем ой', idea: 'Назар аударыңыз', outdoor: 'Сырттан қарау нүктесі', indoor: 'Ғимаратқа кіру',
    start: 'Таңдалған бастау', end: 'Таңдалған аяқтау', replay: 'Нақты деректер · сақталған маршрут', fixture: 'Сынақ үлгісі · далалық серуен емес', live: 'Каталог деректерімен серуен',
    field: 'Бұл пакеттің жолы жерде тексерілмеген.', translation: 'Тілдік редактура әлі аяқталған жоқ.',
    anchor: 'Бастау — таңдалған қоғамдық нүкте. Қазіргі орныңыздан оған дейінгі жол серуен уақытына кірмейді.', point: 'Серуен таңдалған нүктеден басталады. Оған жалғасатын жолдар мен аяқтау сақталған есепке кіреді.',
    returned: 'Бастауға оралу', returnTitle: 'Басталған жерге ораламыз', returnBody: 'Тараулар аяқталды. Сақталған маршрутпен қалған жолды өтіп, бастау нүктесінде аяқтауды растаңыз.', returnConfirm: 'Бастауға жеттім · аяқтау', returnTab: 'Оралу',
    last: 'Соңғы аялдамада аяқтау', lastTitle: 'Соңғы аялдама — мәреңіз', lastBody: 'Маршрут соңғы аялдамада аяқталады. Бастауға қайту оған кірмейді.', lastConfirm: 'Соңғы аялдамада аяқтау', lastTab: 'Аяқтау',
    pointTitle: 'Таңдалған мәреге дейін', pointBody: 'Сақталған маршрутпен таңдалған мәреге дейінгі жолды өтіңіз. Жеткенде аяқтауды растаңыз.', pointConfirm: 'Мәреге жеттім · аяқтау',
    abandoned: 'Серуен мерзімінен бұрын аяқталды. Расталған қадамдар сақталды; толық өту берілмейді.',
    audio: 'Дыбыстау', mapMissing: 'Желісіз карта әлі дайын емес', mapPresent: 'Карта пакетте көрсетілген', partial: 'Пакет ішінара дайын', ready: 'Пакет желісіз жұмысқа тексерілді', unverified: 'Файлдар әлі тексерілмеді', invalid: 'Материалдар тексеруден өтпеді',
    partialBody: 'Сақталған маршрут пен мәтіндер қолжетімді. Толық желісіз жұмыс үшін карта мен барлық аудиофайл тексерілуі керек.', referenceBody: 'Дыбыстау саны пакет құрамынан алынған. Файлдардың болуы құрылғыда бөлек тексеріледі.',
  },
  en: { fact: 'Fact', fiction: 'Fictional framing', idea: 'Look a little closer', outdoor: 'Outdoor observation point', indoor: 'Indoor visit',
    start: 'Chosen start', end: 'Chosen finish', replay: 'Real source data · saved route', fixture: 'Test fixture · not a field walk', live: 'Walk based on catalog evidence',
    field: 'Field passage of this package has not been verified.', translation: 'Human language review is still pending.',
    anchor: 'The start is an explicitly chosen public point. The approach from your current location is not included in the walking time.', point: 'This walk starts at the chosen point. Its connectors and finish are part of the saved calculation.',
    returned: 'Return to the start', returnTitle: 'Back to where we began', returnBody: 'The chapters are finished. Follow the remaining saved route and confirm completion at the start.', returnConfirm: 'At the start · finish', returnTab: 'Return',
    last: 'Finish at the last stop', lastTitle: 'Your last stop is the finish', lastBody: 'This walk finishes at the last stop. A journey back to the start is not included.', lastConfirm: 'Finish at the last stop', lastTab: 'Finish',
    pointTitle: 'On to your chosen finish', pointBody: 'Follow the saved route to the chosen finish. Confirm completion when you arrive there.', pointConfirm: 'At the finish · complete',
    abandoned: 'This walk ended early. Confirmed steps are saved; full completion is not awarded.',
    audio: 'Narration', mapMissing: 'Offline map is not ready yet', mapPresent: 'Map listed in the package', partial: 'Package partly ready', ready: 'Package verified for offline use', unverified: 'Files have not been verified yet', invalid: 'Materials failed verification',
    partialBody: 'Saved route and text remain available. Full offline use needs the map and every audio file verified.', referenceBody: 'Narration counts describe package references. File presence is checked separately on the device.',
  },
} as const;
function required<T>(value: T | undefined): T { if (value === undefined) throw new Error('CANONICAL_CONTENT_UNAVAILABLE'); return value; }
const point = (coordinate: readonly [number, number]): [number, number] => [coordinate[0], coordinate[1]];
const same = (a: readonly number[], b: readonly number[]) => a[0] === b[0] && a[1] === b[1];

export function toCanonicalUiWalk(bundle: WalkBundleV1, locale: Locale): CanonicalUiWalk {
  const t = COPY[locale];
  const labelFor = (endpoint: WalkBundleV1['resolvedEnd']['endpoint'], fallback: string) => {
    const requested = endpoint.requested;
    return requested.kind === 'public_anchor' ? bundle.stops.find(s => s.anchor.id === requested.anchorId)?.title[locale] ?? fallback : fallback;
  };
  const startLabel = labelFor(bundle.continuation.origin, t.start), endLabel = labelFor(bundle.resolvedEnd.endpoint, t.end);
  const kind = bundle.request.endRule.kind;
  const ending: CanonicalEnding = kind === 'return_to_start'
    ? { kind, label: t.returned, title: t.returnTitle, body: t.returnBody, confirmLabel: t.returnConfirm, tabLabel: t.returnTab }
    : kind === 'last_stop' ? { kind, label: t.last, title: t.lastTitle, body: t.lastBody, confirmLabel: t.lastConfirm, tabLabel: t.lastTab }
      : { kind, label: `${t.end}: ${endLabel}`, title: t.pointTitle, body: t.pointBody, confirmLabel: t.pointConfirm, tabLabel: t.lastTab };
  const route: [number, number][] = [];
  for (const leg of bundle.legs) {
    if (leg.kind !== 'walk') continue;
    if (route.length && !same(required(route.at(-1)), required(leg.geometry.coordinates[0]))) throw new Error('CANONICAL_CONTENT_UNAVAILABLE');
    for (const coordinate of leg.geometry.coordinates) if (!route.length || !same(required(route.at(-1)), coordinate)) route.push(point(coordinate));
  }
  if (!route.length) route.push(point(bundle.continuation.origin.coordinate));
  const collections = bundle.content.collections.map(c => ({ id: c.id, title: c.title[locale], description: c.description[locale], proof: c.proof }));
  const cue = (name: keyof WalkBundleV1['content']['cues']) => bundle.content.cues[name].text[locale];
  const cues = { start: cue('start'), nearby: cue('nearby'), pause: cue('pause'), resume: cue('resume'), complete: cue('complete'), abandon: cue('abandon') };
  return {
    id: `${bundle.bundleId}@${bundle.revision}`, title: bundle.theme.title[locale], subtitle: ending.label, description: bundle.theme.explanation.text[locale],
    eyebrow: bundle.evidenceMode === 'real_catalog_replay' ? t.replay : bundle.evidenceMode === 'test_fixture' ? t.fixture : t.live,
    minutes: Math.ceil(bundle.timing.totalMinutes), distanceMeters: bundle.timing.distanceMeters, walkMinutes: Math.ceil(bundle.timing.walkMinutes), visitMinutes: bundle.timing.visitMinutes, reserveMinutes: bundle.timing.reserveMinutes,
    startLabel, endLabel, startCoordinate: point(bundle.continuation.origin.coordinate), endCoordinate: point(bundle.resolvedEnd.endpoint.coordinate), ending,
    originNote: bundle.continuation.origin.requested.kind === 'public_anchor' ? t.anchor : t.point, materialsNote: canonicalMaterials(bundle, locale).label, route,
    stops: bundle.stops.map(stop => {
      const chapter = required(bundle.content.chapters.find(c => c.id === stop.chapterId));
      const quest = required(bundle.content.quests.find(q => q.id === stop.questId));
      const factIds = [...new Set([...stop.factRefs, ...chapter.blocks.flatMap(b => b.kind === 'fact' ? b.factRefs : []), ...quest.factRefs])];
      const facts = factIds.map(id => required(bundle.facts.find(f => f.id === id)));
      const sourceIds = [...new Set([...stop.anchor.sourceIds, ...facts.flatMap(f => f.sourceIds)])];
      return { id: stop.id, title: stop.title[locale], kicker: stop.intent === 'indoor_visit' ? t.indoor : t.outdoor, coordinate: point(stop.anchor.coordinate), minutes: stop.visitMinutes,
        storyTitle: chapter.title[locale], story: chapter.blocks.map(b => `${b.kind === 'fact' ? t.fact : b.kind === 'fiction' ? t.fiction : t.idea}\n${b.text[locale]}`).join('\n\n'),
        observation: chapter.blocks.filter(b => b.kind === 'idea').at(-1)?.text[locale] ?? '', facts: facts.map(f => ({ id: f.id, text: f.statement[locale] })),
        quest: { question: quest.question[locale], choices: quest.choices.map(c => ({ id: c.id, label: c.label[locale] })), hint: quest.hint[locale], explanation: quest.explanation[locale] },
        sources: sourceIds.map(id => { const source = required(bundle.sources.find(s => s.id === id)); return { label: source.title, url: source.url, checkedAt: source.checkedAt }; }),
      };
    }),
    attribution: [...new Set(bundle.legs.flatMap(leg => leg.kind === 'walk' ? [leg.source.attribution] : []))].join(' · '),
    fieldNote: [...(bundle.stops.some(s => !s.anchor.fieldVerified) || bundle.legs.some(l => l.kind === 'walk' && !l.source.fieldVerified) ? [t.field] : []), ...(bundle.content.translationReview === 'pending' ? [t.translation] : []), ...bundle.limitations.map(l => l[locale])].join('\n\n'),
    closing: cues.complete, collectionTitle: collections.map(c => c.title).join(' · '), collectionDescription: collections.map(c => c.description).join('\n\n'), collections, cues,
  };
}

export function toCanonicalUiSession(bundle: WalkBundleV1, session: CanonicalPresentationSession, locale: Locale): UiWalkSession & { abandoned: boolean; statusMessage?: string } {
  if (session.bundleHash !== bundle.sha256 || session.bundleRevision !== bundle.revision) throw new Error('CANONICAL_CONTENT_UNAVAILABLE');
  return { phase: session.phase === 'prepared' ? 'ready' : session.phase === 'abandoned' ? 'completed' : session.phase,
    abandoned: session.phase === 'abandoned', statusMessage: session.phase === 'abandoned' ? COPY[locale].abandoned : undefined,
    currentStopIndex: session.currentStopIndex, manualStopIds: [...session.manualStopIds], completedStopIds: [...session.completedStopIds], skippedStopIds: [...session.skippedStopIds],
    answers: Object.fromEntries(Object.entries(session.answers).map(([stopId, answer]) => {
      const stop = required(bundle.stops.find(s => s.id === stopId)), quest = required(bundle.content.quests.find(q => q.id === stop.questId));
      return [stopId, { ...answer, feedback: answer.correct ? quest.explanation[locale] : quest.hint[locale] }];
    })),
  };
}

export function canonicalMaterials(bundle: WalkBundleV1, locale: Locale, verification?: PackVerification) {
  const t = COPY[locale];
  const sets = [...bundle.content.chapters.map(c => c.audio), ...bundle.content.quests.flatMap(q => [q.audio.question, q.audio.hint, q.audio.explanation]), ...Object.values(bundle.content.cues).map(c => c.audio)];
  const references = sets.flatMap(set => [set.ru, set.kk, set.en]);
  const audioAvailable = references.filter(ref => ref.state === 'available').length, audioTotal = references.length;
  const mapAvailable = bundle.assets.map.state === 'available';
  const matches = verification && verification.state !== 'invalid_bundle' && verification.identity.bundleHash === bundle.sha256 && verification.identity.revision === bundle.revision;
  const state = verification?.state === 'invalid_bundle' ? 'invalid' : !mapAvailable || audioAvailable !== audioTotal ? 'partial' : matches ? verification.state : 'unverified';
  return { state, audioAvailable, audioTotal, mapAvailable, canChoose: state !== 'invalid',
    label: `${t.audio} ${audioAvailable}/${audioTotal} · ${mapAvailable ? t.mapPresent : t.mapMissing}`,
    title: state === 'ready' ? t.ready : state === 'partial' ? t.partial : state === 'invalid' ? t.invalid : t.unverified,
    detail: state === 'ready' ? t.ready : `${t.partialBody}\n${t.referenceBody}` };
}
