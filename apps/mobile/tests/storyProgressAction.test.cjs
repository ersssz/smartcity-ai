// Tests the pure public intent helper, not React rendering, GPS arrival or Android execution.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { test } = require('node:test');
const ts = require('typescript');
const filename = path.resolve(__dirname, '../src/features/walk/storyProgressAction.ts');
const loaded = new Module(filename, module); loaded.filename = filename;
loaded.paths = Module._nodeModulePaths(path.dirname(filename));
loaded._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
} }).outputText, filename);
const { storyProgressAction } = loaded.exports;
const stopIds = Object.freeze(['bayterek-outdoor', 'nurzhol-outdoor', 'round-square-outdoor']);
const active = (changes = {}) => ({ storyOnly: true, phase: 'active', canProgress: true,
  currentStopIndex: 0, selectedStopIndex: 0, stopIds, ...changes });

test('the explicit progress intent marks only the currently selected active story without mutating progress', () => {
  const input = Object.freeze(active({ currentStopIndex: 1, selectedStopIndex: 1 }));
  assert.deepEqual(storyProgressAction(input), { kind: 'read_story', stopId: 'nurzhol-outdoor' });
  assert.equal(input.currentStopIndex, 1); assert.deepEqual(input.stopIds, stopIds);
});

test('after the final chapter every real ending needs an explicit confirm_end rather than another read or an automatic completion', async () => {
  const { createReplayPlanner } = await import('@astanaai/walk-planner');
  const at = '2026-10-20T12:00:00.000Z';
  const hash = async text => createHash('sha256').update(text, 'utf8').digest('hex');
  const planner = createReplayPlanner({ hash, now: () => at, id: () => 'story-progress-real-bundle' });
  const rules = [{ kind: 'return_to_start' }, { kind: 'last_stop' },
    { kind: 'point', endpoint: { kind: 'public_anchor', anchorId: 'nurzhol-outdoor', explicitlyChosen: true } }];
  for (const endRule of rules) {
    const reply = await planner.plan({ requestId: 'story-progress-end', locale: 'ru',
      origin: { kind: 'public_anchor', anchorId: 'bayterek-outdoor', explicitlyChosen: true },
      startAt: at, budgetMinutes: 80, endRule, interests: ['architecture'], constraints: [], contextFlags: [] });
    assert.equal(reply.kind, 'candidates');
    const bundle = reply.bundles[0], original = JSON.stringify(bundle), ids = bundle.stops.map(stop => stop.id);
    assert.equal(ids.length, 3);
    assert.deepEqual(storyProgressAction(active({ stopIds: ids, currentStopIndex: 2, selectedStopIndex: 2 })),
      { kind: 'read_story', stopId: 'round-square-outdoor' });
    for (const selectedStopIndex of [0, 3]) {
      const input = Object.freeze(active({ stopIds: ids, currentStopIndex: 3, selectedStopIndex }));
      assert.deepEqual(storyProgressAction(input), { kind: 'confirm_end' });
      assert.equal(input.phase, 'active'); // The helper offers an intent; it never finishes the session.
    }
    assert.equal(JSON.stringify(bundle), original); assert.deepEqual(bundle.request.endRule, endRule);
  }
});

test('reading previews never marks an earlier or future story while an active current chapter remains actionable', () => {
  assert.deepEqual(storyProgressAction(active({ currentStopIndex: 1, selectedStopIndex: 0 })), { kind: 'none' });
  assert.deepEqual(storyProgressAction(active({ currentStopIndex: 1, selectedStopIndex: 2 })), { kind: 'none' });
  assert.deepEqual(storyProgressAction(active({ currentStopIndex: 1, selectedStopIndex: 3 })), { kind: 'none' });
  assert.deepEqual(storyProgressAction(active({ currentStopIndex: 2, selectedStopIndex: 2 })), { kind: 'read_story', stopId: 'round-square-outdoor' });
});

test('paused, terminal, prepared, non-story and denied states offer neither reading nor end confirmation', () => {
  for (const currentStopIndex of [0, 3]) for (const changes of [
    { phase: 'ready' }, { phase: 'paused' }, { phase: 'completed' }, { storyOnly: false }, { canProgress: false },
  ]) assert.deepEqual(storyProgressAction(active({ currentStopIndex, selectedStopIndex: currentStopIndex, ...changes })), { kind: 'none' });
});

test('empty walks, nonintegral or out-of-range cursors and missing current IDs cannot fabricate progression', () => {
  for (const changes of [{ stopIds: [] }, { currentStopIndex: -1 }, { currentStopIndex: 4 }, { currentStopIndex: 0.5 },
    { currentStopIndex: NaN }, { currentStopIndex: Infinity }, { selectedStopIndex: -1 }, { selectedStopIndex: 4 },
    { selectedStopIndex: 0.5 }, { selectedStopIndex: NaN }, { stopIds: ['', 'other'] }]) {
    assert.deepEqual(storyProgressAction(active(changes)), { kind: 'none' });
  }
});
