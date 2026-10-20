// Real SQLite and the compiled public contracts/planner. No device or GPS acceptance.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const Module = require('node:module');
const { DatabaseSync } = require('node:sqlite');
const { test, before } = require('node:test');
const ts = require(path.resolve(__dirname, '../../node_modules/typescript'));
let createReplayPlanner, compiledContracts, api;
const hash = async value => crypto.createHash('sha256').update(value, 'utf8').digest('hex');
const at = '2026-10-20T12:00:00.000Z';
function load(filename, cache = new Map()) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const m = new Module(filename, module); cache.set(filename, m);
  m.filename = filename; m.paths = Module._nodeModulePaths(path.dirname(filename));
  const native = m.require.bind(m);
  m.require = id => id === '@astanaai/contracts' ? compiledContracts : id.startsWith('.') ? load(path.resolve(path.dirname(filename), id.replace(/\.js$/, '') + '.ts'), cache) : native(id);
  m._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, filename);
  return m.exports;
}
before(async () => {
  compiledContracts = await import('@astanaai/contracts');
  ({ createReplayPlanner } = await import('@astanaai/walk-planner'));
  api = load(path.join(__dirname, 'session.ts'));
});
async function actualBundle(id = 'canonical-session-real-walk', endRule = { kind: 'return_to_start' }) {
  const result = await createReplayPlanner({ hash, now: () => at, id: () => id }).plan({ requestId: `${id}-request`, locale: 'ru',
    origin: { kind: 'public_anchor', anchorId: 'bayterek-outdoor', explicitlyChosen: true }, startAt: at,
    budgetMinutes: 80, endRule, interests: ['architecture'], constraints: [], contextFlags: [] });
  assert.equal(result.kind, 'candidates');
  return result.bundles[0];
}
function sqliteAdapter(filename = ':memory:') {
  const sql = new DatabaseSync(filename);
  return { sql, db: {
    async execAsync(statement) { sql.exec(statement); },
    async getFirstAsync(statement, ...params) { return sql.prepare(statement).get(...params) ?? null; },
    async getAllAsync(statement, ...params) { return sql.prepare(statement).all(...params); },
    async runAsync(statement, ...params) { return sql.prepare(statement).run(...params); },
    async withTransactionAsync(task) { sql.exec('BEGIN IMMEDIATE'); try { await task(); sql.exec('COMMIT'); } catch (error) { sql.exec('ROLLBACK'); throw error; } },
  } };
}
let nextId = 0;
const deps = () => ({ hash, now: () => at, nextSessionId: () => `canonical-session-${++nextId}` });

test('reading can finish a walk without fabricated answers, physical visits or a collection', async t => {
  const store = sqliteAdapter(); t.after(() => store.sql.close());
  const repo = api.createCanonicalWalkSession(store.db, deps());
  let view = await repo.open(await actualBundle('reading-only-walk'));
  let sequence = 0;
  const send = async action => view = await repo.dispatch({ eventId: `read-${++sequence}`, expectedVersion: view.session.version, action });
  await send({ type: 'start' });
  for (const stop of view.bundle.stops) {
    const command = { eventId: `read-${++sequence}`, expectedVersion: view.session.version, action: { type: 'read_story', stopId: stop.id } };
    view = await repo.dispatch(command);
    assert.deepEqual(await repo.dispatch(command), view, 'a repeated tap is idempotent');
  }
  await send({ type: 'confirm_end' });
  assert.equal(view.session.phase, 'completed');
  assert.deepEqual(view.session.readStopIds, view.bundle.stops.map(stop => stop.id));
  assert.deepEqual(view.session.completedStopIds, []);
  assert.deepEqual(view.session.manualStopIds, []);
  assert.deepEqual(view.session.answers, {});
  assert.deepEqual(view.discoveries, []);
  assert.deepEqual(await api.createCanonicalWalkSession(store.db, deps()).open(view.session.sessionId), view);
});

test('reading requires the current active chapter and old saved v2 progress remains readable', async t => {
  const store = sqliteAdapter(); t.after(() => store.sql.close());
  const repo = api.createCanonicalWalkSession(store.db, deps());
  let view = await repo.open(await actualBundle('reading-guards'));
  const id = view.session.sessionId;
  const old = { ...view.session }; delete old.readStopIds;
  store.sql.prepare('UPDATE canonical_sessions SET session_json = ? WHERE session_id = ?').run(JSON.stringify(old), id);
  view = await repo.open(id);
  assert.deepEqual(view.session.readStopIds, []);
  await assert.rejects(repo.dispatch({ eventId: 'before-start', expectedVersion: view.session.version, action: { type: 'read_story', stopId: view.bundle.stops[0].id } }), e => e.code === 'INVALID_STATE');
  view = await repo.dispatch({ eventId: 'start-reading', expectedVersion: view.session.version, action: { type: 'start' } });
  await assert.rejects(repo.dispatch({ eventId: 'future-reading', expectedVersion: view.session.version, action: { type: 'read_story', stopId: view.bundle.stops[1].id } }), e => e.code === 'NOT_CURRENT_STOP');
  view = await repo.dispatch({ eventId: 'pause-reading', expectedVersion: view.session.version, action: { type: 'pause' } });
  await assert.rejects(repo.dispatch({ eventId: 'paused-reading', expectedVersion: view.session.version, action: { type: 'read_story', stopId: view.bundle.stops[0].id } }), e => e.code === 'INVALID_STATE');
});

test('a real canonical bundle opens prepared once and coexists with readable legacy progress', async t => {
  const store = sqliteAdapter(); t.after(() => store.sql.close());
  const legacy = load(path.resolve(__dirname, '../walk/repository.ts')).createWalkRepository;
  const { walk } = require('../../tests/walkFixture.cjs');
  const old = legacy(store.db, { now: () => at, nextSessionId: () => 'legacy-session' });
  const oldSnapshot = await old.load(walk);
  const session = api.createCanonicalWalkSession(store.db, deps());
  assert.equal(await session.getCurrentSessionId(), null);
  const bundle = await actualBundle();
  const opened = await session.open(bundle);
  assert.equal(opened.session.schemaVersion, 2);
  assert.equal(opened.session.phase, 'prepared');
  assert.equal(opened.session.version, 0);
  assert.equal(opened.session.bundleHash, bundle.sha256);
  assert.equal(opened.session.bundleRevision, 1);
  assert.equal(opened.session.currentStopIndex, 0);
  assert.deepEqual(opened.session.manualStopIds, []);
  assert.deepEqual(opened.discoveries, []);
  assert.deepEqual((await session.open(bundle)), opened);
  assert.equal(await session.getCurrentSessionId(), opened.session.sessionId);
  assert.deepEqual(await session.snapshot(), opened);
  assert.deepEqual(await legacy(store.db, { now: () => at, nextSessionId: () => 'unneeded' }).load(walk), oldSnapshot);
});

test('a complete manual story has explicit end confirmation and exactly one durable manual collection', async t => {
  const store = sqliteAdapter(); t.after(() => store.sql.close());
  const session = api.createCanonicalWalkSession(store.db, deps());
  let view = await session.open(await actualBundle('complete-story'));
  let event = 0;
  const send = async action => { view = await session.dispatch({ eventId: `story-${++event}`, expectedVersion: view.session.version, action }); return view; };
  await send({ type: 'start' });
  assert.equal(view.session.phase, 'active');
  assert.equal(view.session.startedAt, at);
  for (const stop of view.bundle.stops) {
    await send({ type: 'mark_stop', stopId: stop.id });
    const quest = view.bundle.content.quests.find(q => q.id === stop.questId);
    await send({ type: 'answer', stopId: stop.id, choiceId: quest.correctChoiceId });
    await send({ type: 'continue', stopId: stop.id });
  }
  assert.equal(view.session.currentStopIndex, 3);
  assert.equal(view.session.phase, 'active');
  assert.deepEqual(view.discoveries, []);
  const finish = { eventId: 'story-final', expectedVersion: view.session.version, action: { type: 'confirm_end' } };
  view = await session.dispatch(finish);
  assert.equal(view.session.phase, 'completed');
  assert.equal(view.session.version, 11);
  assert.equal(view.session.completedStopIds.length, 3);
  assert.equal(view.discoveries.length, 1);
  assert.equal(view.discoveries[0].proof, 'manual_reported');
  assert.deepEqual(view.discoveries[0].title, view.bundle.content.collections[0].title);
  assert.deepEqual(await session.dispatch(finish), view);
  assert.deepEqual(await api.createCanonicalWalkSession(store.db, deps()).open(view.session.sessionId), view);
});

test('a new database connection safely restores committed active progress paused without resetting answers', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'astana-canonical-session-'));
  const filename = path.join(directory, 'walks.sqlite');
  let store = sqliteAdapter(filename);
  t.after(() => { store.sql.close(); assert.equal(path.dirname(directory), os.tmpdir()); assert.ok(path.basename(directory).startsWith('astana-canonical-session-')); fs.rmSync(directory, { recursive: true, force: true }); });
  const first = api.createCanonicalWalkSession(store.db, deps());
  let view = await first.open(await actualBundle('restore-real-walk'));
  const stop = view.bundle.stops[0], quest = view.bundle.content.quests.find(q => q.id === stop.questId);
  for (const [eventId, action] of [['start', { type: 'start' }], ['mark', { type: 'mark_stop', stopId: stop.id }], ['answer', { type: 'answer', stopId: stop.id, choiceId: quest.correctChoiceId }], ['continue', { type: 'continue', stopId: stop.id }]]) {
    view = await first.dispatch({ eventId, expectedVersion: view.session.version, action });
  }
  store.sql.close(); store = sqliteAdapter(filename);
  const restored = api.createCanonicalWalkSession(store.db, { ...deps(), now: () => '2026-10-20T12:10:00.000Z' });
  assert.equal(await restored.getCurrentSessionId(), view.session.sessionId);
  const paused = await restored.open(view.session.sessionId);
  assert.equal(paused.session.phase, 'paused');
  assert.equal(paused.session.version, view.session.version + 1);
  assert.equal(paused.session.currentStopIndex, 1);
  assert.deepEqual(paused.session.answers, view.session.answers);
  assert.deepEqual(paused.session.completedStopIds, [stop.id]);
  assert.deepEqual(paused.session.manualStopIds, [stop.id]);
  assert.equal(paused.session.startedAt, at);
  assert.deepEqual(await restored.snapshot(), paused);
  assert.deepEqual(await restored.open(view.session.sessionId), paused);
  const resumed = await restored.dispatch({ eventId: 'explicit-resume', expectedVersion: paused.session.version, action: { type: 'resume' } });
  assert.equal(resumed.session.phase, 'active');
  assert.equal(resumed.session.currentStopIndex, 1);
});

test('independent connections reject stale commands and event ID substitution without replaying an old projection over a pause', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'astana-canonical-cas-'));
  const firstDb = sqliteAdapter(path.join(directory, 'walks.sqlite')), secondDb = sqliteAdapter(path.join(directory, 'walks.sqlite'));
  t.after(() => { firstDb.sql.close(); secondDb.sql.close(); assert.equal(path.dirname(directory), os.tmpdir()); assert.ok(path.basename(directory).startsWith('astana-canonical-cas-')); fs.rmSync(directory, { recursive: true, force: true }); });
  const first = api.createCanonicalWalkSession(firstDb.db, deps()), second = api.createCanonicalWalkSession(secondDb.db, deps());
  const bundle = await actualBundle('two-connection-walk');
  await first.open(bundle); await second.open(bundle);
  const start = { eventId: 'same-start', expectedVersion: 0, action: { type: 'start' } };
  const started = await first.dispatch(start);
  await assert.rejects(() => second.dispatch({ eventId: 'stale-pause', expectedVersion: 0, action: { type: 'pause' } }), { code: 'STALE_VERSION' });
  const paused = await second.dispatch({ eventId: 'fresh-pause', expectedVersion: 1, action: { type: 'pause' } });
  await assert.rejects(() => first.dispatch({ eventId: 'stale-resume', expectedVersion: 1, action: { type: 'resume' } }), { code: 'STALE_VERSION' });
  assert.deepEqual(await first.snapshot(), paused);
  assert.deepEqual(await first.dispatch(start), started);
  assert.deepEqual(await first.snapshot(), paused);
  await assert.rejects(() => first.dispatch({ ...start, action: { type: 'resume' } }), { code: 'EVENT_CONFLICT' });
  await assert.rejects(() => first.dispatch({ ...start, expectedVersion: 2 }), { code: 'EVENT_CONFLICT' });
  assert.equal((await first.snapshot()).session.phase, 'paused');
});

test('an actual SQLite event-write failure rolls back projection and can be retried using the same event', async t => {
  const store = sqliteAdapter(); t.after(() => store.sql.close());
  const session = api.createCanonicalWalkSession(store.db, deps());
  const prepared = await session.open(await actualBundle('write-failure'));
  store.sql.exec("CREATE TEMP TRIGGER controlled_event_failure BEFORE INSERT ON canonical_events BEGIN SELECT RAISE(ABORT, 'controlled synthetic storage fault'); END");
  const command = { eventId: 'retry-start', expectedVersion: 0, action: { type: 'start' } };
  await assert.rejects(() => session.dispatch(command), { code: 'WRITE_FAILED', message: 'WRITE_FAILED' });
  assert.deepEqual(await session.snapshot(), prepared);
  store.sql.exec('DROP TRIGGER controlled_event_failure');
  const committed = await session.dispatch(command);
  assert.equal(committed.session.phase, 'active');
  assert.equal(committed.session.version, 1);
  assert.deepEqual(await session.dispatch(command), committed);
});

test('reading, manual visit, correct quest and explicit end remain separate user actions', async t => {
  const store = sqliteAdapter(); t.after(() => store.sql.close());
  const session = api.createCanonicalWalkSession(store.db, deps());
  let view = await session.open(await actualBundle('ordered-manual-progress'));
  const stop = view.bundle.stops[0], next = view.bundle.stops[1], quest = view.bundle.content.quests.find(q => q.id === stop.questId);
  let sequence = 0;
  const send = async action => session.dispatch({ eventId: `order-${++sequence}`, expectedVersion: view.session.version, action });
  await assert.rejects(() => send({ type: 'mark_stop', stopId: stop.id }), { code: 'INVALID_STATE' });
  view = await send({ type: 'start' });
  await assert.rejects(() => send({ type: 'confirm_end' }), { code: 'INVALID_STATE' });
  await assert.rejects(() => send({ type: 'mark_stop', stopId: next.id }), { code: 'NOT_CURRENT_STOP' });
  await assert.rejects(() => send({ type: 'answer', stopId: stop.id, choiceId: quest.correctChoiceId }), { code: 'VISIT_REQUIRED' });
  view = await send({ type: 'mark_stop', stopId: stop.id });
  await assert.rejects(() => send({ type: 'answer', stopId: stop.id, choiceId: 'fabricated-choice' }), { code: 'UNKNOWN_CHOICE' });
  const incorrect = quest.choices.find(choice => choice.id !== quest.correctChoiceId).id;
  view = await send({ type: 'answer', stopId: stop.id, choiceId: incorrect });
  assert.equal(view.session.answers[stop.id].correct, false);
  assert.deepEqual(view.session.completedStopIds, []);
  await assert.rejects(() => send({ type: 'continue', stopId: stop.id }), { code: 'QUEST_REQUIRED' });
  view = await send({ type: 'pause' });
  await assert.rejects(() => send({ type: 'answer', stopId: stop.id, choiceId: quest.correctChoiceId }), { code: 'INVALID_STATE' });
  view = await send({ type: 'resume' });
  view = await send({ type: 'answer', stopId: stop.id, choiceId: quest.correctChoiceId });
  assert.deepEqual(view.session.completedStopIds, [stop.id]);
  assert.equal(view.session.currentStopIndex, 0);
  view = await send({ type: 'continue', stopId: stop.id });
  assert.equal(view.session.currentStopIndex, 1);
  assert.deepEqual(view.discoveries, []);
});

test('last-stop and explicit-point endings can be confirmed after skips without manufacturing a collection', async t => {
  for (const endRule of [{ kind: 'last_stop' }, { kind: 'point', endpoint: { kind: 'public_anchor', anchorId: 'nurzhol-outdoor', explicitlyChosen: true } }]) {
    const store = sqliteAdapter(); t.after(() => store.sql.close());
    const session = api.createCanonicalWalkSession(store.db, deps());
    const bundle = await actualBundle(`ending-${endRule.kind}`, endRule);
    let view = await session.open(bundle), event = 0;
    const send = async action => { view = await session.dispatch({ eventId: `end-${++event}`, expectedVersion: view.session.version, action }); };
    await send({ type: 'start' });
    for (const stop of bundle.stops) await send({ type: 'skip', stopId: stop.id });
    assert.equal(view.session.phase, 'active');
    await send({ type: 'confirm_end' });
    assert.equal(view.session.phase, 'completed');
    assert.deepEqual(view.bundle.resolvedEnd, bundle.resolvedEnd);
    assert.deepEqual(view.session.skippedStopIds, bundle.stops.map(stop => stop.id));
    assert.deepEqual(view.session.manualStopIds, []);
    assert.deepEqual(view.discoveries, []);
  }
});

test('a different bundle cannot overwrite a nonterminal session and abandonment remains distinct from completion', async t => {
  const store = sqliteAdapter(); t.after(() => store.sql.close());
  const session = api.createCanonicalWalkSession(store.db, deps());
  const first = await session.open(await actualBundle('keep-first'));
  const other = await actualBundle('explicit-new-walk');
  await assert.rejects(() => session.open(other), { code: 'SESSION_CONFLICT' });
  assert.deepEqual(await session.snapshot(), first);
  const abandoned = await session.dispatch({ eventId: 'abandon-before-start', expectedVersion: 0, action: { type: 'abandon' } });
  assert.equal(abandoned.session.phase, 'abandoned');
  assert.deepEqual(abandoned.discoveries, []);
  await assert.rejects(() => session.dispatch({ eventId: 'cannot-resurrect', expectedVersion: 1, action: { type: 'start' } }), { code: 'INVALID_STATE' });
  const next = await session.open(other);
  assert.notEqual(next.session.sessionId, first.session.sessionId);
  assert.equal(next.session.phase, 'prepared');
  await assert.rejects(() => session.open(abandoned.session.sessionId), { code: 'SESSION_CONFLICT' });
});

test('each actual file connection configures foreign keys, WAL and a bounded busy timeout without changing the legacy schema version', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'astana-canonical-config-'));
  const firstDb = sqliteAdapter(path.join(directory, 'walks.sqlite')), secondDb = sqliteAdapter(path.join(directory, 'walks.sqlite'));
  t.after(() => { firstDb.sql.close(); secondDb.sql.close(); assert.equal(path.dirname(directory), os.tmpdir()); assert.ok(path.basename(directory).startsWith('astana-canonical-config-')); fs.rmSync(directory, { recursive: true, force: true }); });
  firstDb.sql.exec('PRAGMA user_version = 7');
  for (const store of [firstDb, secondDb]) {
    await api.createCanonicalWalkSession(store.db, deps()).getCurrentSessionId();
    assert.equal(store.sql.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
    assert.equal(store.sql.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
    assert.equal(store.sql.prepare('PRAGMA busy_timeout').get().timeout, 2500);
    assert.equal(store.sql.prepare('PRAGMA user_version').get().user_version, 7);
  }
});

test('a failed final collection transaction preserves the unfinished walk and awards the story once across sessions', async t => {
  const store = sqliteAdapter(); t.after(() => store.sql.close());
  const session = api.createCanonicalWalkSession(store.db, deps());
  let event = 0;
  const finishVisits = async bundle => {
    let view = await session.open(bundle);
    const send = async action => { view = await session.dispatch({ eventId: `award-${++event}`, expectedVersion: view.session.version, action }); };
    await send({ type: 'start' });
    for (const stop of bundle.stops) {
      await send({ type: 'mark_stop', stopId: stop.id });
      await send({ type: 'answer', stopId: stop.id, choiceId: bundle.content.quests.find(q => q.id === stop.questId).correctChoiceId });
      await send({ type: 'continue', stopId: stop.id });
    }
    return view;
  };
  const before = await finishVisits(await actualBundle('collection-transaction-first'));
  store.sql.exec("CREATE TEMP TRIGGER controlled_collection_failure BEFORE INSERT ON canonical_discoveries BEGIN SELECT RAISE(ABORT, 'controlled synthetic award fault'); END");
  const finish = { eventId: 'atomic-final', expectedVersion: before.session.version, action: { type: 'confirm_end' } };
  await assert.rejects(() => session.dispatch(finish), { code: 'WRITE_FAILED' });
  assert.deepEqual(await session.snapshot(), before);
  store.sql.exec('DROP TRIGGER controlled_collection_failure');
  const earned = await session.dispatch(finish);
  assert.equal(earned.discoveries.length, 1);
  assert.deepEqual(await session.dispatch(finish), earned);
  const another = await finishVisits(await actualBundle('collection-transaction-second'));
  const repeated = await session.dispatch({ eventId: 'second-finish', expectedVersion: another.session.version, action: { type: 'confirm_end' } });
  assert.notEqual(repeated.session.sessionId, earned.session.sessionId);
  assert.deepEqual(repeated.discoveries, earned.discoveries);
});

test('strict coordinate-free commands reject provider extras before journaling and keep errors bounded', async t => {
  const store = sqliteAdapter(); t.after(() => store.sql.close());
  const session = api.createCanonicalWalkSession(store.db, deps());
  const prepared = await session.open(await actualBundle('journal-privacy'));
  const command = { eventId: 'privacy-start', expectedVersion: 0, action: { type: 'start' } };
  for (const invalid of [{ ...command, rawFix: { latitude: 51.123456789, longitude: 71.987654321 } },
    { ...command, action: { type: 'start', privateProviderText: 'PRIVATE-SYNTHETIC-FIX-MARKER' } },
    { ...command, eventId: 'system.restore:1' }, { ...command, expectedVersion: -1 }]) {
    await assert.rejects(() => session.dispatch(invalid), { code: 'INVALID_COMMAND', message: 'INVALID_COMMAND' });
  }
  assert.deepEqual(await session.snapshot(), prepared);
  await session.dispatch(command);
  // Security evidence: inspect the persisted journal rather than a mocked writer.
  const journal = JSON.stringify(store.sql.prepare('SELECT * FROM canonical_events').all());
  for (const value of ['latitude', 'longitude', 'rawFix', 'PRIVATE-SYNTHETIC-FIX-MARKER', '51.123456789', '71.987654321']) assert.equal(journal.includes(value), false);
});

test('invalid bundles and corrupted durable progress fail safely without replacing the original row', async t => {
  const store = sqliteAdapter(); t.after(() => store.sql.close());
  const session = api.createCanonicalWalkSession(store.db, deps());
  const bundle = await actualBundle('corrupt-progress');
  await assert.rejects(() => session.open({ ...bundle, sha256: '0'.repeat(64) }), { code: 'INVALID_BUNDLE' });
  assert.equal(await session.getCurrentSessionId(), null);
  const initial = await session.open(bundle);
  const corrupt = JSON.stringify({ ...initial.session, manualStopIds: ['fabricated-stop'] });
  store.sql.prepare('UPDATE canonical_sessions SET session_json = ? WHERE session_id = ?').run(corrupt, initial.session.sessionId);
  await assert.rejects(() => session.snapshot(), { code: 'CORRUPT_PROGRESS' });
  await assert.rejects(() => api.createCanonicalWalkSession(store.db, deps()).open(bundle), { code: 'CORRUPT_PROGRESS' });
  assert.equal(store.sql.prepare('SELECT session_json FROM canonical_sessions WHERE session_id = ?').get(initial.session.sessionId).session_json, corrupt);
  assert.equal(await session.getCurrentSessionId(), initial.session.sessionId);
});
