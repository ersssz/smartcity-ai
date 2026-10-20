// Native/RN-permission/SQLite boundary simulations. These tests do not prove
// Android service behavior, GPS delivery, native privacy or device acceptance.
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

function nativeState(overrides = {}) {
  return {
    status: 'stopped', generation: 0, foreground: false, subscribed: false,
    precision: 'fine', providerEnabled: true, notificationsEnabled: true,
    fixStatus: 'no-fix', lastFixAgeMs: null, accuracyMeters: null,
    fixTimestampMs: null, sampleCount: 0, errorCode: null,
    ...overrides,
  };
}

function diagnosticHarness(options = {}) {
  const state = {
    phase: options.phase ?? 'stopped',
    native: nativeState(options.native),
    starts: 0,
    stops: 0,
    reads: 0,
    phaseWrites: [],
    locationPermission: options.locationPermission ?? 'fine',
    notifications: options.notifications ?? 'granted',
    readFails: false,
    writeFails: false,
  };
  const entered = deferred();
  const release = deferred();
  const nativeActiveWalk = {
    async getState() { return state.native; },
    async start() {
      state.starts++;
      if (options.holdFirstStart && state.starts === 1) {
        entered.resolve();
        await release.promise;
      }
      state.native = options.startResult
        ? nativeState(options.startResult)
        : nativeState({
          status: 'running', generation: state.native.generation + 1,
          foreground: true, subscribed: true, precision: state.locationPermission,
        });
      return state.native;
    },
    async stop() {
      state.stops++;
      state.native = nativeState({ generation: state.native.generation + 1 });
      return state.native;
    },
  };
  const adapters = {
    '../modules/astana-active-walk/src': { nativeActiveWalk },
    'expo-speech': { stop: async () => {} },
    'react-native': {
      Platform: { OS: 'android', Version: 34 },
      PermissionsAndroid: {
        PERMISSIONS: {
          ACCESS_COARSE_LOCATION: 'coarse', ACCESS_FINE_LOCATION: 'fine',
          POST_NOTIFICATIONS: 'notifications',
        },
        RESULTS: { GRANTED: 'granted', DENIED: 'denied', NEVER_ASK_AGAIN: 'never_ask_again' },
        async requestMultiple(permissions) {
          if (options.holdPermission === 'location') {
            entered.resolve();
            await release.promise;
          }
          return Object.fromEntries(permissions.map((permission) => [
            permission, state.locationPermission === 'fine' ||
              (permission === 'coarse' && state.locationPermission === 'coarse')
              ? 'granted' : 'denied',
          ]));
        },
        async request() {
          if (options.holdPermission === 'notification') {
            entered.resolve();
            await release.promise;
          }
          return state.notifications;
        },
      },
    },
    './diagnosticStore': {
      async readProgress() {
        state.reads++;
        if (options.holdFirstRead && state.reads === 1) {
          entered.resolve();
          await release.promise;
        }
        if (state.readFails) throw new Error('Simulated SQLite read failure');
        return { phase: state.phase };
      },
      async setPhase(phase) {
        if (state.writeFails) throw new Error('Simulated SQLite write failure');
        if ((phase === 'active' && options.holdActiveWrite) ||
            (phase === 'paused' && options.holdPausedWrite)) {
          entered.resolve();
          await release.promise;
        }
        state.phaseWrites.push(phase);
        state.phase = phase;
      },
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

test('capability reports native service truth even when durable progress says active', async () => {
  const { api, state } = diagnosticHarness({ phase: 'active' });
  assert.deepEqual(await api.readLocationCapability(), state.native);
  assert.equal(state.starts, 0, 'reading capability must never start tracking');
});

test('a cancelled pending Start cannot later stop the next accepted Start', { timeout: 5000 }, async () => {
  const { api, state, entered, release } = diagnosticHarness({ holdFirstStart: true });
  const first = api.startDiagnostic().catch(() => {});
  await entered.promise;
  assert.equal(state.phaseWrites.includes('active'), false, 'pending native admission is not an active walk');
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
  assert.equal((await api.readLocationCapability()).status, 'running');
  await api.suspendDiagnostic('stopped');
  assert.equal((await api.readLocationCapability()).subscribed, false);
});

test('denied location or notification permission never starts native acquisition', async () => {
  for (const denied of [{ locationPermission: 'denied' }, { notifications: 'denied' }]) {
    const { api, state } = diagnosticHarness(denied);
    await assert.rejects(api.startDiagnostic());
    assert.equal(state.starts, 0, 'permission refusal must not invoke native Start');
    assert.equal(state.phaseWrites.includes('active'), false);
    assert.equal((await api.readLocationCapability()).status, 'stopped');
  }

  const { api, state } = diagnosticHarness({ locationPermission: 'coarse' });
  await api.startDiagnostic();
  assert.equal(state.phase, 'active', 'approximate permission remains a supported explicit choice');
  assert.equal((await api.readLocationCapability()).precision, 'coarse');
});

test('native failure or partial promotion never becomes an active walk', async () => {
  for (const startResult of [
    { status: 'error', errorCode: 'provider-disabled' },
    { status: 'running', foreground: false, subscribed: true },
    { status: 'running', foreground: true, subscribed: false },
  ]) {
    const { api, state } = diagnosticHarness({ startResult });
    await assert.rejects(api.startDiagnostic());
    assert.equal(state.phaseWrites.includes('active'), false, 'an error or partial service must never be committed as active');
    const capability = await api.readLocationCapability();
    assert.equal(capability.status, 'stopped');
    assert.equal(capability.subscribed, false, 'failed admission must remove any partial subscription');
  }
});

test('SQLite failures block Start and cannot prevent native cleanup or Stop', async () => {
  const unreadable = diagnosticHarness();
  unreadable.state.readFails = true;
  await assert.rejects(unreadable.api.startDiagnostic());
  assert.equal(unreadable.state.starts, 0, 'unreadable progress must block acquisition');

  const unwritable = diagnosticHarness();
  unwritable.state.writeFails = true;
  await assert.rejects(unwritable.api.startDiagnostic());
  assert.equal(unwritable.state.starts, 1, 'this case fails after native admission');
  assert.equal((await unwritable.api.readLocationCapability()).status, 'stopped');

  const active = diagnosticHarness();
  await active.api.startDiagnostic();
  active.state.readFails = true;
  active.state.writeFails = true;
  await assert.rejects(active.api.suspendDiagnostic('stopped'), /SQLite/);
  const capability = await active.api.readLocationCapability();
  assert.equal(capability.status, 'stopped');
  assert.equal(capability.foreground, false);
  assert.equal(capability.subscribed, false, 'storage outage must not leave a live collector');
});

test('granting a delayed permission after Stop cannot start a cancelled walk', { timeout: 5000 }, async () => {
  for (const holdPermission of ['location', 'notification']) {
    const { api, state, entered, release } = diagnosticHarness({ holdPermission });
    const result = api.startDiagnostic().then(() => 'accepted', () => 'cancelled');
    await entered.promise;
    await api.suspendDiagnostic('stopped');
    release.resolve();

    assert.equal(await result, 'cancelled');
    assert.equal(state.starts, 0, 'a late permission grant cannot authorize a new native Start');
    assert.equal(state.phase, 'stopped');
    assert.equal(state.phaseWrites.includes('active'), false);
  }
});

test('a delayed active write cannot undo the most recent Pause or Stop', { timeout: 5000 }, async () => {
  for (const stopPhase of ['paused', 'stopped']) {
    const { api, state, entered, release } = diagnosticHarness({ holdActiveWrite: true });
    const result = api.startDiagnostic().then(() => 'accepted', () => 'cancelled');
    await entered.promise;
    await api.reconcileDiagnostic();
    assert.equal((await api.readLocationCapability()).status, 'running', 'observation during Start must not cancel its admitted native service');
    await api.suspendDiagnostic(stopPhase);
    assert.equal((await api.readLocationCapability()).status, 'stopped');
    release.resolve();

    assert.equal(await result, 'cancelled');
    assert.equal(state.phase, stopPhase, 'late persistence must retain the user-selected stopped state');
    assert.equal((await api.readLocationCapability()).subscribed, false);
    await api.startDiagnostic();
    assert.equal(state.phase, 'active', 'a new explicit Start remains available after cancelled work settles');
    assert.equal((await api.readLocationCapability()).status, 'running');
  }
});

test('reconciliation follows native lifetime and never automatically starts tracking', async () => {
  const interrupted = diagnosticHarness({ phase: 'active' });
  await interrupted.api.reconcileDiagnostic(true);
  assert.equal(interrupted.state.phase, 'paused', 'durable active progress cannot revive a dead service');
  assert.equal(interrupted.state.starts, 0);

  const reloaded = diagnosticHarness({
    phase: 'active',
    native: { status: 'running', foreground: true, subscribed: true, generation: 4 },
  });
  await reloaded.api.reconcileDiagnostic(true);
  assert.equal(reloaded.state.phase, 'active', 'a JS reload preserves an already-running explicit session');
  assert.equal((await reloaded.api.readLocationCapability()).generation, 4);
  assert.equal(reloaded.state.starts, 0);
  assert.equal(reloaded.state.stops, 0);

  const notificationStop = diagnosticHarness();
  await notificationStop.api.startDiagnostic();
  // Simulate the native notification action without calling the JS Stop handler.
  notificationStop.state.native = nativeState({ generation: 2 });
  await notificationStop.api.reconcileDiagnostic();
  assert.equal(notificationStop.state.phase, 'paused');
  assert.equal(notificationStop.state.starts, 1, 'observation of native Stop must not restart acquisition');
  assert.equal((await notificationStop.api.readLocationCapability()).status, 'stopped');
});

test('a stale reconciliation cannot pause a newer accepted Start', { timeout: 5000 }, async () => {
  const { api, state, entered, release } = diagnosticHarness({ holdFirstRead: true });
  const oldObservation = api.reconcileDiagnostic();
  await entered.promise;
  await api.startDiagnostic();
  assert.equal(state.phase, 'active');
  assert.equal((await api.readLocationCapability()).status, 'running');
  release.resolve();
  await oldObservation;

  assert.equal(state.phase, 'active', 'an older stopped observation must not pause a newly accepted walk');
  assert.equal((await api.readLocationCapability()).status, 'running');
  await api.reconcileDiagnostic();
  assert.equal((await api.readLocationCapability()).status, 'running', 'the following refresh must preserve the new session');
});

test('a delayed Pause write cannot undo a later explicit Stop', { timeout: 5000 }, async () => {
  const { api, state, entered, release } = diagnosticHarness({ holdPausedWrite: true });
  await api.startDiagnostic();
  const olderPause = api.suspendDiagnostic('paused');
  await entered.promise;
  await api.suspendDiagnostic('stopped');
  assert.equal(state.phase, 'stopped');
  assert.equal((await api.readLocationCapability()).status, 'stopped');
  release.resolve();
  await olderPause;

  assert.equal(state.phase, 'stopped', 'the last user action must win even when an earlier write completes later');
  assert.equal((await api.readLocationCapability()).subscribed, false);
});
