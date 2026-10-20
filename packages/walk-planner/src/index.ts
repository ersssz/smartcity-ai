import { PlanRequestSchema, EvidenceSetSchema, EndpointSchema, ConstraintSchema, InstantSchema, IdSchema, canonicalJson, readBundle, validateRevisionAgainstParent, initialReserveMinutes, sealBundle, type CityEvidence, type Coordinate, type Endpoint, type LocalizedText, type PlanReply, type PlanRequest, type ResolvedEndpoint, type RevisionRequest, type RevisionReply, type Sha256, type WalkBundlePayload, type WalkPlanner } from '../../contracts/src/index.js';
import { createCityEvidence } from '../../city-evidence/src/index.js';
import catalog from './catalog.generated.js';

const locales = ['ru', 'kk', 'en'] as const;
const text = (ru: string, kk: string, en: string): LocalizedText => ({ ru, kk, en });
const unknown = (reason: string) => ({ state: 'unknown' as const, reason, sourceIds: [] as string[] });
const missingAudio = () => ({ ru: { state: 'missing' as const, reason: 'Canonical narration has not been prepared' }, kk: { state: 'missing' as const, reason: 'Canonical narration has not been prepared' }, en: { state: 'missing' as const, reason: 'Canonical narration has not been prepared' } });
const same = (a: Coordinate, b: Coordinate) => a[0] === b[0] && a[1] === b[1];
const instant = (start: string, minutes: number) => new Date(Date.parse(start) + Math.round(minutes * 60_000)).toISOString();
const refusal = (code: 'UNKNOWN_ACCESS' | 'UNKNOWN_HOURS' | 'INSUFFICIENT_TIME' | 'NO_SUPPORTED_CONTENT', message: LocalizedText): PlanReply => ({ kind: 'no_feasible_walk', reasons: [{ code, message }] });

export function createReplayPlanner(options: { hash: Sha256; id: () => string; now?: () => string; evidence?: CityEvidence }): WalkPlanner {
  const evidence = options.evidence ?? createCityEvidence();
  const now = options.now ?? (() => new Date().toISOString());
  const prepared = catalog.prepared;
  function approvedTheme(): WalkBundlePayload['theme'] {
    return { id: prepared.id, title: prepared.title, explanation: { text: prepared.description, factRefs: prepared.facts.map(f => f.id) } };
  }
  function approvedContent(stopIds: readonly string[]): WalkBundlePayload['content'] | undefined {
    const selected = prepared.stops.filter(s => stopIds.includes(s.id));
    if (canonicalJson(selected.map(s => s.id)) !== canonicalJson(stopIds)) return undefined;
    const chapters: WalkBundlePayload['content']['chapters'] = selected.map(s => {
      const paragraphs = Object.fromEntries(locales.map(locale => [locale, s.story[locale].split('\n\n')])) as Record<typeof locales[number], string[]>;
      const blockText = (i: number): LocalizedText => ({ ru: paragraphs.ru[i]!, kk: paragraphs.kk[i]!, en: paragraphs.en[i]! });
      return { id: `chapter:${s.id}`, stopId: s.id, title: s.storyTitle, blocks: [
        { kind: 'idea', text: blockText(0) }, { kind: 'fact', text: blockText(1), factRefs: s.factRefs }, { kind: 'fiction', text: blockText(2) }, { kind: 'idea', text: blockText(3) }, { kind: 'idea', text: s.observation },
      ], audio: missingAudio() };
    });
    const cues = Object.fromEntries(Object.entries({
      start: text('Начинаем прогулку.', 'Серуенді бастаймыз.', 'Starting the walk.'), nearby: text('Вы рядом с остановкой.', 'Сіз аялдаманың жанындасыз.', 'You are near the stop.'),
      pause: text('Прогулка приостановлена.', 'Серуен уақытша тоқтатылды.', 'Walk paused.'), resume: text('Продолжаем прогулку.', 'Серуенді жалғастырамыз.', 'Resuming the walk.'), complete: prepared.closing ?? prepared.description,
      abandon: text('Прогулка завершена досрочно.', 'Серуен мерзімінен бұрын аяқталды.', 'Walk ended early.'),
    }).map(([id, value]) => [id, { text: value, audio: missingAudio() }])) as WalkBundlePayload['content']['cues'];
    return { origin: 'editorial', translationReview: 'pending', chapters,
      quests: selected.map(s => ({ ...s.quest, stopId: s.id, proof: 'answer' as const, audio: { question: missingAudio(), hint: missingAudio(), explanation: missingAudio() } })),
      collections: selected.length ? [{ id: 'three-forms', title: prepared.collectionTitle, description: prepared.collectionDescription ?? prepared.description, proof: 'manual' }] : [], cues };
  }
  function resolve(requested: Endpoint): ResolvedEndpoint | undefined {
    const match = prepared.stops.find(s => requested.kind === 'public_anchor' ? requested.anchorId === s.id : same(requested.coordinate, s.coordinate as Coordinate));
    if (!match) return undefined;
    return { requested, coordinate: match.coordinate as Coordinate, graphPoint: { id: match.osmNodeId, coordinate: match.coordinate as Coordinate }, snapDistanceM: 0, connector: { kind: 'exact' } };
  }
  function publicEndpoint(id: string): ResolvedEndpoint { return resolve({ kind: 'public_anchor', anchorId: id, explicitlyChosen: true })!; }
  function leg(from: ResolvedEndpoint, to: ResolvedEndpoint, fromId: string, toId: string): WalkBundlePayload['legs'][number] {
    const shared = { id: `leg:${fromId}:${toId}`, fromId, toId, from, to };
    if (same(from.coordinate, to.coordinate)) return { ...shared, kind: 'already_at_endpoint', distanceMeters: 0, walkMinutes: 0 };
    const path = catalog.paths.find(p => p.node_ids[0] === Number(from.graphPoint.id) && p.node_ids.at(-1) === Number(to.graphPoint.id));
    if (!path) throw new Error('RETAINED_ROUTE_UNAVAILABLE');
    return { ...shared, kind: 'walk', distanceMeters: path.distance_m, walkMinutes: path.distance_m / 60,
      geometry: { type: 'LineString', coordinates: path.geometry.coordinates as Coordinate[] }, stepFree: unknown('Retained graph is not a verified step-free route'),
      source: { sourceIds: ['osm-first-walk-source'], datasetRevision: catalog.provenance.snapshotSha256, graphSha256: catalog.pins['evidence/first-walk/routing-source.json'], checkedAt: catalog.provenance.fetchedAt, license: 'ODbL-1.0', attribution: catalog.provenance.attribution, fieldVerified: false } };
  }
  async function plan(input: PlanRequest): Promise<PlanReply> {
    const parsed = PlanRequestSchema.safeParse(input);
    if (!parsed.success) return { kind: 'clarification', fields: ['request'], message: text('Уточните время, начало и условия прогулки.', 'Уақытты, басталу нүктесін және шарттарды нақтылаңыз.', 'Clarify the time, start and walking requirements.') };
    const request = parsed.data, generatedAt = now();
    if (!Number.isFinite(Date.parse(generatedAt))) return { kind: 'unavailable', code: 'DATA_UNAVAILABLE' };
    const endpoints = [request.origin, ...(request.endRule.kind === 'point' ? [request.endRule.endpoint] : [])];
    if (endpoints.some(e => e.kind === 'point' && e.source === 'gps' && (e.accuracyM > 30 || Date.parse(generatedAt) - Date.parse(e.capturedAt) > 15_000 || Date.parse(e.capturedAt) > Date.parse(generatedAt)))) return { kind: 'clarification', fields: ['endpoint_accuracy'], message: text('Нужна свежая и точная позиция или явный выбор точки.', 'Жаңа әрі дәл орын немесе нүктені бөлек таңдау қажет.', 'A fresh, accurate position or an explicitly selected point is needed.') };
    if (Date.parse(request.startAt) < Date.parse(generatedAt) - 25_000) return { kind: 'clarification', fields: ['startAt'], message: text('Время начала уже прошло. Выберите новый старт.', 'Басталу уақыты өтіп кетті. Жаңа уақытты таңдаңыз.', 'The start time has passed. Choose a new start time.') };
    const origin = resolve(request.origin);
    const end = request.endRule.kind === 'point' ? resolve(request.endRule.endpoint) : request.endRule.kind === 'return_to_start' ? origin : publicEndpoint(prepared.stops.at(-1)!.id);
    if (!origin || !end) return { kind: 'clarification', fields: ['choose_supported_start_or_end'], message: text('Подход от выбранной точки не подтверждён. Можно явно выбрать одну из подготовленных наружных точек.', 'Таңдалған нүктеден жол расталмаған. Дайын сыртқы нүктені бөлек таңдауға болады.', 'The approach from the selected point is unconfirmed. You may explicitly choose a prepared outdoor anchor.') };
    if (request.constraints.some(c => c.kind === 'indoor_required' || c.kind === 'coffee_required')) return refusal('UNKNOWN_HOURS', text('Нет подтверждённых часов и доступа для обязательной остановки внутри или кофе.', 'Ішке кіру немесе кофе үшін міндетті аялдаманың уақыты мен қолжетімділігі расталмаған.', 'Current hours and access for a required indoor or coffee stop are unconfirmed.'));
    if (request.constraints.some(c => c.kind === 'step_free_required')) return refusal('UNKNOWN_ACCESS', text('Безбарьерный подход и весь путь пока не подтверждены.', 'Кедергісіз кіру және бүкіл жол әлі расталмаған.', 'Step-free approaches and the whole route are not verified.'));
    let found;
    try { found = EvidenceSetSchema.parse(await evidence.search({ locale: request.locale, at: request.startAt, area: { kind: 'public_zone', zoneId: 'astana:bayterek-research' }, terms: [], interests: request.interests, required: ['public_anchor'], limit: 24 })); }
    catch { return { kind: 'unavailable', code: 'DATA_UNAVAILABLE' }; }
    if (!prepared.stops.every(s => found.pois.some(p => p.anchorIds.includes(s.id)))) return refusal('NO_SUPPORTED_CONTENT', text('Для этих интересов недостаточно подтверждённого содержания целой прогулки.', 'Бұл қызығушылықтарға толық серуеннің расталған мазмұны жеткіліксіз.', 'There is insufficient supported content for a complete walk matching these interests.'));
    if (prepared.facts.some(f => { const current = found.facts.find(c => c.id === f.id); return !current || canonicalJson(current.statement) !== canonicalJson(f.statement) || canonicalJson(current.sourceIds) !== canonicalJson(f.sourceIds); }) || prepared.sources.some(s => !found.sources.some(c => c.id === s.id && c.url === s.url && c.rights === s.rights))) return refusal('NO_SUPPORTED_CONTENT', text('Основания подготовленной истории изменились или отозваны. Нужна редакторская проверка.', 'Дайын хикаяның негізі өзгерді немесе қайтарып алынды. Редактор тексеруі қажет.', 'The prepared story evidence changed or was withdrawn. Editorial review is required.'));
    const stops: WalkBundlePayload['stops'] = [], legs: WalkBundlePayload['legs'] = [];
    let elapsed = 0, previous = origin, previousId = 'origin';
    for (const s of prepared.stops) {
      const place = found.pois.find(p => p.anchorIds.includes(s.id))!, anchor = found.anchors.find(a => a.id === s.id)!;
      const segment = leg(previous, publicEndpoint(s.id), previousId, s.id); legs.push(segment); elapsed += segment.walkMinutes;
      stops.push({ id: s.id, poiId: place.id, title: s.title, anchor, visitMinutes: s.visitMinutes, arrivalAt: instant(request.startAt, elapsed), departureAt: instant(request.startAt, elapsed + s.visitMinutes), intent: 'outdoor_observation', access: place.access, opening: place.opening, services: place.services, factRefs: s.factRefs, chapterId: `chapter:${s.id}`, questId: s.quest.id, collectionId: 'three-forms' });
      elapsed += s.visitMinutes; previous = publicEndpoint(s.id); previousId = s.id;
    }
    if (!same(previous.coordinate, end.coordinate)) legs.push(leg(previous, end, previousId, 'end'));
    const walkMinutes = legs.reduce((n, l) => n + l.walkMinutes, 0), visitMinutes = stops.reduce((n, s) => n + s.visitMinutes, 0), reserveMinutes = initialReserveMinutes(request.budgetMinutes);
    const totalMinutes = walkMinutes + visitMinutes + reserveMinutes, distanceMeters = legs.reduce((n, l) => n + l.distanceMeters, 0);
    if (totalMinutes > request.budgetMinutes || request.constraints.some(c => c.kind === 'max_distance_m' && distanceMeters > c.value)) return refusal('INSUFFICIENT_TIME', text('Полная подготовленная цепочка не помещается в выбранные время или расстояние.', 'Дайын толық тізбек таңдалған уақытқа немесе қашықтыққа сыймайды.', 'The complete prepared chain does not fit the selected time or walking-distance limit.'));
    const payload: WalkBundlePayload = {
      schemaVersion: 1, kind: 'walk_bundle', bundleId: options.id(), revision: 1, generatedAt, contentRevision: `editorial-r${prepared.revision}-canonical-1`, evidenceRevision: found.revision, plannerVersion: 'source-replay-1', evidenceMode: 'real_catalog_replay', timeZone: 'Asia/Almaty',
      request, originalOrigin: origin, continuation: { origin, startAt: request.startAt, budgetMinutes: request.budgetMinutes, constraints: request.constraints, timeTerms: { kind: 'current_deadline', deadlineAt: instant(request.startAt, request.budgetMinutes) } },
      resolvedEnd: { endpoint: end, ...(request.endRule.kind === 'last_stop' ? { stopId: stops.at(-1)!.id } : {}) }, theme: approvedTheme(), stops, legs,
      timing: { walkMinutes, visitMinutes, reserveMinutes, totalMinutes, distanceMeters, endsAt: instant(request.startAt, totalMinutes) },
      facts: found.facts.filter(f => prepared.facts.some(p => p.id === f.id)), sources: found.sources,
      content: approvedContent(stops.map(s => s.id))!,
      assets: { version: 1, items: [], map: { state: 'missing', reason: 'Offline basemap has not been integrated and verified' } }, context: found.context,
      limitations: [...found.coverage.limitations, text('Это подготовленная редакционная цепочка по сохранённому источнику, без live RAG и полевой приёмки. Доступен один вариант; два дополнительных не выдуманы.', 'Бұл сақталған дерекке негізделген редакциялық тізбек; live RAG және далалық қабылдау жоқ. Бір нұсқа бар, қосымша екеуі ойдан жасалмаған.', 'This is an editorial chain over retained source data, without live RAG or field acceptance. One option is available; two additional options were not fabricated.')],
    };
    try { return { kind: 'candidates', bundles: [await sealBundle(payload, options.hash)], omittedReasons: [{ code: 'NO_SUPPORTED_CONTENT', message: text('Другие цельные редакционные варианты ещё готовятся.', 'Басқа толық редакциялық нұсқалар дайындалып жатыр.', 'Other complete editorial options are still being prepared.') }] }; }
    catch { return { kind: 'unavailable', code: 'DATA_UNAVAILABLE' }; }
  }
  async function revise(input: RevisionRequest): Promise<RevisionReply> {
    const generatedAt = now();
    const clarify = (fields: string[]): RevisionReply => ({ kind: 'clarification', fields, message: text('Уточните текущее состояние и оставшееся время. Прежняя прогулка сохранена.', 'Қазіргі күйді және қалған уақытты нақтылаңыз. Бұрынғы серуен сақталды.', 'Clarify the current state and remaining time. The previous walk is preserved.') });
    if (!input || !IdSchema.safeParse(input.requestId).success || !InstantSchema.safeParse(input.now).success || !EndpointSchema.safeParse(input.from).success || !ConstraintSchema.array().max(4).safeParse(input.constraints).success || !Number.isFinite(input.remainingMinutes) || input.remainingMinutes < 0 || input.remainingMinutes > 240 || !['deviation', 'user_change'].includes(input.reason) || !Array.isArray(input.completedStopIds) || input.completedStopIds.length > 6 || !input.completedStopIds.every(id => IdSchema.safeParse(id).success)) return clarify(['revision_request']);
    if (!InstantSchema.safeParse(generatedAt).success || Math.abs(Date.parse(input.now) - Date.parse(generatedAt)) > 25_000) return clarify(['now']);
    if (input.from.kind === 'point' && input.from.source === 'gps' && (input.from.accuracyM > 30 || Date.parse(generatedAt) - Date.parse(input.from.capturedAt) > 15_000 || Date.parse(input.from.capturedAt) > Date.parse(generatedAt))) return clarify(['endpoint_accuracy']);
    const read = await readBundle(JSON.stringify(input.parentBundle), options.hash);
    if (!read.ok) return clarify(['parent_bundle']);
    const parent = read.bundle;
    if (input.expectedRevision !== parent.revision || input.expectedHash !== parent.sha256) return clarify(['active_revision']);
    if (parent.plannerVersion !== 'source-replay-1' || parent.contentRevision !== `editorial-r${prepared.revision}-canonical-1`) return { kind: 'unavailable', code: 'DATA_UNAVAILABLE' };
    const done = new Set(input.completedStopIds);
    if (done.size !== input.completedStopIds.length || input.completedStopIds.some(id => !parent.stops.some(s => s.id === id))) return clarify(['completedStopIds']);
    const origin = resolve(input.from);
    if (!origin) return clarify(['choose_supported_start_or_end']);
    if (input.constraints.some(c => ['coffee_required', 'indoor_required', 'step_free_required'].includes(c.kind))) return { kind: 'no_feasible_walk', reasons: [{ code: 'UNKNOWN_ACCESS', message: text('Новые обязательные условия не подтверждены данными. Прежний план сохранён.', 'Жаңа міндетті шарттар деректермен расталмаған. Бұрынғы жоспар сақталды.', 'The new mandatory conditions are not supported by verified data. The previous plan is preserved.') }] };
    let found;
    try { found = EvidenceSetSchema.parse(await evidence.search({ locale: parent.request.locale, at: input.now, area: { kind: 'public_zone', zoneId: 'astana:bayterek-research' }, terms: [], interests: parent.request.interests, required: ['public_anchor'], limit: 24 })); }
    catch { return { kind: 'unavailable', code: 'DATA_UNAVAILABLE' }; }
    if (prepared.facts.some(f => { const current = found.facts.find(c => c.id === f.id); return !current || canonicalJson(current.statement) !== canonicalJson(f.statement) || canonicalJson(current.sourceIds) !== canonicalJson(f.sourceIds); }) || prepared.sources.some(s => !found.sources.some(c => c.id === s.id && c.url === s.url && c.rights === s.rights))) return { kind: 'no_feasible_walk', reasons: [{ code: 'NO_SUPPORTED_CONTENT', message: text('Основания истории требуют повторной проверки.', 'Хикаяның негізін қайта тексеру қажет.', 'The story evidence requires review.') }] };
    const copied = JSON.parse(JSON.stringify(parent)) as typeof parent;
    const { sha256: _previousHash, ...payload } = copied;
    payload.revision = parent.revision + 1; payload.parentRevision = parent.revision; payload.parentHash = parent.sha256; payload.generatedAt = generatedAt;
    payload.stops = payload.stops.filter(s => !done.has(s.id));
    const selectedDeadlineAt = instant(input.now, input.remainingMinutes);
    const previousDeadlineAt = new Date(Math.min(Date.parse(parent.continuation.timeTerms.deadlineAt),
      Date.parse(parent.continuation.startAt) + parent.continuation.budgetMinutes * 60_000)).toISOString();
    if (input.proposedDeadlineAt !== undefined && (!InstantSchema.safeParse(input.proposedDeadlineAt).success || Date.parse(input.proposedDeadlineAt) !== Date.parse(selectedDeadlineAt))) return clarify(['remainingMinutes', 'proposedDeadlineAt']);
    let terms: WalkBundlePayload['continuation']['timeTerms'] = { kind: 'current_deadline', deadlineAt: selectedDeadlineAt };
    if (Date.parse(selectedDeadlineAt) > Date.parse(previousDeadlineAt)) {
      if (input.proposedDeadlineAt === undefined) return clarify(['remainingMinutes', 'proposedDeadlineAt']);
      terms = { kind: 'extension_proposal', previousDeadlineAt, deadlineAt: selectedDeadlineAt, requestId: input.requestId };
    }
    if (Date.parse(input.now) < Date.parse(parent.continuation.startAt)) return clarify(['now']);
    payload.continuation = { origin, startAt: input.now, budgetMinutes: input.remainingMinutes, constraints: input.constraints, timeTerms: terms };
    const content = approvedContent(payload.stops.map(s => s.id));
    if (!content) return { kind: 'no_feasible_walk', reasons: [{ code: 'NO_SUPPORTED_CONTENT', message: text('Сохранённый порядок истории не поддерживается этой редакцией.', 'Сақталған хикая реті бұл редакцияда қолдау таппайды.', 'The stored story order is not supported by this editorial revision.') }] };
    payload.content = content; payload.theme = approvedTheme();
    let end = parent.resolvedEnd.endpoint;
    if (parent.request.endRule.kind === 'return_to_start') end = parent.originalOrigin;
    else if (parent.request.endRule.kind === 'last_stop' && payload.stops.length) end = publicEndpoint(payload.stops.at(-1)!.id);
    if (!resolve(end.requested)) return clarify(['choose_supported_end']);
    payload.resolvedEnd = { endpoint: end, ...(parent.request.endRule.kind === 'last_stop' ? { stopId: payload.stops.at(-1)?.id ?? parent.resolvedEnd.stopId } : {}) };
    payload.legs = []; let elapsed = 0, previous = origin, previousId = 'origin';
    for (const stop of payload.stops) {
      const approved = prepared.stops.find(s => s.id === stop.id)!;
      const currentPlace = found.pois.find(p => p.id === stop.poiId && p.anchorIds.includes(stop.id));
      const currentAnchor = found.anchors.find(a => a.id === stop.id);
      if (!currentPlace || !currentAnchor || !same(currentAnchor.coordinate, approved.coordinate as Coordinate) || currentAnchor.graphNodeId !== approved.osmNodeId) return { kind: 'unavailable', code: 'DATA_UNAVAILABLE' };
      stop.title = approved.title; stop.anchor = currentAnchor; stop.visitMinutes = approved.visitMinutes; stop.intent = 'outdoor_observation';
      stop.factRefs = [...approved.factRefs]; stop.chapterId = `chapter:${approved.id}`; stop.questId = approved.quest.id; stop.collectionId = 'three-forms';
      stop.access = currentPlace.access; stop.opening = currentPlace.opening; stop.services = currentPlace.services;
      const segment = leg(previous, publicEndpoint(stop.id), previousId, stop.id); payload.legs.push(segment); elapsed += segment.walkMinutes;
      stop.arrivalAt = instant(input.now, elapsed); stop.departureAt = instant(input.now, elapsed + stop.visitMinutes); elapsed += stop.visitMinutes;
      previous = publicEndpoint(stop.id); previousId = stop.id;
    }
    if (!payload.stops.length || !same(previous.coordinate, end.coordinate)) payload.legs.push(leg(previous, end, previousId, 'end'));
    const walkMinutes = payload.legs.reduce((n, l) => n + l.walkMinutes, 0), visitMinutes = payload.stops.reduce((n, s) => n + s.visitMinutes, 0), reserveMinutes = initialReserveMinutes(input.remainingMinutes);
    const totalMinutes = walkMinutes + visitMinutes + reserveMinutes, distanceMeters = payload.legs.reduce((n, l) => n + l.distanceMeters, 0);
    if (totalMinutes > input.remainingMinutes || input.constraints.some(c => c.kind === 'max_distance_m' && distanceMeters > c.value)) return { kind: 'no_feasible_walk', reasons: [{ code: 'INSUFFICIENT_TIME', message: text('Оставшаяся прогулка с резервом не помещается в новые условия.', 'Қалған серуен қор уақытпен бірге жаңа шарттарға сыймайды.', 'The remaining walk including reserve does not fit the new conditions.') }] };
    payload.timing = { walkMinutes, visitMinutes, reserveMinutes, totalMinutes, distanceMeters, endsAt: instant(input.now, totalMinutes) };
    payload.context = found.context; payload.evidenceRevision = found.revision;
    payload.facts = found.facts.filter(f => prepared.facts.some(p => p.id === f.id));
    const requiredSources = new Set(payload.facts.flatMap(f => f.sourceIds));
    const addSources = (field: { sourceIds: readonly string[] }) => field.sourceIds.forEach(id => requiredSources.add(id));
    const addEndpointSources = (endpoint: ResolvedEndpoint) => {
      if (endpoint.connector.kind === 'verified') { addSources(endpoint.connector); addSources(endpoint.connector.stepFree); }
    };
    addEndpointSources(payload.originalOrigin); addEndpointSources(payload.continuation.origin); addEndpointSources(payload.resolvedEnd.endpoint);
    for (const stop of payload.stops) {
      addSources(stop.anchor); addSources(stop.access); addSources(stop.opening); addSources(stop.services.coffee);
    }
    for (const segment of payload.legs) {
      addEndpointSources(segment.from); addEndpointSources(segment.to);
      if (segment.kind === 'walk') { addSources(segment.source); addSources(segment.stepFree); }
    }
    addSources(payload.context.weather); addSources(payload.context.calendar);
    if (payload.context.calendar.state === 'known') payload.context.calendar.value.exceptions.forEach(addSources);
    payload.sources = found.sources.filter(s => requiredSources.has(s.id));
    if (payload.sources.length !== requiredSources.size) return { kind: 'unavailable', code: 'DATA_UNAVAILABLE' };
    // A new revision never inherits offline readiness. Matching files are reused only by the local pack verifier.
    payload.assets = { version: 1, items: [], map: { state: 'missing', reason: 'Revised map/audio manifest requires preparation' } };
    const bundle = await sealBundle(payload, options.hash);
    const check = await validateRevisionAgainstParent(JSON.stringify(parent), JSON.stringify(bundle), options.hash, input.completedStopIds);
    if (!check.ok) return clarify(['active_revision']);
    return { kind: 'revision_proposal', proposalId: options.id(), expiresAt: instant(generatedAt, 5), parentRevision: parent.revision, parentHash: parent.sha256, bundle,
      changes: { addedStopIds: [], removedStopIds: [], oldEndsAt: parent.timing.endsAt, newEndsAt: bundle.timing.endsAt, themeChanged: check.reasons.includes('theme_changed') }, requiresConsent: check.requiresConsent };
  }
  return { async plan(input) { try { return await plan(input); } catch { return { kind: 'unavailable', code: 'DATA_UNAVAILABLE' }; } },
    async revise(input) { try { return await revise(input); } catch { return { kind: 'unavailable', code: 'DATA_UNAVAILABLE' }; } } };
}
