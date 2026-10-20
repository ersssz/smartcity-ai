const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const crypto = require('node:crypto');
const { test } = require('node:test');
const ts = require('../../../apps/mobile/node_modules/typescript');
function load(filename, cache = new Map()) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const m = new Module(filename, module); cache.set(filename, m);
  m.filename = filename; m.paths = Module._nodeModulePaths(path.dirname(filename));
  const nativeRequire = m.require.bind(m);
  m.require = id => id.startsWith('.') ? load(path.resolve(path.dirname(filename), id.replace(/\.js$/, '') + '.ts'), cache) : nativeRequire(id);
  m._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, filename);
  return m.exports;
}
const api = load(path.resolve(__dirname, '../src/index.ts'));
const contracts = load(path.resolve(__dirname, '../../contracts/src/index.ts'));
const { createCityEvidence } = load(path.resolve(__dirname, '../../city-evidence/src/index.ts'));
const hash = async text => crypto.createHash('sha256').update(text, 'utf8').digest('hex');
const at = '2026-10-20T12:00:00.000Z';
const request = () => ({ requestId: 'test-plan', locale: 'ru', origin: { kind: 'public_anchor', anchorId: 'bayterek-outdoor', explicitlyChosen: true }, startAt: at, budgetMinutes: 80, endRule: { kind: 'return_to_start' }, interests: ['architecture'], constraints: [], contextFlags: [] });
const planner = () => api.createReplayPlanner({ hash, now: () => at, id: () => 'recorded-plan-test' });

test('actual source search produces one honestly labeled, sealed three-chapter walk with its entire return budget', async () => {
  const reply = await planner().plan(request());
  assert.equal(reply.kind, 'candidates'); assert.equal(reply.bundles.length, 1);
  const bundle = reply.bundles[0];
  assert.equal(bundle.evidenceMode, 'real_catalog_replay'); assert.equal(bundle.content.origin, 'editorial');
  assert.deepEqual(bundle.stops.map(s => s.id), ['bayterek-outdoor', 'nurzhol-outdoor', 'round-square-outdoor']);
  assert.equal(bundle.legs[0].kind, 'already_at_endpoint');
  assert.deepEqual(bundle.resolvedEnd.endpoint.coordinate, bundle.originalOrigin.coordinate);
  assert.equal(bundle.timing.distanceMeters, 2212.2);
  assert.ok(Math.abs(bundle.timing.totalMinutes - 62.87) < 0.00001);
  assert.equal(bundle.timing.reserveMinutes, 8);
  assert.equal((await contracts.readBundle(JSON.stringify(bundle), hash)).ok, true);
  assert.ok(reply.omittedReasons.length > 0);
});

test('last-stop and explicitly selected end use actual paths and retain their exact selected endpoint', async () => {
  const r = request(); r.endRule = { kind: 'last_stop' };
  const last = await planner().plan(r); assert.equal(last.kind, 'candidates');
  assert.equal(last.bundles[0].timing.distanceMeters, 1106.1);
  assert.equal(last.bundles[0].resolvedEnd.stopId, 'round-square-outdoor');
  r.endRule = { kind: 'point', endpoint: { kind: 'public_anchor', anchorId: 'nurzhol-outdoor', explicitlyChosen: true } };
  const explicit = await planner().plan(r); assert.equal(explicit.kind, 'candidates');
  assert.ok(Math.abs(explicit.bundles[0].timing.distanceMeters - 1710.28) < 0.000001);
  assert.deepEqual(explicit.bundles[0].resolvedEnd.endpoint.requested, r.endRule.endpoint);
});

test('a tiny off-node origin is refused without moving it to a landmark', async () => {
  const r = request();
  const real = await planner().plan(r); r.origin = { kind: 'point', source: 'manual', coordinate: [...real.bundles[0].originalOrigin.coordinate] };
  const exact = await planner().plan(r); assert.equal(exact.kind, 'candidates');
  assert.deepEqual(exact.bundles[0].originalOrigin.requested, r.origin);
  r.origin.coordinate[0] += 0.0000001;
  const gap = await planner().plan(r); assert.equal(gap.kind, 'clarification');
  assert.equal(r.origin.coordinate[0], real.bundles[0].originalOrigin.coordinate[0] + 0.0000001);
});

test('short time, distance and unknown hard indoor/coffee/step-free conditions never produce a false feasible walk', async () => {
  const r = request(); r.budgetMinutes = 15;
  assert.equal((await planner().plan(r)).kind, 'no_feasible_walk');
  r.budgetMinutes = 80;
  for (const constraint of [{ kind: 'max_distance_m', value: 100 }, { kind: 'indoor_required' }, { kind: 'coffee_required' }, { kind: 'step_free_required' }]) {
    r.constraints = [constraint]; assert.equal((await planner().plan(r)).kind, 'no_feasible_walk');
  }
});

test('GPS freshness uses service time for both endpoints, including future starts', async () => {
  const baseline = await planner().plan(request());
  const coordinate = baseline.bundles[0].originalOrigin.coordinate;
  const r = request(); r.origin = { kind: 'point', source: 'gps', coordinate, accuracyM: 10, capturedAt: at };
  r.startAt = '2026-10-20T12:30:00.000Z';
  assert.equal((await planner().plan(r)).kind, 'candidates');
  const late = api.createReplayPlanner({ hash, now: () => '2026-10-20T18:00:00.000Z', id: () => 'late-test' });
  assert.equal((await late.plan(r)).kind, 'clarification');
  const e = request(); e.endRule = { kind: 'point', endpoint: { kind: 'point', source: 'gps', coordinate, accuracyM: 999, capturedAt: '2025-10-20T12:00:00.000Z' } };
  assert.equal((await planner().plan(e)).kind, 'clarification');
});

test('a revoked fact or changed source with the same ID cannot support the old editorial claim', async () => {
  const actual = createCityEvidence();
  const changed = { async search(q) { const result = await actual.search(q); result.facts.find(f => f.id === 'fact-tree-life').statement.ru = 'Synthetic withdrawn claim'; return result; } };
  const p = api.createReplayPlanner({ hash, now: () => at, id: () => 'changed-proof', evidence: changed });
  const reply = await p.plan(request()); assert.equal(reply.kind, 'no_feasible_walk');
  assert.equal(reply.reasons[0].code, 'NO_SUPPORTED_CONTENT');
});

test('a source outage or malformed request returns a bounded error without echoing input or discarding the caller object', async () => {
  const p = api.createReplayPlanner({ hash, now: () => at, id: () => 'outage', evidence: { async search() { throw new Error('not-for-public-output'); } } });
  assert.deepEqual(await p.plan(request()), { kind: 'unavailable', code: 'DATA_UNAVAILABLE' });
  const input = { ...request(), unsupported: 'do-not-echo-this' };
  const reply = await planner().plan(input);
  assert.equal(reply.kind, 'clarification'); assert.equal(JSON.stringify(reply).includes('do-not-echo-this'), false);
  assert.equal(input.unsupported, 'do-not-echo-this');
  const malformed = api.createReplayPlanner({ hash, now: () => at, id: () => 'bad-source', evidence: { async search() { return {}; } } });
  assert.deepEqual(await malformed.plan(request()), { kind: 'unavailable', code: 'DATA_UNAVAILABLE' });
});

test('after all visits a revision proposes the actual return alone, retaining the original origin and completed progress outside the bundle', async () => {
  const initial = await planner().plan(request()), parent = initial.bundles[0];
  const now = '2026-10-20T12:40:00.000Z';
  const p = api.createReplayPlanner({ hash, now: () => now, id: () => 'return-only-proposal' });
  const reply = await p.revise({ requestId: 'revise-return', parentBundle: parent, expectedRevision: 1, expectedHash: parent.sha256, from: { kind: 'public_anchor', anchorId: 'round-square-outdoor', explicitlyChosen: true }, now, remainingMinutes: 40, completedStopIds: parent.stops.map(s => s.id), constraints: [], reason: 'deviation' });
  assert.equal(reply.kind, 'revision_proposal'); assert.equal(reply.bundle.stops.length, 0);
  assert.equal(reply.bundle.legs.length, 1); assert.equal(reply.bundle.timing.distanceMeters, 1106.1);
  assert.deepEqual(reply.bundle.request, parent.request); assert.deepEqual(reply.bundle.originalOrigin, parent.originalOrigin);
  assert.equal(reply.requiresConsent, false); assert.equal(parent.revision, 1);
  assert.equal('completedStopIds' in reply.bundle.continuation, false);
  assert.equal((await contracts.readBundle(JSON.stringify(reply.bundle), hash)).ok, true);
});

test('explicit extension and changed active constraints require consent and never mutate the accepted parent', async () => {
  const initial = await planner().plan(request()), parent = initial.bundles[0];
  const now = '2026-10-20T12:20:00.000Z', before = JSON.stringify(parent);
  const p = api.createReplayPlanner({ hash, now: () => now, id: () => 'extended-proposal' });
  const input = { requestId: 'revise-extended', parentBundle: parent, expectedRevision: 1, expectedHash: parent.sha256, from: { kind: 'public_anchor', anchorId: 'nurzhol-outdoor', explicitlyChosen: true }, now, remainingMinutes: 100, completedStopIds: ['bayterek-outdoor'], constraints: [{ kind: 'max_distance_m', value: 5000 }], reason: 'user_change', proposedDeadlineAt: '2026-10-20T14:00:00.000Z' };
  const reply = await p.revise(input); assert.equal(reply.kind, 'revision_proposal'); assert.equal(reply.requiresConsent, true);
  assert.equal(reply.bundle.continuation.timeTerms.kind, 'extension_proposal');
  assert.deepEqual(reply.bundle.request.constraints, []); assert.deepEqual(reply.bundle.continuation.constraints, input.constraints);
  assert.equal(JSON.stringify(parent), before);
  input.expectedHash = '0'.repeat(64); assert.equal((await p.revise(input)).kind, 'clarification');
});

test('unknown warm-indoor revision, insufficient return budget and fabricated completion leave the previous walk intact', async () => {
  const initial = await planner().plan(request()), parent = initial.bundles[0];
  const now = '2026-10-20T12:40:00.000Z';
  const p = api.createReplayPlanner({ hash, now: () => now, id: () => 'failed-proposal' });
  const input = { requestId: 'revise-failure', parentBundle: parent, expectedRevision: 1, expectedHash: parent.sha256, from: { kind: 'public_anchor', anchorId: 'round-square-outdoor', explicitlyChosen: true }, now, remainingMinutes: 40, completedStopIds: parent.stops.map(s => s.id), constraints: [{ kind: 'indoor_required' }], reason: 'user_change' };
  assert.equal((await p.revise(input)).kind, 'no_feasible_walk');
  input.constraints = []; input.remainingMinutes = 5; assert.equal((await p.revise(input)).kind, 'no_feasible_walk');
  input.remainingMinutes = 40; input.completedStopIds = ['fabricated-stop']; assert.equal((await p.revise(input)).kind, 'clarification');
  assert.equal(parent.revision, 1); assert.equal(parent.stops.length, 3);
});

test('a shortened accepted window stays the active deadline and later growth requires an explicit matching extension', async () => {
  const parent = (await planner().plan(request())).bundles[0];
  let clock = '2026-10-20T12:40:00.000Z';
  const p = api.createReplayPlanner({ hash, now: () => clock, id: () => 'window-change' });
  const input = { requestId: 'short-window', parentBundle: parent, expectedRevision: 1, expectedHash: parent.sha256,
    from: { kind: 'public_anchor', anchorId: 'round-square-outdoor', explicitlyChosen: true }, now: clock,
    remainingMinutes: 25, completedStopIds: parent.stops.map(s => s.id), constraints: [], reason: 'user_change' };
  const first = await p.revise(input);
  assert.equal(first.kind, 'revision_proposal');
  assert.equal(first.bundle.continuation.timeTerms.deadlineAt, '2026-10-20T13:05:00.000Z');
  clock = '2026-10-20T12:43:00.000Z';
  const next = { ...input, requestId: 'later-correction', parentBundle: first.bundle,
    expectedRevision: first.bundle.revision, expectedHash: first.bundle.sha256, now: clock,
    remainingMinutes: 37, completedStopIds: [], reason: 'deviation' };
  const unproposed = await p.revise(next);
  assert.equal(unproposed.kind, 'clarification');
  const mismatched = await p.revise({ ...next, proposedDeadlineAt: '2026-10-20T13:30:00.000Z' });
  assert.equal(mismatched.kind, 'clarification');
  const extension = await p.revise({ ...next, proposedDeadlineAt: '2026-10-20T13:20:00.000Z' });
  assert.equal(extension.kind, 'revision_proposal');
  assert.equal(extension.bundle.continuation.timeTerms.previousDeadlineAt, '2026-10-20T13:05:00.000Z');
  assert.equal(extension.requiresConsent, true);
  assert.equal(parent.continuation.timeTerms.deadlineAt, '2026-10-20T13:20:00.000Z');
});

test('valid-hash parent text cannot replace the approved pending editorial chapter, quest or cue', async () => {
  const parent = (await planner().plan(request())).bundles[0];
  const { sha256: _hash, ...payload } = structuredClone(parent);
  payload.content.chapters[2].blocks.find(b => b.kind === 'fact').text.ru = 'Synthetic unsupported parent chapter';
  payload.content.quests[2].question.ru = 'Synthetic unsupported parent question';
  payload.content.cues.complete.text.ru = 'Synthetic unsupported parent cue';
  payload.theme.explanation.text.ru = 'Synthetic unsupported theme claim';
  payload.theme.title.ru = 'Synthetic unsupported theme title';
  payload.stops[2].title.ru = 'Synthetic unsupported stop title';
  payload.stops[2].anchor.fieldVerified = true;
  const altered = await contracts.sealBundle(payload, hash);
  const now = '2026-10-20T12:40:00.000Z';
  const p = api.createReplayPlanner({ hash, now: () => now, id: () => 'approved-content-revision' });
  const reply = await p.revise({ requestId: 'approved-copy', parentBundle: altered,
    expectedRevision: altered.revision, expectedHash: altered.sha256,
    from: { kind: 'public_anchor', anchorId: 'round-square-outdoor', explicitlyChosen: true }, now,
    remainingMinutes: 40, completedStopIds: ['bayterek-outdoor', 'nurzhol-outdoor'], constraints: [], reason: 'deviation' });
  assert.equal(reply.kind, 'revision_proposal');
  assert.deepEqual(reply.bundle.content.chapters[0], parent.content.chapters[2]);
  assert.deepEqual(reply.bundle.content.quests[0], parent.content.quests[2]);
  assert.deepEqual(reply.bundle.content.cues, parent.content.cues);
  assert.deepEqual(reply.bundle.theme, parent.theme);
  assert.equal(reply.changes.themeChanged, true);
  assert.deepEqual(reply.bundle.stops[0].title, parent.stops[2].title);
  assert.equal(reply.bundle.stops[0].anchor.fieldVerified, false);
  assert.equal(JSON.stringify(reply).includes('Synthetic unsupported'), false);
});

test('revised current context and fact provenance receive their relevant source closure', async () => {
  const parent = (await planner().plan(request())).bundles[0];
  const before = JSON.stringify(parent), now = '2026-10-20T12:40:00.000Z';
  const actual = createCityEvidence();
  const refreshed = { async search(q) {
    const result = await actual.search(q);
    result.facts.find(f => f.id === 'fact-tree-life').checkedAt = now;
    result.sources.find(s => s.id === 'src-baiterek').checkedAt = now;
    result.sources.push({ id: 'synthetic-weather', title: 'Synthetic current weather source',
      url: 'https://example.invalid/weather', checkedAt: now, rights: 'CC0 synthetic fixture' });
    result.sources.push({ id: 'synthetic-unused', title: 'Unrelated synthetic source',
      url: 'https://example.invalid/unrelated', checkedAt: now, rights: 'CC0 synthetic fixture' });
    result.context.weather = { state: 'known', value: { model: 'synthetic', updatedAt: '2026-10-20T12:35:00.000Z',
      retrievedAt: now, temperatureC: 0, windMetersPerSecond: 1 }, sourceIds: ['synthetic-weather'],
      observedAt: now, validUntil: '2026-10-20T13:00:00.000Z' };
    return result;
  } };
  const p = api.createReplayPlanner({ hash, now: () => now, id: () => 'fresh-evidence-proposal', evidence: refreshed });
  const reply = await p.revise({ requestId: 'refresh-context', parentBundle: parent, expectedRevision: 1,
    expectedHash: parent.sha256, from: { kind: 'public_anchor', anchorId: 'round-square-outdoor', explicitlyChosen: true },
    now, remainingMinutes: 40, completedStopIds: parent.stops.map(s => s.id), constraints: [], reason: 'deviation' });
  assert.equal(reply.kind, 'revision_proposal');
  assert.equal(reply.bundle.context.weather.state, 'known');
  assert.ok(reply.bundle.sources.some(s => s.id === 'synthetic-weather'));
  assert.equal(reply.bundle.sources.some(s => s.id === 'synthetic-unused'), false);
  assert.equal(reply.bundle.facts.find(f => f.id === 'fact-tree-life').checkedAt, now);
  assert.equal(reply.bundle.sources.find(s => s.id === 'src-baiterek').checkedAt, now);
  assert.equal((await contracts.readBundle(JSON.stringify(reply.bundle), hash)).ok, true);
  assert.equal(JSON.stringify(parent), before);
});
