import { z } from 'zod';
import { WalkBundleObjectSchema, Sha256Schema, type WalkBundlePayload, type WalkBundleV1, type Coordinate, type ResolvedEndpoint, type Endpoint } from './model.js';

export const MAX_BUNDLE_BYTES = 512 * 1024;
export type Sha256 = (utf8: string) => Promise<string>;
const same = (a: Coordinate, b: Coordinate) => a[0] === b[0] && a[1] === b[1];
const close = (a: number, b: number) => Math.abs(a - b) <= 0.00001;
const closeInstant = (a: number, b: number) => Math.abs(a - b) <= 1;
const ms = (s: string) => Date.parse(s);
export const initialReserveMinutes = (budgetMinutes: number) => Math.max(5, Math.ceil(budgetMinutes * 0.1));
export function sameEndpoint(a: Endpoint, b: Endpoint): boolean {
  if (a.kind === 'public_anchor' && b.kind === 'public_anchor') return a.anchorId === b.anchorId;
  return a.kind === 'point' && b.kind === 'point' && a.source === b.source && same(a.coordinate, b.coordinate) && (a.source !== 'gps' || (b.source === 'gps' && a.accuracyM === b.accuracyM && a.capturedAt === b.capturedAt));
}
function validate(w: WalkBundlePayload, ctx: z.RefinementCtx) {
  const fail = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  const unique = (ids: string[], kind: string) => { if (new Set(ids).size !== ids.length) fail(`Duplicate ${kind}`); };
  const sourceIds = new Set(w.sources.map(s => s.id)), factIds = new Set(w.facts.map(f => f.id));
  const refs = (ids: string[], set: Set<string>, kind: string) => ids.forEach(id => { if (!set.has(id)) fail(`Unknown ${kind}: ${id}`); });
  unique(w.sources.map(s => s.id), 'source'); unique(w.facts.map(f => f.id), 'fact');
  unique(w.stops.map(s => s.id), 'stop'); unique(w.stops.map(s => s.poiId), 'place'); unique(w.legs.map(l => l.id), 'leg');
  unique(w.assets.items.map(a => a.id), 'asset');
  for (const kind of ['chapters', 'quests', 'collections'] as const) unique(w.content[kind].map(c => c.id), kind);
  w.facts.forEach(f => refs(f.sourceIds, sourceIds, 'source'));
  refs(w.theme.explanation.factRefs, factIds, 'fact');
  if ((w.parentRevision === undefined) !== (w.parentHash === undefined) || (w.revision === 1 && w.parentRevision !== undefined) || (w.revision > 1 && w.parentRevision !== w.revision - 1)) fail('Revision must name its immediate immutable parent');
  if (!sameEndpoint(w.originalOrigin.requested, w.request.origin)) fail('Original origin differs from the original request');
  const terms = w.continuation.timeTerms;
  const originalDeadline = ms(w.request.startAt) + w.request.budgetMinutes * 60_000;
  if (w.revision === 1 && (canonicalJson(w.continuation.origin) !== canonicalJson(w.originalOrigin) || canonicalJson(w.continuation.constraints) !== canonicalJson(w.request.constraints) || w.continuation.startAt !== w.request.startAt || w.continuation.budgetMinutes !== w.request.budgetMinutes || terms.kind !== 'current_deadline' || ms(terms.deadlineAt) !== originalDeadline || !w.stops.length)) fail('Initial continuation must preserve the original request and deadline');
  if (ms(w.continuation.startAt) < ms(w.request.startAt) || ms(w.continuation.startAt) + w.continuation.budgetMinutes * 60_000 > ms(terms.deadlineAt)) fail('Continuation exceeds its stated deadline or predates the request');
  if (terms.kind === 'extension_proposal' && (w.revision === 1 || ms(terms.deadlineAt) <= ms(terms.previousDeadlineAt))) fail('Extension must explicitly propose a later deadline on a revision');
  const anchorLocations = new Map<string, Coordinate>();
  const rememberAnchor = (id: string, coordinate: Coordinate) => {
    const previous = anchorLocations.get(id);
    if (previous && !same(previous, coordinate)) fail('Public anchor id has inconsistent coordinates');
    else anchorLocations.set(id, coordinate);
  };
  const resolved = (e: ResolvedEndpoint) => {
    if (e.requested.kind === 'point' && !same(e.requested.coordinate, e.coordinate)) fail('Requested point was silently moved');
    if (e.requested.kind === 'public_anchor') rememberAnchor(e.requested.anchorId, e.coordinate);
    if (e.connector.kind === 'exact') {
      if (!same(e.coordinate, e.graphPoint.coordinate) || e.snapDistanceM !== 0) fail('Exact endpoint must be the actual graph point');
    } else {
      const c = e.connector;
      refs(c.sourceIds, sourceIds, 'connector source');
      refs(c.stepFree.sourceIds, sourceIds, 'connector accessibility source');
      if (!same(c.geometry.coordinates[0]!, e.coordinate) || !same(c.geometry.coordinates.at(-1)!, e.graphPoint.coordinate)) fail('Connector must join requested endpoint to graph point');
      if (e.snapDistanceM <= 0 || c.distanceMeters < e.snapDistanceM) fail('Connector distance omits the snap');
    }
  };
  resolved(w.originalOrigin); resolved(w.continuation.origin); resolved(w.resolvedEnd.endpoint);
  if (w.request.endRule.kind === 'return_to_start' && (!sameEndpoint(w.resolvedEnd.endpoint.requested, w.request.origin) || !same(w.resolvedEnd.endpoint.coordinate, w.originalOrigin.coordinate))) fail('Return endpoint must remain the original origin');
  if (w.request.endRule.kind === 'point' && !sameEndpoint(w.resolvedEnd.endpoint.requested, w.request.endRule.endpoint)) fail('Explicit end was changed');
  const last = w.stops.at(-1);
  if (w.request.endRule.kind === 'last_stop' && (!w.resolvedEnd.stopId || (last && (w.resolvedEnd.stopId !== last.id || !same(w.resolvedEnd.endpoint.coordinate, last.anchor.coordinate) || w.resolvedEnd.endpoint.requested.kind !== 'public_anchor' || w.resolvedEnd.endpoint.requested.anchorId !== last.anchor.id)))) fail('Last-stop end must resolve to the actual last stop');
  const endpointForStop = (index: number) => w.stops[index]!.anchor;
  const matchesStop = (e: ResolvedEndpoint, index: number) => {
    const a = endpointForStop(index);
    if (!same(e.coordinate, a.coordinate) || e.requested.kind !== 'public_anchor' || e.requested.anchorId !== a.id || e.graphPoint.id !== a.graphNodeId) fail('Leg endpoint differs from its public stop anchor');
  };
  const finalLegNeeded = !last || !same(w.resolvedEnd.endpoint.coordinate, last.anchor.coordinate);
  if (w.legs.length !== w.stops.length + (finalLegNeeded ? 1 : 0)) fail('Legs must include origin, each stop and the resolved end');
  let elapsed = 0;
  w.stops.forEach((s, i) => {
    refs(s.anchor.sourceIds, sourceIds, 'anchor source'); refs(s.factRefs, factIds, 'fact');
    rememberAnchor(s.anchor.id, s.anchor.coordinate);
    for (const field of [s.access, s.opening, s.services.coffee]) refs(field.sourceIds, sourceIds, 'source');
    const chapter = w.content.chapters.find(c => c.id === s.chapterId), quest = w.content.quests.find(q => q.id === s.questId);
    if (!chapter || chapter.stopId !== s.id || !quest || quest.stopId !== s.id || !w.content.collections.some(c => c.id === s.collectionId)) fail('Stop content does not exist or belongs to another stop');
    const leg = w.legs[i]; if (!leg) return;
    if (leg.fromId !== (i ? w.stops[i - 1]!.id : 'origin') || leg.toId !== s.id) fail('Leg order is broken');
    if (!i && (!same(leg.from.coordinate, w.continuation.origin.coordinate) || !sameEndpoint(leg.from.requested, w.continuation.origin.requested))) fail('First leg omits the continuation origin');
    if (i) matchesStop(leg.from, i - 1); matchesStop(leg.to, i);
    elapsed += leg.walkMinutes;
    if (!closeInstant(ms(s.arrivalAt), ms(w.continuation.startAt) + elapsed * 60_000) || !closeInstant(ms(s.departureAt), ms(s.arrivalAt) + s.visitMinutes * 60_000)) fail('Stop timeline omits walking or visit time');
    elapsed += s.visitMinutes;
    const validField = (f: { state: string; observedAt?: string; validUntil?: string }) => f.state === 'known' && ms(f.observedAt!) <= ms(s.arrivalAt) && ms(f.validUntil!) >= ms(s.departureAt);
    if (s.access.state === 'known' && !s.access.value.public) fail('Stop access is known to be nonpublic');
    const intervalOpen = validField(s.opening) && s.opening.state === 'known' && s.opening.value.openIntervals.some(v => ms(v.from) < ms(v.until) && ms(v.from) <= ms(s.arrivalAt) && ms(v.until) >= ms(s.departureAt));
    if (s.intent === 'indoor_visit' && (!validField(s.access) || s.access.state !== 'known' || !s.access.value.indoor || !intervalOpen)) fail('Indoor visit lacks fresh access and a full opening interval');
    if (s.services.coffee.state === 'known' && s.services.coffee.value && (!validField(s.services.coffee) || !validField(s.access) || !intervalOpen)) fail('Coffee promise lacks current service/access/opening evidence');
  });
  if (finalLegNeeded) {
    const leg = w.legs.at(-1)!;
    if (leg.fromId !== (last ? last.id : 'origin') || leg.toId !== 'end') fail('Final leg must reach the resolved end');
    if (last) matchesStop(leg.from, w.stops.length - 1);
    else if (canonicalJson(leg.from) !== canonicalJson(w.continuation.origin)) fail('Route-only continuation omits current origin');
    if (!same(leg.to.coordinate, w.resolvedEnd.endpoint.coordinate) || !sameEndpoint(leg.to.requested, w.resolvedEnd.endpoint.requested)) fail('Final end connector was changed');
  }
  for (const l of w.legs) {
    resolved(l.from); resolved(l.to);
    if (l.kind === 'already_at_endpoint') { if (!same(l.from.coordinate, l.to.coordinate)) fail('Zero-distance leg changes position'); }
    else {
      refs(l.source.sourceIds, sourceIds, 'route source');
      refs(l.stepFree.sourceIds, sourceIds, 'route accessibility source');
      if (!same(l.geometry.coordinates[0]!, l.from.coordinate) || !same(l.geometry.coordinates.at(-1)!, l.to.coordinate)) fail('Route hides an endpoint connector');
      const connectorMinutes = [l.from, l.to].reduce((n, e) => n + (e.connector.kind === 'verified' ? e.connector.walkMinutes : 0), 0);
      const connectorMeters = [l.from, l.to].reduce((n, e) => n + (e.connector.kind === 'verified' ? e.connector.distanceMeters : 0), 0);
      if (l.walkMinutes < connectorMinutes || l.distanceMeters < connectorMeters) fail('Route omits connector time or distance');
      const prefix = l.from.connector.kind === 'verified' ? l.from.connector.geometry.coordinates : [l.from.graphPoint.coordinate];
      const suffix = l.to.connector.kind === 'verified' ? [...l.to.connector.geometry.coordinates].reverse() : [l.to.graphPoint.coordinate];
      if (l.geometry.coordinates.length < prefix.length + suffix.length - 1 || prefix.some((c, i) => !l.geometry.coordinates[i] || !same(c, l.geometry.coordinates[i]!)) || suffix.some((c, i) => !l.geometry.coordinates[l.geometry.coordinates.length - suffix.length + i] || !same(c, l.geometry.coordinates[l.geometry.coordinates.length - suffix.length + i]!))) fail('Route must traverse the complete verified endpoint connectors');
    }
  }
  if (w.content.chapters.length !== w.stops.length || w.content.quests.length !== w.stops.length) fail('Orphaned chapter or quest');
  for (const c of w.content.chapters) for (const b of c.blocks) if (b.kind === 'fact') refs(b.factRefs, factIds, 'fact');
  for (const q of w.content.quests) { unique(q.choices.map(c => c.id), 'choice'); refs(q.factRefs, factIds, 'fact'); if (!q.choices.some(c => c.id === q.correctChoiceId)) fail('Quest answer is missing'); }
  const t = w.timing;
  if (!close(t.walkMinutes, w.legs.reduce((n, l) => n + l.walkMinutes, 0)) || !close(t.distanceMeters, w.legs.reduce((n, l) => n + l.distanceMeters, 0)) || !close(t.visitMinutes, w.stops.reduce((n, s) => n + s.visitMinutes, 0)) || !close(t.totalMinutes, t.walkMinutes + t.visitMinutes + t.reserveMinutes)) fail('Timing totals do not include every leg and visit');
  if (t.reserveMinutes < initialReserveMinutes(w.continuation.budgetMinutes) || t.totalMinutes > w.continuation.budgetMinutes || !closeInstant(ms(t.endsAt), ms(w.continuation.startAt) + t.totalMinutes * 60_000) || ms(t.endsAt) > ms(terms.deadlineAt)) fail('Plan exceeds the declared deadline or omits reserve');
  for (const c of w.continuation.constraints) {
    if (c.kind === 'max_distance_m' && t.distanceMeters > c.value) fail('Maximum walking distance exceeded');
    if (c.kind === 'indoor_required' && w.stops.length && !w.stops.some(s => s.intent === 'indoor_visit')) fail('Required indoor stop is absent');
    if (c.kind === 'coffee_required' && w.stops.length && !w.stops.some(s => s.services.coffee.state === 'known' && s.services.coffee.value)) fail('Required coffee stop is absent');
    if (c.kind === 'step_free_required') {
      const fresh = (field: { state: string; value?: boolean; observedAt?: string; validUntil?: string }) => field.state === 'known' && field.value === true && ms(field.observedAt!) <= ms(w.continuation.startAt) && ms(field.validUntil!) >= ms(t.endsAt);
      if (w.stops.some(s => s.access.state !== 'known' || s.access.value.stepFree !== 'verified' || ms(s.access.observedAt) > ms(s.arrivalAt) || ms(s.access.validUntil) < ms(s.departureAt)) || w.legs.some(l => l.kind === 'walk' && !fresh(l.stepFree)) || w.legs.some(l => [l.from, l.to].some(e => e.connector.kind === 'verified' && !fresh(e.connector.stepFree)))) fail('Step-free stops, legs and connectors require current proof');
    }
  }
  const map = w.assets.map;
  if (map.state === 'available') {
    const [west, south, east, north] = map.bounds;
    if (west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north || map.minZoom > map.maxZoom) fail('Invalid offline map bounds or zoom');
    refs(map.assetIds, new Set(w.assets.items.map(a => a.id)), 'map asset');
    for (const role of ['map', 'style', 'attribution']) if (!map.assetIds.some(id => w.assets.items.some(a => a.id === id && a.role === role && a.required))) fail(`Missing required ${role} asset`);
    for (const l of w.legs) if (l.kind === 'walk' && l.geometry.coordinates.some(([x, y]) => x < west || x > east || y < south || y > north)) fail('Offline map does not cover the whole route');
    for (const c of [w.originalOrigin.coordinate, w.continuation.origin.coordinate, w.resolvedEnd.endpoint.coordinate, ...w.stops.map(s => s.anchor.coordinate)]) if (c[0] < west || c[0] > east || c[1] < south || c[1] > north) fail('Offline map omits a required endpoint');
  }
  const allAudio = [...w.content.chapters.map(c => c.audio), ...w.content.quests.flatMap(q => [q.audio.question, q.audio.hint, q.audio.explanation]), ...Object.values(w.content.cues).map(c => c.audio)];
  for (const audio of allAudio) for (const locale of ['ru', 'kk', 'en'] as const) {
    const a = audio[locale];
    if (a.state === 'available' && !w.assets.items.some(i => i.id === a.assetId && i.role === 'audio' && i.locale === locale && i.required)) fail('Audio reference lacks a required matching-language asset');
  }
  refs(w.context.weather.sourceIds, sourceIds, 'weather source'); refs(w.context.calendar.sourceIds, sourceIds, 'calendar source');
  if (w.context.weather.state === 'known') {
    const f = w.context.weather, v = f.value, evaluated = ms(w.context.evaluatedAt);
    if (ms(f.observedAt) > evaluated || ms(v.updatedAt) > ms(v.retrievedAt) || ms(v.retrievedAt) > evaluated || evaluated - ms(v.updatedAt) > 6 * 3_600_000 || ms(f.validUntil) < evaluated || ms(f.validUntil) > ms(v.updatedAt) + 6 * 3_600_000) fail('Known weather is stale or from the future');
  }
}
export const WalkBundlePayloadSchema = WalkBundleObjectSchema.superRefine(validate);
export const WalkBundleSchema = WalkBundleObjectSchema.extend({ sha256: Sha256Schema }).strict().superRefine(validate);

/** Canonical JSON for UTF-8 SHA-256: ordered UTF-16 keys, ECMAScript number/string encoding, no Unicode normalization. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') { if (!Number.isFinite(value)) throw new Error('Non-finite JSON number'); return JSON.stringify(value); }
  if (typeof value === 'string') { if (/\p{Surrogate}/u.test(value)) throw new Error('Unpaired Unicode surrogate'); return JSON.stringify(value); }
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) return '{' + Object.keys(value).sort().map(key => canonicalJson(key) + ':' + canonicalJson((value as Record<string, unknown>)[key])).join(',') + '}';
  throw new Error('Only JSON data is permitted');
}
function utf8Length(value: string): number { let n = 0; for (const c of value) { const cp = c.codePointAt(0)!; n += cp <= 0x7f ? 1 : cp <= 0x7ff ? 2 : cp <= 0xffff ? 3 : 4; } return n; }
function freeze<T>(value: T): T { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
async function digest(value: unknown, hash: Sha256) { const bytes = canonicalJson(value); if (utf8Length(bytes) > MAX_BUNDLE_BYTES) throw new Error('BUNDLE_TOO_LARGE'); return Sha256Schema.parse(await hash(bytes)); }
export async function sealBundle(payload: unknown, hash: Sha256): Promise<WalkBundleV1> {
  const parsed = WalkBundlePayloadSchema.parse(payload);
  // Reject normalizing parsers (e.g. trimmed text); producers must seal their exact accepted JSON.
  if (canonicalJson(parsed) !== canonicalJson(payload)) throw new Error('NON_CANONICAL_PAYLOAD');
  const bundle = { ...parsed, sha256: await digest(payload, hash) };
  if (utf8Length(canonicalJson(bundle)) > MAX_BUNDLE_BYTES) throw new Error('BUNDLE_TOO_LARGE');
  return freeze(bundle);
}
export type BundleRead = { ok: true; bundle: WalkBundleV1 } | { ok: false; code: 'BUNDLE_TOO_LARGE' | 'MALFORMED_JSON' | 'UNSUPPORTED_BUNDLE_VERSION' | 'HASH_MISMATCH' | 'INVALID_BUNDLE' | 'HASH_UNAVAILABLE' };
export async function readBundle(json: string, hash: Sha256): Promise<BundleRead> {
  if (utf8Length(json) > MAX_BUNDLE_BYTES) return { ok: false, code: 'BUNDLE_TOO_LARGE' };
  let raw: unknown; try { raw = JSON.parse(json); } catch { return { ok: false, code: 'MALFORMED_JSON' }; }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, code: 'INVALID_BUNDLE' };
  const { sha256, ...payload } = raw as Record<string, unknown>;
  if (payload.schemaVersion !== 1) return { ok: false, code: 'UNSUPPORTED_BUNDLE_VERSION' };
  if (!Sha256Schema.safeParse(sha256).success) return { ok: false, code: 'INVALID_BUNDLE' };
  try { canonicalJson(payload); } catch { return { ok: false, code: 'INVALID_BUNDLE' }; }
  let computed: string;
  try { computed = await digest(payload, hash); } catch { return { ok: false, code: 'HASH_UNAVAILABLE' }; }
  if (computed !== sha256) return { ok: false, code: 'HASH_MISMATCH' };
  const parsed = WalkBundleSchema.safeParse(raw);
  if (!parsed.success || canonicalJson(parsed.data) !== canonicalJson(raw)) return { ok: false, code: 'INVALID_BUNDLE' };
  return { ok: true, bundle: freeze(parsed.data) };
}
