// Actual bundled editorial content, not a field or device test.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');
function load(filename, cache = new Map()) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const m = new Module(filename, module); cache.set(filename, m);
  m.filename = filename; m.paths = Module._nodeModulePaths(path.dirname(filename));
  const nativeRequire = m.require.bind(m);
  m.require = id => id.startsWith('.') ? load(path.resolve(path.dirname(filename), id + '.ts'), cache) : nativeRequire(id);
  m._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, filename);
  return m.exports;
}
const { EditorialWalkSchema } = load(path.resolve(__dirname, '../src/walk/model.ts'));
const { createSession, transition, getDiscovery } = load(path.resolve(__dirname, '../src/walk/engine.ts'));
const raw = JSON.parse(readFileSync(path.resolve(__dirname, '../src/walk/preparedWalk.json'), 'utf8'));

test('the actual bundled walk fits its budget and completes all three chapters only after the return', () => {
  const walk = EditorialWalkSchema.parse(raw);
  assert.deepEqual(walk.stops.map(s => s.candidateKey), ['baiterek', 'nurzhol', 'round-square']);
  assert.equal(walk.timing.budgetMinutes, 80);
  assert.equal(walk.timing.visitMinutes, 18);
  assert.equal(walk.routeSource.fieldVerified, false);
  const now = '2026-10-20T12:00:00.000Z';
  let session = transition(walk, createSession(walk, 'catalog-check', now), { type: 'start' }, now);
  for (const stop of walk.stops) {
    for (const locale of ['ru', 'kk', 'en']) {
      assert.ok(stop.story[locale].length > 400);
      assert.ok(stop.quest.choices.every(choice => choice.label[locale].trim()));
    }
    session = transition(walk, session, { type: 'mark_stop', stopId: stop.id }, now);
    session = transition(walk, session, { type: 'answer', stopId: stop.id, choiceId: stop.quest.correctChoiceId }, now);
    session = transition(walk, session, { type: 'continue', stopId: stop.id }, now);
  }
  assert.equal(session.phase, 'active'); assert.equal(getDiscovery(walk, session).earned, false);
  session = transition(walk, session, { type: 'confirm_return' }, now);
  assert.equal(getDiscovery(walk, session).earned, true);
});

test('a broken return connector or a budget that omits its last leg is refused', () => {
  const connector = structuredClone(raw);
  connector.legs.at(-1).coordinates.at(-1)[0] += 0.00001;
  assert.equal(EditorialWalkSchema.safeParse(connector).success, false);
  const omittedReturn = structuredClone(raw);
  omittedReturn.timing.walkMinutes -= omittedReturn.legs.at(-1).walkMinutes;
  assert.equal(EditorialWalkSchema.safeParse(omittedReturn).success, false);
});
