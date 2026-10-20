// Pure progression behavior with simulated content; no device, GPS or route acceptance.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');
const { walk } = require('./walkFixture.cjs');

function loadTypeScript(filename, cache = new Map()) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const loaded = new Module(filename, module);
  cache.set(filename, loaded);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const requireNative = loaded.require.bind(loaded);
  loaded.require = (id) => id.startsWith('.')
    ? loadTypeScript(path.resolve(path.dirname(filename), `${id}.ts`), cache)
    : requireNative(id);
  loaded._compile(compiled, filename);
  return loaded.exports;
}
const engine = loadTypeScript(path.resolve(__dirname, '../src/walk/engine.ts'));
loadTypeScript(path.resolve(__dirname, '../src/walk/model.ts')).EditorialWalkSchema.parse(walk);
const now = '2026-10-20T12:00:00.000Z';
const activeSession = () => engine.transition(walk, engine.createSession(walk, 'session-1', now), { type: 'start' }, now);
const act = (session, action) => engine.transition(walk, session, action, now);
const rejects = (run, code) => assert.throws(run, (error) => error instanceof engine.WalkError && error.code === code);

test('a prepared walk creates a ready session without marking visits or starting tracking', () => {
  const session = engine.createSession(walk, 'session-1', now);
  assert.equal(session.phase, 'ready');
  assert.equal(session.currentStopIndex, 0);
  assert.equal(session.startedAt, null);
  assert.deepEqual(session.manualStopIds, []);
  assert.deepEqual(session.completedStopIds, []);
  assert.deepEqual(engine.getDiscovery(walk, session), { earned: false, completed: 0, skipped: 0, proof: 'manual' });
});

test('Start, pause and explicit resume preserve progress and the original start time', () => {
  const prepared = engine.createSession(walk, 'session-1', now);
  const started = engine.transition(walk, prepared, { type: 'start' }, now);
  assert.equal(started.phase, 'active');
  assert.equal(started.startedAt, now);
  assert.equal(prepared.phase, 'ready');
  const pausedAt = '2026-10-20T12:01:00.000Z';
  const paused = engine.transition(walk, started, { type: 'pause' }, pausedAt);
  assert.equal(paused.phase, 'paused');
  assert.deepEqual(engine.transition(walk, paused, { type: 'pause' }, pausedAt), paused);
  const resumed = engine.transition(walk, paused, { type: 'resume' }, '2026-10-20T12:02:00.000Z');
  assert.equal(resumed.phase, 'active');
  assert.equal(resumed.startedAt, now);
  assert.equal(resumed.currentStopIndex, 0);
});

test('a manual visit unlocks its quest, a wrong answer stays here, and a correct answer waits for Continue', () => {
  let session = activeSession();
  rejects(() => act(session, { type: 'answer', stopId: 'one', choiceId: 'yes' }), 'VISIT_REQUIRED');
  session = act(session, { type: 'mark_stop', stopId: 'one' });
  session = act(session, { type: 'mark_stop', stopId: 'one' });
  assert.deepEqual(session.manualStopIds, ['one']);
  session = act(session, { type: 'answer', stopId: 'one', choiceId: 'no' });
  assert.deepEqual(session.answers.one, { choiceId: 'no', correct: false });
  assert.deepEqual(session.completedStopIds, []);
  assert.equal(session.currentStopIndex, 0);
  session = act(session, { type: 'answer', stopId: 'one', choiceId: 'yes' });
  session = act(session, { type: 'answer', stopId: 'one', choiceId: 'yes' });
  assert.deepEqual(session.completedStopIds, ['one']);
  assert.equal(session.currentStopIndex, 0);
  assert.deepEqual(engine.getDiscovery(walk, session), { earned: false, completed: 1, skipped: 0, proof: 'manual' });
});

test('completing every quest begins the return leg; only manual return confirmation earns the discovery', () => {
  let session = activeSession();
  rejects(() => act(session, { type: 'continue', stopId: 'one' }), 'QUEST_REQUIRED');
  for (const stopId of ['one', 'two', 'three']) {
    session = act(session, { type: 'mark_stop', stopId });
    session = act(session, { type: 'answer', stopId, choiceId: 'yes' });
    assert.equal(engine.getDiscovery(walk, session).earned, false);
    session = act(session, { type: 'continue', stopId });
  }
  assert.equal(session.phase, 'active');
  assert.equal(session.currentStopIndex, 3);
  assert.deepEqual(engine.getDiscovery(walk, session), { earned: false, completed: 3, skipped: 0, proof: 'manual' });
  session = act(session, { type: 'confirm_return' });
  assert.equal(session.phase, 'completed');
  assert.deepEqual(engine.getDiscovery(walk, session), { earned: true, completed: 3, skipped: 0, proof: 'manual' });
  assert.deepEqual(session.manualStopIds, ['one', 'two', 'three']);
  assert.equal('latitude' in session, false);
});

test('skipping an unfinished stop preserves earlier answers but cannot earn the full discovery', () => {
  let session = activeSession();
  session = act(session, { type: 'mark_stop', stopId: 'one' });
  session = act(session, { type: 'answer', stopId: 'one', choiceId: 'yes' });
  rejects(() => act(session, { type: 'skip', stopId: 'one' }), 'INVALID_STATE');
  session = act(session, { type: 'continue', stopId: 'one' });
  session = act(session, { type: 'mark_stop', stopId: 'two' });
  session = act(session, { type: 'answer', stopId: 'two', choiceId: 'no' });
  session = act(session, { type: 'skip', stopId: 'two' });
  session = act(session, { type: 'skip', stopId: 'three' });
  assert.equal(session.phase, 'active');
  assert.equal(session.currentStopIndex, 3);
  session = act(session, { type: 'confirm_return' });
  assert.equal(session.phase, 'completed');
  assert.deepEqual(session.completedStopIds, ['one']);
  assert.deepEqual(session.skippedStopIds, ['two', 'three']);
  assert.deepEqual(session.answers.two, { choiceId: 'no', correct: false });
  assert.deepEqual(engine.getDiscovery(walk, session), { earned: false, completed: 1, skipped: 2, proof: 'manual' });
});

test('completed answers cannot be overwritten and stale or future commands cannot fast-forward progress', () => {
  let session = activeSession();
  rejects(() => act(session, { type: 'mark_stop', stopId: 'two' }), 'NOT_CURRENT_STOP');
  session = act(session, { type: 'mark_stop', stopId: 'one' });
  rejects(() => act(session, { type: 'answer', stopId: 'one', choiceId: 'unknown' }), 'UNKNOWN_CHOICE');
  session = act(session, { type: 'answer', stopId: 'one', choiceId: 'yes' });
  rejects(() => act(session, { type: 'answer', stopId: 'one', choiceId: 'no' }), 'INVALID_STATE');
  session = act(session, { type: 'continue', stopId: 'one' });
  for (const action of [
    { type: 'mark_stop', stopId: 'one' }, { type: 'answer', stopId: 'one', choiceId: 'yes' },
    { type: 'continue', stopId: 'one' }, { type: 'skip', stopId: 'one' },
  ]) rejects(() => act(session, action), 'NOT_CURRENT_STOP');
  const paused = act(session, { type: 'pause' });
  rejects(() => act(paused, { type: 'mark_stop', stopId: 'two' }), 'INVALID_STATE');
  rejects(() => act(session, { type: 'start' }), 'INVALID_STATE');
  assert.equal(session.currentStopIndex, 1);
  assert.deepEqual(session.completedStopIds, ['one']);
});

test('saved snapshots round-trip without resuming and reject a different walk, revision or malformed record', () => {
  const prepared = engine.createSession(walk, 'session-1', now);
  assert.deepEqual(engine.validateSession(walk, JSON.parse(JSON.stringify(prepared))), prepared);
  const paused = act(act(activeSession(), { type: 'mark_stop', stopId: 'one' }), { type: 'pause' });
  const restored = engine.validateSession(walk, JSON.parse(JSON.stringify(paused)));
  assert.deepEqual(restored, paused);
  assert.equal(restored.phase, 'paused');
  for (const corrupt of [
    null, {}, { ...paused, walkId: 'other-walk' }, { ...paused, walkRevision: 2 },
    { ...paused, manualStopIds: ['one', 'one'] }, { ...paused, updatedAt: 'not-a-date' },
    { ...paused, latitude: 51 },
  ]) rejects(() => engine.validateSession(walk, corrupt), 'INVALID_SESSION');
});

test('restore rejects foreign or future visits, forged answers, overlapping skips and unexplained progress', () => {
  const started = activeSession();
  const completedOne = act(act(started, { type: 'mark_stop', stopId: 'one' }), { type: 'answer', stopId: 'one', choiceId: 'yes' });
  const corruptions = [
    { ...started, manualStopIds: ['foreign'] },
    { ...started, manualStopIds: ['three'] },
    { ...started, currentStopIndex: 2 },
    { ...started, completedStopIds: ['one'] },
    { ...started, skippedStopIds: ['one'] },
    { ...completedOne, answers: { one: { choiceId: 'no', correct: true } } },
    { ...completedOne, answers: { one: { choiceId: 'foreign', correct: true } } },
    { ...completedOne, answers: { one: { choiceId: 'yes', correct: false } } },
    { ...completedOne, answers: {} },
    { ...completedOne, skippedStopIds: ['one'] },
    { ...completedOne, answers: { ...completedOne.answers, two: { choiceId: 'yes', correct: true } } },
    { ...completedOne, answers: { ...completedOne.answers, foreign: { choiceId: 'yes', correct: true } } },
  ];
  for (const corrupt of corruptions) rejects(() => engine.validateSession(walk, corrupt), 'INVALID_SESSION');
  assert.deepEqual(engine.validateSession(walk, completedOne), completedOne);
});

test('restore requires a valid phase cursor and start time rather than treating arbitrary records as completion', () => {
  const ready = engine.createSession(walk, 'session-1', now);
  const active = activeSession();
  for (const corrupt of [
    { ...ready, startedAt: now },
    { ...ready, manualStopIds: ['one'] },
    { ...active, startedAt: null },
    { ...active, startedAt: 'not-a-date' },
    { ...active, currentStopIndex: 3 },
    { ...active, currentStopIndex: 999999999 },
    { ...active, phase: 'completed' },
    { ...active, phase: 'paused', currentStopIndex: 3 },
  ]) rejects(() => engine.validateSession(walk, corrupt), 'INVALID_SESSION');
  let finished = active;
  for (const stopId of ['one', 'two', 'three']) finished = act(finished, { type: 'skip', stopId });
  assert.deepEqual(engine.validateSession(walk, finished), finished);
});

test('callers cannot bypass restore validation when creating, advancing or displaying a discovery', () => {
  rejects(() => engine.createSession(walk, '', now), 'INVALID_SESSION');
  rejects(() => engine.createSession(walk, 'session-1', 'tomorrow'), 'INVALID_SESSION');
  const invalid = { ...activeSession(), completedStopIds: ['one', 'two', 'three'], phase: 'completed', currentStopIndex: 3 };
  rejects(() => engine.getDiscovery(walk, invalid), 'INVALID_SESSION');
  rejects(() => act({ ...activeSession(), walkRevision: 99 }, { type: 'mark_stop', stopId: 'one' }), 'INVALID_SESSION');
  rejects(() => engine.transition(walk, activeSession(), { type: 'mark_stop', stopId: 'one' }, 'not-a-date'), 'INVALID_STATE');
});

test('the return leg survives pause and restoration, and premature or repeated return confirmation cannot finish it', () => {
  let session = activeSession();
  rejects(() => act(session, { type: 'confirm_return' }), 'INVALID_STATE');
  for (const stopId of ['one', 'two', 'three']) session = act(session, { type: 'skip', stopId });
  session = act(session, { type: 'pause' });
  assert.equal(session.currentStopIndex, 3);
  assert.equal(session.phase, 'paused');
  session = engine.validateSession(walk, JSON.parse(JSON.stringify(session)));
  rejects(() => act(session, { type: 'confirm_return' }), 'INVALID_STATE');
  session = act(session, { type: 'resume' });
  assert.equal(session.phase, 'active');
  rejects(() => act(session, { type: 'continue', stopId: 'three' }), 'NOT_CURRENT_STOP');
  session = act(session, { type: 'confirm_return' });
  assert.equal(session.phase, 'completed');
  assert.equal(engine.getDiscovery(walk, session).earned, false);
  rejects(() => act(session, { type: 'confirm_return' }), 'INVALID_STATE');
});
