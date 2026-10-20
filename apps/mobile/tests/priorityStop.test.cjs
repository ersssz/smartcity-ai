// Promise scheduling at the priority Stop interface; not native/device acceptance.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');
const filename = path.resolve(__dirname, '../src/walk/priorityStop.ts');
const loaded = new Module(filename, module);
loaded.filename = filename;
loaded.paths = Module._nodeModulePaths(path.dirname(filename));
loaded._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, filename);
const { runPriorityStop } = loaded.exports;

function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

test('Stop immediately cancels native and audio while a permission/save operation is still pending, then durably pauses', async () => {
  const operation = deferred();
  let nativeCancelled = false;
  let audioStopped = false;
  let committed = false;
  let paused = false;
  const pending = operation.promise.then(() => { committed = true; });
  const stopping = runPriorityStop({
    stopNative: async () => { nativeCancelled = true; },
    stopAudio: async () => { audioStopped = true; },
    pending,
    pause: async () => { assert.equal(committed, true); paused = true; },
  });
  assert.equal(nativeCancelled, true);
  assert.equal(audioStopped, true);
  assert.equal(committed, false);
  assert.equal(paused, false);
  operation.resolve();
  assert.deepEqual(await stopping, { cleanupFailed: false });
  assert.equal(paused, true);
});

test('cleanup failure cannot suppress the other cleanup or durable pause after the pending operation', async () => {
  for (const failing of ['native', 'audio']) {
    const operation = deferred();
    let nativeCancelled = false;
    let audioStopped = false;
    let paused = false;
    const stopping = runPriorityStop({
      stopNative: () => { nativeCancelled = true; if (failing === 'native') throw new Error('Native cleanup failed'); return Promise.resolve(); },
      stopAudio: () => { audioStopped = true; if (failing === 'audio') throw new Error('Audio cleanup failed'); return Promise.resolve(); },
      pending: operation.promise,
      pause: async () => { paused = true; },
    });
    // Observe either outcome immediately, so a failing implementation cannot leak a rejection.
    const observed = stopping.then(value => value, error => error);
    assert.equal(nativeCancelled, true);
    assert.equal(audioStopped, true);
    assert.equal(paused, false);
    operation.resolve();
    assert.deepEqual(await observed, { cleanupFailed: true });
    assert.equal(paused, true);
  }
});

test('a rejected pending operation still pauses after both cleanup promises settle', async () => {
  const nativeCleanup = deferred();
  let paused = false;
  const stopping = runPriorityStop({
    stopNative: () => nativeCleanup.promise,
    stopAudio: async () => { throw new Error('Asynchronous audio failure'); },
    pending: Promise.reject(new Error('Permission or save operation failed')),
    pause: async () => { paused = true; },
  });
  const observed = stopping.then(value => value, error => error);
  await Promise.resolve();
  assert.equal(paused, false);
  nativeCleanup.resolve();
  assert.deepEqual(await observed, { cleanupFailed: true });
  assert.equal(paused, true);
});

test('durable pause failure rejects Stop instead of reporting successful cleanup as saved progress', async () => {
  const failedSave = new Error('Pause transaction failed');
  await assert.rejects(runPriorityStop({
    stopNative: async () => {},
    stopAudio: async () => { throw new Error('Audio cleanup also failed'); },
    pending: Promise.resolve(),
    pause: async () => { throw failedSave; },
  }), error => error === failedSave);
});
