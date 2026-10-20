// Actual canonical source-replay bundles through the presentation Interface; no native/UI/field claim.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { test } = require('node:test');
const ts = require('typescript');
const filename = path.resolve(__dirname, '../src/canonical/presentation.ts');
const loaded = new Module(filename, module);
loaded.filename = filename; loaded.paths = Module._nodeModulePaths(path.dirname(filename));
loaded._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, filename);
const { toCanonicalUiWalk, toCanonicalUiSession, canonicalMaterials } = loaded.exports;
const hash = async text => createHash('sha256').update(text, 'utf8').digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
async function bundleFor(endRule = { kind: 'return_to_start' }) {
  const { createReplayPlanner } = await import('@astanaai/walk-planner');
  const at = '2026-10-20T12:00:00.000Z';
  const planner = createReplayPlanner({ hash, now: () => at, id: () => 'presentation-replay' });
  const result = await planner.plan({ requestId: 'presentation-check', locale: 'ru', origin: { kind: 'public_anchor', anchorId: 'bayterek-outdoor', explicitlyChosen: true }, startAt: at, budgetMinutes: 80, endRule, interests: [], constraints: [], contextFlags: [] });
  assert.equal(result.kind, 'candidates'); return result.bundles[0];
}
const sessionFor = bundle => ({ phase: 'prepared', currentStopIndex: 0, manualStopIds: [], completedStopIds: [], skippedStopIds: [], answers: {}, bundleHash: bundle.sha256, bundleRevision: bundle.revision });

test('all three ending rules retain their actual endpoint and graph geometry instead of promising a return for every walk', async () => {
  const start = await bundleFor();
  const endpoint = { kind: 'public_anchor', anchorId: start.stops[1].anchor.id, explicitlyChosen: true };
  const choices = [start, await bundleFor({ kind: 'last_stop' }), await bundleFor({ kind: 'point', endpoint })];
  const labels = new Set();
  for (const bundle of choices) {
    const ui = toCanonicalUiWalk(bundle, 'ru');
    assert.equal(ui.ending.kind, bundle.request.endRule.kind); labels.add(ui.ending.title);
    assert.deepEqual(ui.endCoordinate, bundle.resolvedEnd.endpoint.coordinate);
    assert.deepEqual(ui.startCoordinate, bundle.continuation.origin.coordinate);
    assert.equal(ui.distanceMeters, bundle.timing.distanceMeters);
    assert.equal(ui.minutes, Math.ceil(bundle.timing.totalMinutes));
    assert.equal(ui.stops.length, bundle.stops.length);
    const suppliedPoints = bundle.legs.flatMap(leg => leg.kind === 'walk' ? leg.geometry.coordinates : []);
    assert.ok(ui.route.every(point => suppliedPoints.some(source => source[0] === point[0] && source[1] === point[1])));
    assert.deepEqual(ui.route.at(-1), bundle.resolvedEnd.endpoint.coordinate);
    assert.match(ui.fieldNote, /сохранён|полев/i);
  }
  assert.equal(labels.size, 3);
  assert.doesNotMatch(toCanonicalUiWalk(choices[1], 'en').ending.body, /return to the start/i);
});

test('the localized adapter preserves fact versus fiction, source references, quests, collections and cues without mutating canonical bytes', async () => {
  const bundle = await bundleFor(); const before = JSON.stringify(bundle);
  for (const locale of ['ru', 'kk', 'en']) {
    const ui = toCanonicalUiWalk(bundle, locale);
    assert.equal(ui.title, bundle.theme.title[locale]);
    assert.equal(ui.description, bundle.theme.explanation.text[locale]);
    assert.equal(ui.collectionTitle, bundle.content.collections[0].title[locale]);
    assert.equal(ui.closing, bundle.content.cues.complete.text[locale]);
    for (const stop of bundle.stops) {
      const display = ui.stops.find(item => item.id === stop.id);
      const chapter = bundle.content.chapters.find(item => item.id === stop.chapterId);
      const quest = bundle.content.quests.find(item => item.id === stop.questId);
      for (const block of chapter.blocks) assert.ok(display.story.includes(block.text[locale]));
      assert.equal(display.quest.question, quest.question[locale]);
      assert.equal(display.quest.explanation, quest.explanation[locale]);
      assert.deepEqual(display.quest.choices.map(c => c.label), quest.choices.map(c => c.label[locale]));
      assert.ok(display.facts.length > 0);
      for (const fact of display.facts) {
        const original = bundle.facts.find(f => f.id === fact.id);
        assert.equal(fact.text, original.statement[locale]);
        for (const id of original.sourceIds) assert.ok(display.sources.some(s => s.url === bundle.sources.find(source => source.id === id).url));
      }
    }
    assert.match(ui.stops[0].story, locale === 'ru' ? /Факт[\s\S]*Художественная/ : locale === 'en' ? /Fact[\s\S]*Fiction/ : /Дерек[\s\S]*Көркем/);
    assert.equal(ui.cues.pause, bundle.content.cues.pause.text[locale]);
    ui.route[0][0] = 0;
  }
  assert.equal(JSON.stringify(bundle), before);
});

test('an unresolved canonical fact/source fails explicitly instead of presenting an unsupported story', async () => {
  const bundle = clone(await bundleFor());
  bundle.facts = bundle.facts.filter(f => f.id !== bundle.stops[0].factRefs[0]);
  assert.throws(() => toCanonicalUiWalk(bundle, 'ru'), /CANONICAL_CONTENT_UNAVAILABLE/);
});

test('session presentation maps prepared and abandoned explicitly and preserves manual provenance without inventing completion', async () => {
  const bundle = await bundleFor();
  const prepared = sessionFor(bundle);
  assert.equal(toCanonicalUiSession(bundle, prepared, 'ru').phase, 'ready');
  const abandoned = { ...prepared, phase: 'abandoned', currentStopIndex: bundle.stops.length,
    manualStopIds: [bundle.stops[0].id], completedStopIds: bundle.stops.map(s => s.id) };
  const display = toCanonicalUiSession(bundle, abandoned, 'ru');
  assert.equal(display.phase, 'completed'); assert.equal(display.abandoned, true);
  assert.match(display.statusMessage, /досрочно/i);
  assert.deepEqual(display.manualStopIds, abandoned.manualStopIds);
  assert.equal(display.discoveries, undefined);
  assert.deepEqual(toCanonicalUiSession(bundle, prepared, 'ru').completedStopIds, []);
  display.manualStopIds.push('mutated-ui');
  assert.deepEqual(abandoned.manualStopIds, [bundle.stops[0].id]);
});

test('quest answer feedback uses the correct localized explanation or hint and rejects answers for unknown stops', async () => {
  const bundle = await bundleFor(); const session = sessionFor(bundle); const stop = bundle.stops[0];
  const quest = bundle.content.quests.find(q => q.id === stop.questId);
  for (const correct of [false, true]) {
    session.answers = { [stop.id]: { choiceId: quest.choices[0].id, correct } };
    assert.equal(toCanonicalUiSession(bundle, session, 'en').answers[stop.id].feedback, correct ? quest.explanation.en : quest.hint.en);
  }
  session.answers = { 'unknown-stop': { choiceId: 'x', correct: true } };
  assert.throws(() => toCanonicalUiSession(bundle, session, 'en'), /CANONICAL_CONTENT_UNAVAILABLE/);
});

test('available audio references never make missing offline maps ready; verification is bound to this immutable bundle', async () => {
  const bundle = clone(await bundleFor());
  const available = { state: 'available', assetId: 'test-audio', textSha256: 'a'.repeat(64), durationSeconds: 10 };
  for (const locale of ['ru', 'kk', 'en']) {
    for (const chapter of bundle.content.chapters) chapter.audio[locale] = available;
    for (const quest of bundle.content.quests) for (const part of ['question', 'hint', 'explanation']) quest.audio[part][locale] = available;
    for (const cue of Object.values(bundle.content.cues)) cue.audio[locale] = available;
  }
  const summary = canonicalMaterials(bundle, 'ru');
  assert.equal(summary.audioAvailable, 54); assert.equal(summary.audioTotal, 54);
  assert.equal(summary.mapAvailable, false); assert.equal(summary.state, 'partial');
  assert.match(summary.label, /54/);
  const foreign = { state: 'ready', identity: { bundleHash: '0'.repeat(64), revision: 1, manifestHash: 'b'.repeat(64) }, missing: [] };
  assert.notEqual(canonicalMaterials(bundle, 'en', foreign).state, 'ready');
  assert.equal(canonicalMaterials(bundle, 'en', { state: 'invalid_bundle', code: 'CORRUPT_BUNDLE' }).canChoose, false);
});
