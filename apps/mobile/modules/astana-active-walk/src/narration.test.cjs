const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { test } = require('node:test');
const ts = require('../../../node_modules/typescript');
const digest = 'a'.repeat(64);
const ref = { walkSessionId: 'canonical-one', bundleSha256: 'b'.repeat(64), narrationId: 'chapter:bayterek:ru', locale: 'ru', assetPath: `astana-audio/${digest}.mp3`, assetSha256: digest };
const scope = { host: { processNonce: 'process-one', requestEpoch: 4 }, audio: { processId: 'runtime-one', playbackEpoch: 2 } };
function state(generation = 4, status = 'paused') {
  return { status, assetId: `audio-${digest}`, positionMs: 1200, durationMs: 9000, errorCode: null, generation,
    hostScope: scope.host, audioScope: scope.audio, hostPhase: 'RUNNING', canResume: status === 'paused', pausedReason: status === 'paused' ? 'USER_PAUSE' : null,
    serviceForeground: true, ref: { ...ref } };
}
function load(native) {
  const filename = path.resolve(__dirname, 'narration.ts');
  const m = new Module(filename, module); m.filename = filename; m.paths = Module._nodeModulePaths(path.dirname(filename));
  m.require = id => { assert.equal(id, 'expo-modules-core'); return { requireNativeModule: name => { assert.equal(name, 'AstanaActiveWalk'); return native; } }; };
  m._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
  return m.exports;
}
test('capture is synchronous and immutable; an old gesture crosses play without an implicit recapture or Stop', async () => {
  const calls = []; let captures = 0;
  const { narration } = load({ narrationCaptureScope: () => { captures++; return JSON.parse(JSON.stringify(scope)); },
    narrationPlay: async (...args) => { calls.push(args); return { accepted: true, rejected: null, state: state(5, 'loading') }; } });
  const captured = narration.capture();
  assert.equal(captured instanceof Promise, false);
  assert.ok(Object.isFrozen(captured) && Object.isFrozen(captured.host) && Object.isFrozen(captured.audio));
  await Promise.resolve();
  const result = await narration.play(captured, ref);
  assert.equal(result.status, 'loading'); assert.equal(captures, 1); assert.deepEqual(calls, [[scope, ref]]);
});
test('stale-scope rejection is surfaced with its state, without a new scope, retry or speech fallback', async () => {
  let calls = 0;
  const { narration } = load({ narrationPlay: async () => { calls++; return { accepted: false, rejected: 'STALE_HOST_SCOPE', state: state(7) }; } });
  await assert.rejects(narration.play(scope, ref), e => e.code === 'STALE_HOST_SCOPE' && e.state.generation === 7);
  assert.equal(calls, 1);
});
test('pause/resume carry the supplied gesture; Stop is unconditional and does not borrow a stale scope', async () => {
  const calls = [], stopped = { ...state(9, 'stopped'), assetId: null, positionMs: 0, durationMs: 0, ref: null, audioScope: null, hostPhase: 'ABSENT', serviceForeground: false };
  const { narration } = load({
    narrationPause: async value => { calls.push(['pause', value]); return { accepted: true, rejected: null, state: state(5) }; },
    narrationResume: async value => { calls.push(['resume', value]); return { accepted: true, rejected: null, state: state(6, 'playing') }; },
    narrationStop: async (...args) => { calls.push(['stop', args]); return { accepted: true, rejected: null, state: stopped }; },
  });
  await narration.pause(scope); await narration.resume(scope); assert.equal((await narration.stop()).status, 'stopped');
  assert.deepEqual(calls, [['pause', scope], ['resume', scope], ['stop', []]]);
});
test('the same audio bytes in a different chapter, session, revision or locale never count as an exact resume', () => {
  const { sameNarration } = load({});
  assert.equal(sameNarration(ref, { ...ref }), true);
  for (const change of [{ narrationId: 'chapter:other:ru' }, { walkSessionId: 'canonical-two' }, { bundleSha256: 'c'.repeat(64) }, { locale: 'kk' }]) {
    assert.equal(sameNarration(ref, { ...ref, ...change }), false);
  }
  assert.equal(sameNarration(null, ref), false);
});
test('URLs, unmatched hashes, extra ref fields and unsafe captured epochs never reach native', async () => {
  let calls = 0;
  const { narration } = load({ narrationPlay: async () => { calls++; return { accepted: true, rejected: null, state: state() }; } });
  for (const change of [{ assetPath: 'https://example.test/a.mp3' }, { assetSha256: 'd'.repeat(64) }, { latitude: 51 }, { narrationId: 'chapter:other:en' }]) {
    await assert.rejects(narration.play(scope, { ...ref, ...change }), /INVALID_NARRATION_REF/);
  }
  for (const requestEpoch of [-1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(narration.play({ ...scope, host: { ...scope.host, requestEpoch } }, ref), /INVALID_NARRATION_SCOPE/);
  }
  assert.equal(calls, 0);
});
test('stale native observations cannot replace a newer host generation and listeners unsubscribe', async () => {
  let callback, removed = false;
  const { narration } = load({ narrationGetState: async () => state(10), addListener: (name, cb) => {
    assert.equal(name, 'onNarrationState'); callback = cb; return { remove: () => { removed = true; } };
  } });
  await narration.getState(); const seen = []; const subscription = narration.addListener(s => seen.push(s.generation));
  callback(state(9)); callback(state(10)); callback(state(11));
  assert.deepEqual(seen, [10, 11]); subscription.remove(); assert.equal(removed, true);
});
test('invalid state identity and unconfirmed Stop cannot be reported as successful cleanup', async () => {
  for (const value of [{ ...state(), ref: { ...ref, assetSha256: 'd'.repeat(64) } }, { ...state(), generation: 0.5 }, { ...state(), serviceForeground: 'true' }]) {
    const { narration } = load({ narrationGetState: async () => value });
    await assert.rejects(narration.getState(), /INVALID_NARRATION_STATE/);
  }
  const { narration } = load({ narrationStop: async () => ({ accepted: false, rejected: 'HOST_CLEANUP_FAILED', state: { ...state(), status: 'error', canResume: false } }) });
  await assert.rejects(narration.stop(), e => e.code === 'HOST_CLEANUP_FAILED');
});

test('Stop observation revokes command scope before releasing the actual playing hardware', () => {
  let callback;
  const { narration } = load({ addListener: (_name, cb) => { callback = cb; return { remove() {} }; } });
  const seen = []; narration.addListener(value => seen.push(value));
  callback({ ...state(11, 'playing'), hostPhase: 'STOPPING', audioScope: null, canResume: false });
  callback({ ...state(12, 'stopped'), hostPhase: 'ABSENT', audioScope: null, ref: null, assetId: null, serviceForeground: false, canResume: false });
  assert.equal(seen[0].status, 'playing'); assert.equal(seen[0].audioScope, null);
  assert.equal(seen[1].status, 'stopped'); assert.equal(seen[1].serviceForeground, false);
});
