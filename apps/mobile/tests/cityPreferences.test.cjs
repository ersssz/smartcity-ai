// Actual local SQLite; this is not an Android animation or touch test.
const assert = require('node:assert/strict');
const { readFileSync, mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { DatabaseSync } = require('node:sqlite');
const { test } = require('node:test');
const ts = require('typescript');
const filename = path.resolve(__dirname, '../src/city/preferences.ts');
const loaded = new Module(filename, module);
loaded.filename = filename;
loaded.paths = Module._nodeModulePaths(path.dirname(filename));
loaded._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, filename);
const { createCityPreferences, shouldIntroduceCity } = loaded.exports;
function adapter(sqlite) {
  return {
    async execAsync(sql) { sqlite.exec(sql); },
    async getFirstAsync(sql, ...params) { return sqlite.prepare(sql).get(...params) ?? null; },
    async runAsync(sql, ...params) { return sqlite.prepare(sql).run(...params); },
  };
}
test('a finished city introduction stays dismissed after reopening the local store', async () => {
  const location = path.join(mkdtempSync(path.join(tmpdir(), 'astana-city-')), 'preferences.db');
  let db = new DatabaseSync(location);
  const preferences = createCityPreferences(adapter(db));
  assert.equal(await preferences.hasSeen(), false);
  await preferences.finish();
  db.close();
  db = new DatabaseSync(location);
  try { assert.equal(await createCityPreferences(adapter(db)).hasSeen(), true); }
  finally { db.close(); }
});

test('an introduction never interrupts an active, restored or completed walk', () => {
  assert.equal(shouldIntroduceCity(false, 'ready'), true);
  assert.equal(shouldIntroduceCity(true, 'ready'), false);
  for (const phase of ['active', 'paused', 'completed']) assert.equal(shouldIntroduceCity(false, phase), false);
});

test('a failed finish remains unseen and can be retried without losing the preference store', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const preferences = createCityPreferences(adapter(db));
    assert.equal(await preferences.hasSeen(), false);
    db.exec("CREATE TRIGGER reject_city_write BEFORE INSERT ON city_intro BEGIN SELECT RAISE(ABORT, 'simulated disk refusal'); END;");
    await assert.rejects(preferences.finish());
    assert.equal(await preferences.hasSeen(), false);
    db.exec('DROP TRIGGER reject_city_write');
    await preferences.finish();
    assert.equal(await preferences.hasSeen(), true);
  } finally { db.close(); }
});
