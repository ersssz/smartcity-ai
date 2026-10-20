import { EvidenceSetSchema, EvidenceQuerySchema, type CityEvidence, type EvidenceSet, type EvidenceQuery, type PoiEvidence, type ContextSnapshot } from '../../contracts/src/index.js';
import bundledCatalog from './catalog.generated.js';

export class CityEvidenceError extends Error {
  constructor(readonly code: 'INVALID_QUERY' | 'INVALID_CATALOG') {
    super(code);
    this.name = 'CityEvidenceError';
  }
}

function validateCatalog(catalog: EvidenceSet): void {
  const fail = () => { throw new CityEvidenceError('INVALID_CATALOG'); };
  const unique = (ids: string[]) => { if (new Set(ids).size !== ids.length) fail(); };
  if (catalog.pois.length > 5000 || catalog.anchors.length > 10_000 || catalog.facts.length > 30_000 || catalog.sources.length > 30_000) fail();
  for (const records of [catalog.pois, catalog.anchors, catalog.facts, catalog.sources]) unique(records.map(r => r.id));
  const sourceIds = new Set(catalog.sources.map(s => s.id));
  const factIds = new Set(catalog.facts.map(f => f.id));
  const anchorIds = new Set(catalog.anchors.map(a => a.id));
  const refs = (ids: string[], known: Set<string>) => { unique(ids); if (ids.some(id => !known.has(id))) fail(); };
  const field = (f: DatedField & { sourceIds: string[] }) => {
    refs(f.sourceIds, sourceIds);
    if (f.state === 'known' && Date.parse(f.observedAt!) >= Date.parse(f.validUntil!)) fail();
  };
  catalog.sources.forEach(source => { const url = new URL(source.url); if (url.username || url.password) fail(); });
  catalog.facts.forEach(f => refs(f.sourceIds, sourceIds));
  catalog.anchors.forEach(a => refs(a.sourceIds, sourceIds));
  const zoneIds = new Set(catalog.coverage.zoneIds);
  catalog.pois.forEach(p => {
    refs(p.sourceIds, sourceIds); refs(p.factRefs, factIds); refs(p.anchorIds, anchorIds); refs(p.zoneIds, zoneIds);
    [p.center, p.access, p.opening, p.services.coffee].forEach(field);
    if (p.opening.state === 'known' && p.opening.value.openIntervals.some(v => Date.parse(v.from) >= Date.parse(v.until))) fail();
  });
  field(catalog.context.weather); field(catalog.context.calendar);
  if (catalog.context.calendar.state === 'known') catalog.context.calendar.value.exceptions.forEach(e => {
    refs(e.sourceIds, sourceIds);
    if (Date.parse(e.from) >= Date.parse(e.until)) fail();
  });
}

type DatedField = { state: string; observedAt?: string; validUntil?: string };
type Field<T> = { state: 'known'; value: T; sourceIds: string[]; observedAt: string; validUntil: string }
  | { state: 'unknown' | 'stale' | 'conflicting'; reason: string; sourceIds: string[] };
function evaluateField<T>(field: Field<T>, at: string): Field<T> {
  if (field.state !== 'known') return field;
  if (Date.parse(field.observedAt) > Date.parse(at)) return { state: 'unknown', reason: 'Observation is later than the query instant', sourceIds: field.sourceIds };
  if (Date.parse(field.validUntil) <= Date.parse(at)) return { state: 'stale', reason: 'Evidence validity expired before this query instant', sourceIds: field.sourceIds };
  return field;
}
function evaluatePoi(poi: PoiEvidence, at: string): PoiEvidence {
  return { ...poi, center: evaluateField(poi.center, at), access: evaluateField(poi.access, at),
    opening: evaluateField(poi.opening, at), services: { coffee: evaluateField(poi.services.coffee, at) } };
}

function evaluateContext(context: ContextSnapshot, at: string): ContextSnapshot {
  const month = Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Almaty', month: 'numeric' }).format(new Date(at)));
  const season = month === 12 || month < 3 ? 'winter' : month < 6 ? 'spring' : month < 9 ? 'summer' : 'autumn';
  let weather = evaluateField(context.weather, at);
  if (weather.state === 'known') {
    const updated = Date.parse(weather.value.updatedAt), retrieved = Date.parse(weather.value.retrievedAt);
    if (updated > retrieved || retrieved > Date.parse(at)) weather = { state: 'unknown', reason: 'Weather model or retrieval is from the future/inconsistent', sourceIds: weather.sourceIds };
    else if (Date.parse(at) - updated >= 6 * 3_600_000) weather = { state: 'stale', reason: 'Weather model is at least six hours old', sourceIds: weather.sourceIds };
    else weather = { ...weather, validUntil: new Date(Math.min(Date.parse(weather.validUntil), updated + 6 * 3_600_000)).toISOString() };
  }
  return { evaluatedAt: at, season, weather, calendar: evaluateField(context.calendar, at) };
}
function current(field: DatedField, at: string): boolean {
  return field.state === 'known' && Date.parse(field.observedAt!) <= Date.parse(at) && Date.parse(field.validUntil!) > Date.parse(at);
}

function meetsRequired(poi: PoiEvidence, query: EvidenceQuery, catalog: EvidenceSet): boolean {
  const open = () => {
    const calendar = evaluateField(catalog.context.calendar, query.at);
    if (calendar.state === 'conflicting') return false;
    if (calendar.state === 'known') {
      const overrides = calendar.value.exceptions.filter(e => e.poiId === poi.id && Date.parse(e.from) <= Date.parse(query.at) && Date.parse(e.until) > Date.parse(query.at));
      if (overrides.length) return overrides.every(e => e.open);
    }
    return current(poi.opening, query.at) && poi.opening.state === 'known'
      && poi.opening.value.openIntervals.some(v => Date.parse(v.from) <= Date.parse(query.at) && Date.parse(v.until) > Date.parse(query.at));
  };
  const publicAccess = () => current(poi.access, query.at) && poi.access.state === 'known' && poi.access.value.public;
  return query.required.every(required => {
    if (required === 'public_anchor') return catalog.anchors.some(a => poi.anchorIds.includes(a.id) && Date.parse(a.checkedAt) <= Date.parse(query.at));
    if (required === 'indoor') return publicAccess() && poi.access.state === 'known' && poi.access.value.indoor && open();
    if (required === 'coffee') return publicAccess() && open() && current(poi.services.coffee, query.at) && poi.services.coffee.state === 'known' && poi.services.coffee.value;
    return publicAccess() && poi.access.state === 'known' && poi.access.value.stepFree === 'verified';
  });
}

function inArea(poi: PoiEvidence, area: EvidenceQuery['area'], catalog: EvidenceSet): boolean {
  if (area.kind === 'public_zone') return poi.zoneIds.includes(area.zoneId);
  const [west, south, east, north] = area.bounds;
  const coordinates = [...(poi.center.state === 'known' ? [poi.center.value] : []),
    ...catalog.anchors.filter(a => poi.anchorIds.includes(a.id)).map(a => a.coordinate)];
  return coordinates.some(([x, y]) => x >= west && x <= east && y >= south && y <= north);
}

const words = (text: string): string[] => text.normalize('NFKC').toLowerCase().replace(/ё/g, 'е').match(/[\p{L}\p{N}]+/gu) ?? [];
const interests: Record<EvidenceQuery['interests'][number], PoiEvidence['categories']> = {
  architecture: ['landmark', 'public_space'], history: ['landmark', 'culture', 'museum'],
  art: ['culture'], parks: ['park'], coffee: ['cafe'], unusual: ['landmark', 'culture', 'public_space'],
};
function relevance(poi: PoiEvidence, query: EvidenceQuery): number | undefined {
  const tokens = query.terms.flatMap(words);
  if (query.terms.length && !tokens.length) return undefined;
  const names = [...Object.values(poi.names), ...Object.values(poi.aliases).flat()];
  const nameWords = names.flatMap(words);
  if (!tokens.every(token => nameWords.some(word => word === token || (token.length >= 3 && word.startsWith(token))))) return undefined;
  const preference = query.interests.reduce((score, interest) => score + (poi.categories.some(c => interests[interest].includes(c)) ? 1 : 0), 0);
  if (!tokens.length && query.interests.length && !preference) return undefined;
  const phrase = tokens.join(' ');
  const lexical = tokens.reduce((score, token) => score + (nameWords.includes(token) ? 2 : 1), 0)
    + (tokens.length && words(poi.names[query.locale]).join(' ') === phrase ? 8 : 0);
  return lexical + preference;
}

function closure(catalog: EvidenceSet, pois: PoiEvidence[], at: string): EvidenceSet {
  const factIds = new Set(pois.flatMap(p => p.factRefs));
  const anchorIds = new Set(pois.flatMap(p => p.anchorIds));
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Almaty', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(at));
  const part = (kind: string) => parts.find(p => p.type === kind)!.value;
  const localDay = `${part('year')}-${part('month')}-${part('day')}`;
  const applicableCheck = (checkedAt: string) => checkedAt.length === 10 ? checkedAt <= localDay : Date.parse(checkedAt) <= Date.parse(at);
  const sourceById = new Map(catalog.sources.map(s => [s.id, s]));
  const facts = catalog.facts.filter(f => factIds.has(f.id) && applicableCheck(f.checkedAt)
    && (!f.validUntil || Date.parse(f.validUntil) > Date.parse(at))
    && f.sourceIds.every(id => applicableCheck(sourceById.get(id)!.checkedAt)));
  const availableFacts = new Set(facts.map(f => f.id));
  pois = pois.map(p => ({ ...p, factRefs: p.factRefs.filter(id => availableFacts.has(id)) }));
  const anchors = catalog.anchors.filter(a => anchorIds.has(a.id));
  const context = evaluateContext(catalog.context, at);
  const sourceIds = new Set([
    ...pois.flatMap(p => [...p.sourceIds, ...p.center.sourceIds, ...p.access.sourceIds, ...p.opening.sourceIds, ...p.services.coffee.sourceIds]),
    ...facts.flatMap(f => f.sourceIds), ...anchors.flatMap(a => a.sourceIds),
    ...context.weather.sourceIds, ...context.calendar.sourceIds,
    ...(context.calendar.state === 'known' ? context.calendar.value.exceptions.flatMap(e => e.sourceIds) : []),
  ]);
  return EvidenceSetSchema.parse({ ...catalog, evaluatedAt: at, pois, facts, anchors, context,
    sources: catalog.sources.filter(s => sourceIds.has(s.id)) });
}

export function createCityEvidence(input: unknown = bundledCatalog): CityEvidence {
  const parsed = EvidenceSetSchema.safeParse(input);
  if (!parsed.success) throw new CityEvidenceError('INVALID_CATALOG');
  const catalog = parsed.data;
  validateCatalog(catalog);
  return { async search(input) {
    const parsedQuery = EvidenceQuerySchema.safeParse(input);
    if (!parsedQuery.success) throw new CityEvidenceError('INVALID_QUERY');
    const query = parsedQuery.data;
    const pois = catalog.pois.map((poi, index) => ({ poi, index }))
      .filter(({ poi }) => inArea(poi, query.area, catalog))
      .map(item => ({ ...item, poi: evaluatePoi(item.poi, query.at) }))
      .filter(({ poi }) => meetsRequired(poi, query, catalog))
      .map(item => ({ ...item, score: relevance(item.poi, query) }))
      .filter((item): item is typeof item & { score: number } => item.score !== undefined)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, query.limit).map(item => item.poi);
    return closure(catalog, pois, query.at);
  } };
}
