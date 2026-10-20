const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { test } = require('node:test');
const ts = require('../../../node_modules/typescript');

function load(native) {
  const filename = path.resolve(__dirname, 'preparedAudio.ts'), m = new Module(filename, module);
  m.filename = filename; m.paths = Module._nodeModulePaths(path.dirname(filename));
  m.require = id => {
    assert.equal(id, 'expo-modules-core');
    return { requireNativeModule(name) { assert.equal(name, 'AstanaActiveWalk'); return native; } };
  };
  m._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
  return m.exports.nativePreparedAudio;
}
const digest = 'a'.repeat(64), assetPath = `astana-audio/${digest}.mp3`;
const state = (generation, status = 'playing') => ({ status, assetId: `audio-${digest}`, positionMs: 0, durationMs: 1000, errorCode: null, generation });

test('only an explicit valid bundled path and matching hash reaches the native play seam', async () => {
  const calls = [], api = load({ preparedAudioPlay: async (...args) => { calls.push(args); return state(1, 'loading'); } });
  for (const bad of ['https://example.test/audio.mp3', '/sdcard/audio.mp3', 'astana-audio/../audio.mp3', 'astana-audio/a.mp3']) {
    await assert.rejects(() => api.play(bad, digest), /INVALID_ASSET_PATH/);
  }
  await assert.rejects(() => api.play(assetPath, 'b'.repeat(64)), /SHA256_MISMATCH/);
  assert.equal(calls.length, 0);
  assert.equal((await api.play(assetPath, digest)).status, 'loading');
  assert.deepEqual(calls, [[assetPath, digest]]);
});

test('pause, stop and state cross the explicit native methods; stale state events cannot replace newer generations', async () => {
  let event, removed = false;
  const api = load({
    preparedAudioPause: async () => state(4, 'paused'),
    preparedAudioStop: async () => ({ ...state(6, 'stopped'), assetId: null, durationMs: 0 }),
    preparedAudioGetState: async () => state(5, 'paused'),
    addListener(name, callback) {
      assert.equal(name, 'onPreparedAudioState'); event = callback;
      return { remove() { removed = true; } };
    },
  });
  assert.equal((await api.pause()).status, 'paused');
  assert.equal((await api.getState()).generation, 5);
  const seen = [], subscription = api.addListener(value => seen.push(value));
  event(state(3));
  event(state(5, 'paused'));
  assert.deepEqual(seen.map(s => s.status), ['paused']);
  assert.equal((await api.stop()).assetId, null);
  event(state(5));
  event({ ...state(7, 'stopped'), assetId: null, durationMs: 0 });
  assert.deepEqual(seen.map(s => s.generation), [5, 7]);
  subscription.remove(); assert.equal(removed, true);
});

test('a missing native audio implementation or invalid state is reported without any speech fallback', async () => {
  const missing = load({});
  await assert.rejects(() => missing.play(assetPath, digest), /PREPARED_AUDIO_NATIVE_UNAVAILABLE/);
  for (const invalid of [{ ...state(1), positionMs: -1 }, { ...state(1), generation: 1.5 }, { ...state(1), status: 'ready' }, null]) {
    const api = load({ preparedAudioGetState: async () => invalid });
    await assert.rejects(() => api.getState(), /INVALID_PREPARED_AUDIO_STATE/);
  }
});
