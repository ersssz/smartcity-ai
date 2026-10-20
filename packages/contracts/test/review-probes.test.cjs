'use strict';

// Independent review regressions. All routes, evidence and dates below are
// synthetic CC0 fixtures; these tests do not prove real access or field routing.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const crypto = require('node:crypto');
const Module = require('node:module');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('../../../apps/mobile/node_modules/typescript');
const { fixture } = require('./fixture.cjs');

// Temporary local copy of the existing loader: this test owns no shared helper.
function load(filename, cache = new Map()) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const m = new Module(filename, module);
  cache.set(filename, m);
  m.filename = filename;
  m.paths = Module._nodeModulePaths(path.dirname(filename));
  const nativeRequire = m.require.bind(m);
  m.require = id => id.startsWith('.')
    ? load(path.resolve(path.dirname(filename), id.replace(/\.js$/, '') + '.ts'), cache)
    : nativeRequire(id);
  m._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, filename);
  return m.exports;
}

const api = load(path.resolve(__dirname, '../src/index.ts'));
const hash = async bytes => crypto.createHash('sha256').update(bytes, 'utf8').digest('hex');
const clone = value => structuredClone(value);
const fresh = value => ({ state: 'known', value, sourceIds: ['fixture-source'],
  observedAt: '2026-10-20T09:00:00.000Z', validUntil: '2026-10-20T12:00:00.000Z' });
const unknown = () => ({ state: 'unknown', reason: 'No synthetic proof supplied', sourceIds: [] });
const seal = value => api.sealBundle(value, hash);
async function rejects(value) { await assert.rejects(() => seal(value)); }
function setInitialConstraints(w, constraints) {
  w.request.constraints = clone(constraints);
  w.continuation.constraints = clone(constraints);
}

function retime(w) {
  let elapsed = 0;
  const instant = minutes => new Date(Math.round(Date.parse(w.continuation.startAt) + minutes * 60_000)).toISOString();
  w.stops.forEach((s, i) => {
    elapsed += w.legs[i].walkMinutes;
    s.arrivalAt = instant(elapsed);
    elapsed += s.visitMinutes;
    s.departureAt = instant(elapsed);
  });
  w.timing.walkMinutes = w.legs.reduce((n, l) => n + l.walkMinutes, 0);
  w.timing.distanceMeters = w.legs.reduce((n, l) => n + l.distanceMeters, 0);
  w.timing.visitMinutes = w.stops.reduce((n, s) => n + s.visitMinutes, 0);
  w.timing.reserveMinutes = api.initialReserveMinutes(w.continuation.budgetMinutes);
  w.timing.totalMinutes = w.timing.walkMinutes + w.timing.visitMinutes + w.timing.reserveMinutes;
  w.timing.endsAt = instant(w.timing.totalMinutes);
  return w;
}

async function nextRevision() {
  const parent = await seal(fixture());
  const { sha256: _digest, ...payload } = clone(parent);
  payload.revision = parent.revision + 1;
  payload.parentRevision = parent.revision;
  payload.parentHash = parent.sha256;
  return { parent, payload };
}

function childPayload(parent) {
  const { sha256: _digest, ...w } = clone(parent);
  w.revision = parent.revision + 1;
  w.parentRevision = parent.revision;
  w.parentHash = parent.sha256;
  return w;
}
const checkRevision = (parent, candidate, done = []) => api.validateRevisionAgainstParent(
  JSON.stringify(parent), JSON.stringify(candidate), hash, done,
);

test('review baseline remains valid, hash-verified and deeply immutable', async () => {
  const sealed = await seal(fixture());
  const result = await api.readBundle(JSON.stringify(sealed), hash);
  assert.equal(result.ok, true);
  assert.equal(result.bundle.sha256, sealed.sha256);
  assert.equal(Object.isFrozen(result.bundle.stops[0].anchor.coordinate), true);
  assert.throws(() => { result.bundle.stops[0].anchor.coordinate[0] = 3; }, TypeError);
  assert.equal('completedStopIds' in result.bundle.continuation, false);
  assert.equal('offlineReady' in result.bundle, false);
});

test('same public return ID cannot silently resolve to a different point', async () => {
  const w = fixture();
  const e = w.resolvedEnd.endpoint;
  e.coordinate = [0.00001, 0];
  e.graphPoint.coordinate = clone(e.coordinate);
  w.legs.at(-1).to = clone(e);
  w.legs.at(-1).geometry.coordinates[w.legs.at(-1).geometry.coordinates.length - 1] = clone(e.coordinate);
  await rejects(w);
});

test('same return anchor ID cannot remove the return by moving it onto the last stop', async () => {
  const w = fixture();
  w.resolvedEnd.endpoint.coordinate = clone(w.stops.at(-1).anchor.coordinate);
  w.resolvedEnd.endpoint.graphPoint.coordinate = clone(w.resolvedEnd.endpoint.coordinate);
  w.legs.pop();
  retime(w);
  await rejects(w);
});

test('verified connector must actually be traversed by the complete route geometry', async () => {
  const w = fixture();
  const e = w.legs[1].from;
  e.graphPoint.coordinate = [0.0005, 0.0005];
  e.snapDistanceM = 1;
  e.connector = { kind: 'verified', geometry: { type: 'LineString',
    coordinates: [clone(e.coordinate), clone(e.graphPoint.coordinate)] },
    distanceMeters: 1, walkMinutes: 0.1, sourceIds: ['fixture-source'],
    checkedAt: w.generatedAt, stepFree: unknown() };
  await rejects(w);
});

test('fractional source ETAs can be represented by millisecond ISO timestamps', async () => {
  const w = fixture();
  w.legs[1].walkMinutes += 0.000001;
  retime(w);
  const sealed = await seal(w);
  assert.equal(sealed.timing.walkMinutes, 4.000001);
  assert.equal(sealed.stops[1].arrivalAt, '2026-10-20T10:06:00.000Z');
});

test('a real missing minute is still rejected despite millisecond rounding tolerance', async () => {
  const w = fixture();
  w.stops[1].arrivalAt = '2026-10-20T10:05:00.000Z';
  w.stops[1].departureAt = '2026-10-20T10:09:00.000Z';
  await rejects(w);
});

test('a revision may contain only the remaining supported return leg and zero new visits', async () => {
  const { payload: w } = await nextRevision();
  const remaining = clone(w.legs.at(-1));
  remaining.fromId = 'origin';
  w.continuation.origin = clone(remaining.from);
  w.continuation.startAt = '2026-10-20T10:10:00.000Z';
  w.continuation.budgetMinutes = 20;
  w.stops = [];
  w.legs = [remaining];
  w.content.chapters = [];
  w.content.quests = [];
  w.content.collections = [];
  retime(w);
  const sealed = await seal(w);
  assert.equal(sealed.stops.length, 0);
  assert.equal(sealed.timing.visitMinutes, 0);
  assert.equal(sealed.timing.totalMinutes, 7);
  assert.deepEqual(sealed.resolvedEnd.endpoint, sealed.originalOrigin);
});

test('a new initial walk still cannot substitute a zero-visit return for an experience', async () => {
  const w = fixture();
  w.stops = [];
  w.legs = [{ kind: 'already_at_endpoint', id: 'empty', fromId: 'origin', toId: 'end',
    from: clone(w.continuation.origin), to: clone(w.resolvedEnd.endpoint), distanceMeters: 0, walkMinutes: 0 }];
  w.content.chapters = [];
  w.content.quests = [];
  w.content.collections = [];
  retime(w);
  await rejects(w);
});

test('step-free stops alone cannot certify unverified transitions', async () => {
  const w = fixture();
  setInitialConstraints(w, [{ kind: 'step_free_required' }]);
  w.stops.forEach(s => { s.access = fresh({ public: true, stepFree: 'verified', indoor: false }); });
  await rejects(w);
});

test('step-free constraint accepts fresh evidence at stops and every walk leg', async () => {
  const w = fixture();
  setInitialConstraints(w, [{ kind: 'step_free_required' }]);
  w.stops.forEach(s => { s.access = fresh({ public: true, stepFree: 'verified', indoor: false }); });
  w.legs.forEach(l => { if (l.kind === 'walk') l.stepFree = fresh(true); });
  const sealed = await seal(w);
  assert.equal(sealed.request.constraints[0].kind, 'step_free_required');
});

test('required coffee cannot be inferred from unknown service or a place title', async () => {
  const w = fixture();
  setInitialConstraints(w, [{ kind: 'coffee_required' }]);
  w.stops[0].title = { ru: 'Coffee', kk: 'Coffee', en: 'Coffee' };
  await rejects(w);
});

test('a known false coffee service does not satisfy the hard requirement', async () => {
  const w = fixture();
  setInitialConstraints(w, [{ kind: 'coffee_required' }]);
  w.stops.forEach(s => { s.services.coffee = fresh(false); });
  await rejects(w);
});

test('required coffee accepts positive fresh service evidence', async () => {
  const w = fixture();
  setInitialConstraints(w, [{ kind: 'coffee_required' }]);
  w.stops[0].services.coffee = fresh(true);
  w.stops[0].intent = 'indoor_visit';
  w.stops[0].access = fresh({ public: true, stepFree: 'unknown', indoor: true });
  w.stops[0].opening = fresh({ timeZone: w.timeZone, openIntervals: [
    { from: '2026-10-20T10:00:00.000Z', until: '2026-10-20T12:00:00.000Z' },
  ] });
  const sealed = await seal(w);
  assert.equal(sealed.stops[0].services.coffee.value, true);
});

test('coffee service evidence cannot substitute for a confirmed visit window', async () => {
  const w = fixture();
  setInitialConstraints(w, [{ kind: 'coffee_required' }]);
  w.stops[0].services.coffee = fresh(true);
  w.stops[0].access = fresh({ public: true, stepFree: 'unknown', indoor: true });
  w.stops[0].opening = fresh({ timeZone: w.timeZone, openIntervals: [
    { from: '2026-10-20T09:00:00.000Z', until: '2026-10-20T09:45:00.000Z' },
  ] });
  await rejects(w);
});

test('expired coffee evidence cannot certify the planned visit', async () => {
  const w = fixture();
  setInitialConstraints(w, [{ kind: 'coffee_required' }]);
  w.stops[0].services.coffee = { ...fresh(true), validUntil: '2026-10-20T09:59:00.000Z' };
  await rejects(w);
});

test('a future weather model or observation is not known current context', async () => {
  const w = fixture();
  w.context.weather = { state: 'known', value: { model: 'synthetic',
    updatedAt: '2027-01-01T10:00:00.000Z', retrievedAt: w.context.evaluatedAt,
    temperatureC: 0, windMetersPerSecond: 1 }, sourceIds: ['fixture-source'],
    observedAt: '2027-01-01T10:00:00.000Z', validUntil: '2027-01-01T11:00:00.000Z' };
  await rejects(w);
});

test('fresh dated synthetic weather remains representable', async () => {
  const w = fixture();
  w.context.weather = { ...fresh({ model: 'synthetic', updatedAt: '2026-10-20T09:50:00.000Z',
    retrievedAt: '2026-10-20T09:55:00.000Z', temperatureC: 0, windMetersPerSecond: 1 }),
    observedAt: '2026-10-20T09:55:00.000Z' };
  const sealed = await seal(w);
  assert.equal(sealed.context.weather.state, 'known');
});

test('progress identifiers remain outside immutable continuation content', async () => {
  const { payload: w } = await nextRevision();
  w.continuation.completedStopIds = ['invented-stop', 'invented-stop'];
  await rejects(w);
});

test('explicit extension proposal can exceed the original deadline without changing original intent', async () => {
  const { parent, payload: w } = await nextRevision();
  w.continuation.startAt = '2026-10-20T10:15:00.000Z';
  w.continuation.budgetMinutes = 45;
  w.continuation.timeTerms = { kind: 'extension_proposal',
    previousDeadlineAt: parent.continuation.timeTerms.deadlineAt,
    deadlineAt: '2026-10-20T11:00:00.000Z', requestId: 'explicit-extension-1' };
  retime(w);
  const sealed = await seal(w);
  assert.deepEqual(sealed.request, parent.request);
  assert.deepEqual(sealed.originalOrigin, parent.originalOrigin);
  assert.equal(sealed.continuation.timeTerms.kind, 'extension_proposal');
  assert.ok(Date.parse(sealed.timing.endsAt) > Date.parse(parent.continuation.timeTerms.deadlineAt));
  // This tests a proposal only; no session acceptance or consent is simulated.
});

test('the same overrun cannot be disguised as retaining the original deadline', async () => {
  const { payload: w } = await nextRevision();
  w.continuation.startAt = '2026-10-20T10:15:00.000Z';
  w.continuation.budgetMinutes = 30;
  retime(w);
  await rejects(w);
});

test('initial bundle cannot invent a pre-existing consented extension', async () => {
  const w = fixture();
  w.continuation.timeTerms = { kind: 'extension_proposal',
    previousDeadlineAt: '2026-10-20T10:30:00.000Z',
    deadlineAt: '2026-10-20T11:00:00.000Z', requestId: 'fake-initial-extension' };
  await rejects(w);
});

test('transport hash detects a changed fact before accepting its schema', async () => {
  const sealed = clone(await seal(fixture()));
  sealed.facts[0].statement.ru = 'Altered synthetic fact';
  const result = await api.readBundle(JSON.stringify(sealed), hash);
  assert.deepEqual(result, { ok: false, code: 'HASH_MISMATCH' });
});

test('canonical hashing ignores object key insertion order but preserves array order', () => {
  assert.equal(api.canonicalJson({ z: 1, a: { y: 2, b: 3 } }), api.canonicalJson({ a: { b: 3, y: 2 }, z: 1 }));
  assert.notEqual(api.canonicalJson(['a', 'b']), api.canonicalJson(['b', 'a']));
  assert.throws(() => api.canonicalJson('\uD800'));
  assert.equal(api.canonicalJson('Астана 🌆'), JSON.stringify('Астана 🌆'));
});

test('unsupported major is distinct from a corrupt existing-v1 payload', async () => {
  const sealed = clone(await seal(fixture()));
  sealed.schemaVersion = 2;
  const result = await api.readBundle(JSON.stringify(sealed), hash);
  assert.deepEqual(result, { ok: false, code: 'UNSUPPORTED_BUNDLE_VERSION' });
});

test('parent-aware extension validation derives consent from the actual later deadline', async () => {
  const { parent, payload: w } = await nextRevision();
  w.continuation.startAt = '2026-10-20T10:15:00.000Z';
  w.continuation.budgetMinutes = 45;
  w.continuation.timeTerms = { kind: 'extension_proposal',
    previousDeadlineAt: parent.continuation.timeTerms.deadlineAt,
    deadlineAt: '2026-10-20T11:00:00.000Z', requestId: 'extension-parent-check' };
  retime(w);
  const candidate = await seal(w);
  const result = await checkRevision(parent, candidate);
  assert.equal(result.ok, true);
  assert.equal(result.requiresConsent, true);
  assert.ok(result.reasons.includes('deadline_extension'));
});

test('later corrections retain an accepted parent extension without re-requesting it', async () => {
  const { parent, payload: w } = await nextRevision();
  w.continuation.startAt = '2026-10-20T10:15:00.000Z';
  w.continuation.budgetMinutes = 45;
  w.continuation.timeTerms = { kind: 'extension_proposal',
    previousDeadlineAt: parent.continuation.timeTerms.deadlineAt,
    deadlineAt: '2026-10-20T11:00:00.000Z', requestId: 'first-extension' };
  retime(w);
  const acceptedParent = await seal(w); // Assumed accepted by a separate Session transaction.
  const next = childPayload(acceptedParent);
  next.continuation.timeTerms = { kind: 'current_deadline', deadlineAt: '2026-10-20T11:00:00.000Z' };
  const corrected = await seal(next);
  assert.deepEqual(await checkRevision(acceptedParent, corrected), { ok: true, requiresConsent: false, reasons: [] });

  const extendedAgain = childPayload(corrected);
  extendedAgain.continuation.startAt = '2026-10-20T10:20:00.000Z';
  extendedAgain.continuation.budgetMinutes = 70;
  extendedAgain.continuation.timeTerms = { kind: 'extension_proposal',
    previousDeadlineAt: '2026-10-20T11:00:00.000Z', deadlineAt: '2026-10-20T11:30:00.000Z',
    requestId: 'second-extension' };
  retime(extendedAgain);
  const secondProposal = await seal(extendedAgain);
  const result = await checkRevision(corrected, secondProposal);
  assert.equal(result.ok, true);
  assert.equal(result.requiresConsent, true);
  assert.ok(result.reasons.includes('deadline_extension'));
  assert.deepEqual(secondProposal.request, parent.request);
  assert.deepEqual(secondProposal.originalOrigin, parent.originalOrigin);
});

test('current_deadline cannot silently grow even when the itinerary still fits', async () => {
  const { parent, payload: w } = await nextRevision();
  w.continuation.timeTerms.deadlineAt = '2026-10-20T10:31:00.000Z';
  const candidate = await seal(w);
  assert.deepEqual(await checkRevision(parent, candidate), { ok: false, code: 'DEADLINE_CHANGED_WITHOUT_PROPOSAL' });
});

test('a shorter selected window stays active and cannot silently grow on the next correction', async () => {
  const { parent, payload: w } = await nextRevision();
  w.continuation.budgetMinutes = 25;
  w.continuation.timeTerms = { kind: 'current_deadline', deadlineAt: '2026-10-20T10:25:00.000Z' };
  retime(w);
  const shortened = await seal(w);
  assert.deepEqual(await checkRevision(parent, shortened), { ok: true, requiresConsent: false, reasons: [] });
  const expanded = childPayload(shortened);
  expanded.continuation.budgetMinutes = 28;
  expanded.continuation.timeTerms.deadlineAt = '2026-10-20T10:28:00.000Z';
  retime(expanded);
  assert.deepEqual(await checkRevision(shortened, await seal(expanded)), { ok: false, code: 'DEADLINE_CHANGED_WITHOUT_PROPOSAL' });
});

test('an explicit extension may follow an earlier shortening while preserving the original request', async () => {
  const { parent, payload: w } = await nextRevision();
  w.continuation.budgetMinutes = 25;
  w.continuation.timeTerms = { kind: 'current_deadline', deadlineAt: '2026-10-20T10:25:00.000Z' };
  retime(w);
  const shortened = await seal(w);
  const extended = childPayload(shortened);
  extended.continuation.budgetMinutes = 28;
  extended.continuation.timeTerms = { kind: 'extension_proposal', previousDeadlineAt: '2026-10-20T10:25:00.000Z', deadlineAt: '2026-10-20T10:28:00.000Z', requestId: 'extend-shortened-window' };
  retime(extended);
  const candidate = await seal(extended);
  const result = await checkRevision(shortened, candidate);
  assert.equal(result.ok, true);
  assert.equal(result.requiresConsent, true);
  assert.ok(result.reasons.includes('deadline_extension'));
  assert.deepEqual(candidate.request, parent.request);
});

test('an older parent with slack deadline cannot erase its smaller selected time window', async () => {
  const { payload: w } = await nextRevision();
  w.continuation.budgetMinutes = 25;
  retime(w);
  const parent = await seal(w);
  const expanded = childPayload(parent);
  expanded.continuation.budgetMinutes = 28;
  retime(expanded);
  assert.deepEqual(await checkRevision(parent, await seal(expanded)), { ok: false, code: 'DEADLINE_CHANGED_WITHOUT_PROPOSAL' });
});

test('an extension must name the actual active parent deadline', async () => {
  const { parent, payload: w } = await nextRevision();
  w.continuation.timeTerms = { kind: 'extension_proposal',
    previousDeadlineAt: '2026-10-20T10:31:00.000Z', deadlineAt: '2026-10-20T11:00:00.000Z',
    requestId: 'wrong-previous-deadline' };
  const candidate = await seal(w);
  assert.deepEqual(await checkRevision(parent, candidate), { ok: false, code: 'DEADLINE_CHANGED_WITHOUT_PROPOSAL' });
});

test('a candidate for a different immutable parent cannot be validated as current', async () => {
  const { parent, payload: w } = await nextRevision();
  w.parentHash = 'b'.repeat(64);
  const candidate = await seal(w);
  assert.deepEqual(await checkRevision(parent, candidate), { ok: false, code: 'STALE_PARENT' });
});

test('the original request cannot be overwritten by revision preferences', async () => {
  const { parent, payload: w } = await nextRevision();
  w.request.interests = ['history'];
  const candidate = await seal(w);
  assert.deepEqual(await checkRevision(parent, candidate), { ok: false, code: 'ORIGINAL_TERMS_CHANGED' });
});

test('duplicate, fabricated or still-pending completed IDs are rejected against the parent', async () => {
  const { parent, payload: w } = await nextRevision();
  const candidate = await seal(w);
  for (const done of [['stop-0', 'stop-0'], ['fabricated-stop'], ['stop-0']]) {
    assert.deepEqual(await checkRevision(parent, candidate, done), { ok: false, code: 'INVALID_PROGRESS_CONTEXT' });
  }
});

test('removing an already completed stop preserves the agreed remaining experience', async () => {
  const { parent, payload: w } = await nextRevision();
  const completedId = w.stops[0].id;
  w.stops.shift();
  w.content.chapters.shift();
  w.content.quests.shift();
  w.legs.shift();
  w.legs[0].fromId = 'origin';
  w.continuation.origin = clone(w.legs[0].from);
  w.continuation.startAt = '2026-10-20T10:04:00.000Z';
  w.continuation.budgetMinutes = 26;
  retime(w);
  const candidate = await seal(w);
  assert.deepEqual(await checkRevision(parent, candidate, [completedId]), { ok: true, requiresConsent: false, reasons: [] });
  const withoutProgress = await checkRevision(parent, candidate);
  assert.equal(withoutProgress.ok, true);
  assert.equal(withoutProgress.requiresConsent, true);
  assert.ok(withoutProgress.reasons.includes('stops_changed'));
});

test('all completed visits can leave a return-only correction with unchanged original end', async () => {
  const { parent, payload: w } = await nextRevision();
  const done = w.stops.map(s => s.id);
  const remaining = clone(w.legs.at(-1));
  remaining.fromId = 'origin';
  w.continuation.origin = clone(remaining.from);
  w.continuation.startAt = '2026-10-20T10:10:00.000Z';
  w.continuation.budgetMinutes = 20;
  w.stops = [];
  w.legs = [remaining];
  w.content.chapters = [];
  w.content.quests = [];
  w.content.collections = [];
  retime(w);
  const candidate = await seal(w);
  assert.deepEqual(await checkRevision(parent, candidate, done), { ok: true, requiresConsent: false, reasons: [] });
});

test('initial effective constraints must match original declared intent', async () => {
  const w = fixture();
  w.continuation.constraints = [{ kind: 'max_distance_m', value: 500 }];
  await rejects(w);
});

test('revised effective constraints are represented separately and require consent', async () => {
  const { parent, payload: w } = await nextRevision();
  w.continuation.constraints = [{ kind: 'max_distance_m', value: 500 }];
  const candidate = await seal(w);
  assert.deepEqual(candidate.request.constraints, parent.request.constraints);
  const result = await checkRevision(parent, candidate);
  assert.equal(result.ok, true);
  assert.equal(result.requiresConsent, true);
  assert.ok(result.reasons.includes('constraints_changed'));

  const correction = await seal(childPayload(candidate));
  assert.deepEqual(await checkRevision(candidate, correction), { ok: true, requiresConsent: false, reasons: [] });
});

test('feasibility validates current constraints rather than only the original request', async () => {
  const { payload: w } = await nextRevision();
  w.continuation.constraints = [{ kind: 'max_distance_m', value: 100 }];
  await rejects(w);
});
