// OS-adapter simulation for concurrency only. This is not device, GPS or SQLite evidence.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function diagnosticHarness() {
  const entered = deferred();
  const release = deferred();
  const state = { phase: 'stopped', registered: false, starts: 0 };
  const location = {
    Accuracy: { High: 4 },
    requestForegroundPermissionsAsync: async () => ({ granted: true }),
    getBackgroundPermissionsAsync: async () => ({ granted: false }),
    hasServicesEnabledAsync: async () => true,
    hasStartedLocationUpdatesAsync: async () => state.registered,
    startLocationUpdatesAsync: async () => {
      state.starts++;
      if (state.starts === 1) { entered.resolve(); await release.promise; }
      state.registered = true;
    },
    stopLocationUpdatesAsync: async () => { state.registered = false; },
  };
  const adapters = {
    'expo-location': location,
    'expo-task-manager': { defineTask() {}, isAvailableAsync: async () => true },
    'expo-speech': { stop: async () => {} },
    'react-native': {
      Platform: { OS: 'android', Version: 34 },
      PermissionsAndroid: { PERMISSIONS: { POST_NOTIFICATIONS: 'notifications' }, RESULTS: { GRANTED: 'granted' }, request: async () => 'granted' },
    },
    './diagnosticStore': {
      readProgress: async () => ({ phase: state.phase }),
      setPhase: async (phase) => { state.phase = phase; },
      recordGpsSample: async () => {}, recordIssue: async () => {},
    },
  };
  const source = readFileSync(path.join(__dirname, '../src/walkDiagnostic.ts'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exported = {};
  vm.runInNewContext(compiled, {
    exports: exported,
    require(name) {
      assert.ok(Object.hasOwn(adapters, name), `Unexpected external adapter: ${name}`);
      return adapters[name];
    },
  });
  return { api: exported, state, entered, release };
}

test('a cancelled pending Start cannot later stop the next accepted Start', async () => {
  const { api, state, entered, release } = diagnosticHarness();
  const first = api.startDiagnostic().catch(() => {});
  await entered.promise;
  await api.suspendDiagnostic('stopped');

  let blockedUntilCleanup = false;
  try { await api.startDiagnostic(); }
  catch (error) {
    assert.match(error.message, /busy|операци|предыдущ|ожида/i);
    blockedUntilCleanup = true;
  }
  release.resolve();
  await first;
  if (blockedUntilCleanup) await api.startDiagnostic();

  assert.equal(state.phase, 'active', 'late cleanup must not overwrite the newer accepted session');
  assert.equal(state.registered, true, 'late cleanup must not unregister the newer accepted session');
  await api.suspendDiagnostic('stopped');
  assert.equal(state.registered, false);
});
