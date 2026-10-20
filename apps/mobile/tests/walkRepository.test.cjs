// Real SQLite transactions with simulated editorial content; not Expo/device acceptance.
const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { test } = require('node:test');
const ts = require('typescript');
const { walk } = require('./walkFixture.cjs');

function loadTypeScript(filename, cache = new Map()) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = new Module(filename, module);
  cache.set(filename, loaded);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const requireNative = loaded.require.bind(loaded);
  loaded.require = (id) => id.startsWith('.')
    ? loadTypeScript(path.resolve(path.dirname(filename), `${id}.ts`), cache) : requireNative(id);
  loaded._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, filename);
  return loaded.exports;
}
const { createWalkRepository, WalkStorageError } = loadTypeScript(path.resolve(__dirname, '../src/walk/repository.ts'));
const fixedNow = '2026-10-20T12:00:00.000Z';
let sequence = 0;
const dependencies = { now: () => fixedNow, nextSessionId: () => `session-${++sequence}` };

function realSqlite(filename = ':memory:', controls = {}) {
  const sqlite = new DatabaseSync(filename);
  return { sqlite, adapter: {
    async execAsync(sql) { sqlite.exec(sql); },
    async getFirstAsync(sql, ...params) { return sqlite.prepare(sql).get(...params) ?? null; },
    async getAllAsync(sql, ...params) { return sqlite.prepare(sql).all(...params); },
    async runAsync(sql, ...params) { return sqlite.prepare(sql).run(...params); },
    async withTransactionAsync(task) {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        if (controls.hold) await controls.hold();
        await task();
        sqlite.exec('COMMIT');
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  } };
}

test('a reopened database restores the selected bundle revision and durably pauses the active session', async (t) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'astana-walk-repository-'));
  let db;
  t.after(() => {
    db?.sqlite.close();
    assert.equal(path.dirname(directory), os.tmpdir());
    assert.ok(path.basename(directory).startsWith('astana-walk-repository-'));
    rmSync(directory, { recursive: true, force: true });
  });
  const filename = path.join(directory, 'progress.sqlite');
  db = realSqlite(filename);
  let repository = createWalkRepository(db.adapter, dependencies);
  const prepared = await repository.load(walk);
  assert.equal(prepared.session.phase, 'ready');
  await repository.act({ type: 'start' });
  await repository.act({ type: 'mark_stop', stopId: 'one' });
  db.sqlite.close();
  db = realSqlite(filename);
  repository = createWalkRepository(db.adapter, dependencies);
  const newCatalog = { ...walk, revision: 2, title: { ru: 'New', kk: 'New', en: 'New' } };
  const restored = await repository.load(newCatalog);
  assert.equal(restored.walk.revision, 1);
  assert.deepEqual(restored.walk.title, walk.title);
  assert.equal(restored.session.phase, 'paused');
  assert.deepEqual(restored.session.manualStopIds, ['one']);
  assert.equal(JSON.parse(db.sqlite.prepare('SELECT session_json FROM walk_current WHERE id = 1').get().session_json).phase, 'paused');
  assert.equal((await createWalkRepository(db.adapter, dependencies).load(newCatalog)).session.phase, 'paused');
  await repository.act({ type: 'resume' });
  for (const stopId of ['one', 'two', 'three']) await repository.act({ type: 'skip', stopId });
  const returning = await createWalkRepository(db.adapter, dependencies).load(newCatalog);
  assert.equal(returning.session.currentStopIndex, 3);
  assert.equal(returning.session.phase, 'paused');
  assert.equal(returning.discoveries.length, 0);
});

async function finishQuests(repository) {
  await repository.act({ type: 'start' });
  for (const stopId of ['one', 'two', 'three']) {
    await repository.act({ type: 'mark_stop', stopId });
    await repository.act({ type: 'answer', stopId, choiceId: 'yes' });
    await repository.act({ type: 'continue', stopId });
  }
}

test('completion and discovery commit atomically, recover after SQLite failure and award once across restarts', async (t) => {
  const db = realSqlite();
  t.after(() => db.sqlite.close());
  const repository = createWalkRepository(db.adapter, dependencies);
  await repository.load(walk);
  await finishQuests(repository);
  db.sqlite.exec("CREATE TRIGGER reject_discovery BEFORE INSERT ON walk_discoveries BEGIN SELECT RAISE(ABORT, 'simulated storage failure'); END");
  await assert.rejects(repository.act({ type: 'confirm_return' }), (error) => error instanceof WalkStorageError && error.code === 'WRITE_FAILED');
  assert.equal(JSON.parse(db.sqlite.prepare('SELECT session_json FROM walk_current').get().session_json).phase, 'active');
  assert.equal(db.sqlite.prepare('SELECT count(*) AS count FROM walk_discoveries').get().count, 0);
  db.sqlite.exec('DROP TRIGGER reject_discovery');
  const completed = await repository.act({ type: 'confirm_return' });
  assert.equal(completed.session.phase, 'completed');
  assert.deepEqual(completed.discoveries, [{ walkId: walk.id, title: walk.collectionTitle, proof: 'manual', earnedAt: fixedNow }]);
  const restarted = await repository.restart(walk);
  assert.equal(restarted.session.phase, 'ready');
  assert.notEqual(restarted.session.sessionId, completed.session.sessionId);
  assert.equal(restarted.discoveries.length, 1);
  assert.equal(db.sqlite.prepare('SELECT session_id FROM walk_history').get().session_id, completed.session.sessionId);
  await finishQuests(repository);
  assert.equal((await repository.act({ type: 'confirm_return' })).discoveries.length, 1);
  assert.equal(db.sqlite.prepare('SELECT count(*) AS count FROM walk_discoveries').get().count, 1);
});

test('corrupt progress is retained on load and only an explicit restart archives it before replacing it', async (t) => {
  const db = realSqlite();
  t.after(() => db.sqlite.close());
  await createWalkRepository(db.adapter, dependencies).load(walk);
  const rawBundle = '{broken bundle';
  const rawSession = '{broken session';
  db.sqlite.prepare('UPDATE walk_current SET bundle_json = ?, session_json = ?').run(rawBundle, rawSession);
  const repository = createWalkRepository(db.adapter, dependencies);
  await assert.rejects(repository.load(walk), (error) => error instanceof WalkStorageError && error.code === 'CORRUPT_PROGRESS');
  assert.equal(db.sqlite.prepare('SELECT session_json FROM walk_current').get().session_json, rawSession);
  assert.equal(db.sqlite.prepare('SELECT count(*) AS count FROM walk_history').get().count, 0);
  const restarted = await repository.restart(walk);
  assert.equal(restarted.session.phase, 'ready');
  const archived = db.sqlite.prepare('SELECT session_id, bundle_json, session_json FROM walk_history').get();
  assert.equal(archived.bundle_json, rawBundle);
  assert.equal(archived.session_json, rawSession);
  assert.ok(archived.session_id.startsWith('session-'));
  assert.notEqual(archived.session_id, restarted.session.sessionId);
  assert.equal((await repository.load(walk)).session.phase, 'ready');
});

test('settings do not initialize a walk, and concurrent commands remain ordered through a delayed SQLite commit', async (t) => {
  const controls = {};
  const db = realSqlite(':memory:', controls);
  t.after(() => db.sqlite.close());
  const repository = createWalkRepository(db.adapter, dependencies);
  assert.equal(await repository.getLocale(), 'ru');
  await repository.setLocale('en');
  assert.equal(db.sqlite.prepare('SELECT count(*) AS count FROM walk_current').get().count, 0);
  const prepared = await repository.load(walk);
  prepared.walk.title.ru = 'Caller changed its own snapshot';
  let release;
  let entered;
  const blocked = new Promise(resolve => { release = resolve; });
  const transactionEntered = new Promise(resolve => { entered = resolve; });
  controls.hold = async () => { controls.hold = undefined; entered(); await blocked; };
  const started = repository.act({ type: 'start' });
  const marked = repository.act({ type: 'mark_stop', stopId: 'one' });
  const answered = repository.act({ type: 'answer', stopId: 'one', choiceId: 'yes' });
  const locale = repository.setLocale('kk');
  await transactionEntered;
  assert.equal(JSON.parse(db.sqlite.prepare('SELECT session_json FROM walk_current').get().session_json).phase, 'ready');
  release();
  const [startSnapshot, markSnapshot, answerSnapshot] = await Promise.all([started, marked, answered, locale]);
  assert.deepEqual(startSnapshot.session.manualStopIds, []);
  assert.deepEqual(markSnapshot.session.manualStopIds, ['one']);
  assert.deepEqual(answerSnapshot.session.completedStopIds, ['one']);
  assert.deepEqual(answerSnapshot.walk.title, walk.title);
  assert.equal(await repository.getLocale(), 'kk');
  await assert.rejects(repository.setLocale('de'), error => error instanceof WalkStorageError && error.code === 'INVALID_LOCALE');
  assert.equal(await repository.getLocale(), 'kk');
  assert.equal((await repository.act({ type: 'continue', stopId: 'one' })).session.currentStopIndex, 1);
});

test('cold load exposes no uncommitted pause and fails closed on corrupt stored discoveries', async (t) => {
  const db = realSqlite();
  t.after(() => db.sqlite.close());
  const writer = createWalkRepository(db.adapter, dependencies);
  await writer.load(walk);
  await writer.act({ type: 'start' });
  db.sqlite.exec("CREATE TRIGGER reject_pause BEFORE UPDATE ON walk_current BEGIN SELECT RAISE(ABORT, 'simulated storage failure'); END");
  const reader = createWalkRepository(db.adapter, dependencies);
  await assert.rejects(reader.load(walk), error => error instanceof WalkStorageError && error.code === 'WRITE_FAILED');
  assert.equal(JSON.parse(db.sqlite.prepare('SELECT session_json FROM walk_current').get().session_json).phase, 'active');
  await assert.rejects(reader.act({ type: 'resume' }), error => error instanceof WalkStorageError && error.code === 'NOT_LOADED');
  db.sqlite.exec('DROP TRIGGER reject_pause');
  assert.equal((await reader.load(walk)).session.phase, 'paused');
  db.sqlite.prepare('INSERT INTO walk_discoveries (walk_id, title_json, proof, earned_at) VALUES (?, ?, ?, ?)').run('corrupt-discovery', '{bad', 'manual', fixedNow);
  const corruptReader = createWalkRepository(db.adapter, dependencies);
  await assert.rejects(corruptReader.load(walk), error => error instanceof WalkStorageError && error.code === 'CORRUPT_PROGRESS');
  assert.equal(db.sqlite.prepare('SELECT title_json FROM walk_discoveries').get().title_json, '{bad');
  db.sqlite.exec("DELETE FROM walk_discoveries WHERE walk_id = 'corrupt-discovery'");
  assert.equal((await corruptReader.load(walk)).session.phase, 'paused');
});

test('wall-clock correction does not prevent restoring, pausing and continuing valid manual progress', async (t) => {
  const db = realSqlite();
  t.after(() => db.sqlite.close());
  let wallTime = '2026-10-20T12:00:00.000Z';
  const clockDependencies = { ...dependencies, now: () => wallTime };
  const writer = createWalkRepository(db.adapter, clockDependencies);
  await writer.load(walk);
  await writer.act({ type: 'start' });
  await writer.act({ type: 'mark_stop', stopId: 'one' });
  wallTime = '2026-10-20T11:59:00.000Z';
  const restoredRepository = createWalkRepository(db.adapter, clockDependencies);
  const restored = await restoredRepository.load(walk);
  assert.equal(restored.session.phase, 'paused');
  assert.equal(restored.session.startedAt, '2026-10-20T12:00:00.000Z');
  assert.equal(restored.session.updatedAt, wallTime);
  assert.deepEqual(restored.session.manualStopIds, ['one']);
  assert.equal(JSON.parse(db.sqlite.prepare('SELECT session_json FROM walk_current').get().session_json).phase, 'paused');
  await restoredRepository.act({ type: 'resume' });
  await restoredRepository.act({ type: 'answer', stopId: 'one', choiceId: 'yes' });
  wallTime = '2026-10-20T11:58:00.000Z';
  const continued = await restoredRepository.act({ type: 'continue', stopId: 'one' });
  assert.equal(continued.session.currentStopIndex, 1);
  assert.deepEqual(continued.session.completedStopIds, ['one']);
  assert.equal(continued.session.updatedAt, wallTime);
  assert.equal((await createWalkRepository(db.adapter, clockDependencies).load(walk)).session.phase, 'paused');
});
