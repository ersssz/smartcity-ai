// Executes actual CanonicalApp TSX, narration bridge validation, presentation and priority Stop.
// Recording React/AppState/native/repository boundaries exercise callsite behavior; they are
// not a React Native renderer, Android service, codec, or audible/locked-screen acceptance.
const assert = require('node:assert/strict');
const { before, test } = require('node:test');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const mobile = path.resolve(__dirname, '..');
const clone = value => JSON.parse(JSON.stringify(value));
const hash = async value => createHash('sha256').update(value, 'utf8').digest('hex');
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
let contracts, sourceBundle;

before(async () => {
  contracts = await import('@astanaai/contracts');
  const { createReplayPlanner } = await import('@astanaai/walk-planner');
  const at = '2026-10-20T12:00:00.000Z';
  const result = await createReplayPlanner({ hash, now: () => at, id: () => 'narration-callsite-replay' }).plan({
    requestId: 'narration-callsite-request', locale: 'ru',
    origin: { kind: 'public_anchor', anchorId: 'bayterek-outdoor', explicitlyChosen: true },
    startAt: at, budgetMinutes: 80, endRule: { kind: 'return_to_start' }, interests: ['architecture'], constraints: [], contextFlags: [],
  });
  assert.equal(result.kind, 'candidates');
  const { sha256: _hash, ...payload } = clone(result.bundles[0]);
  const registry = JSON.parse(fs.readFileSync(path.join(mobile, 'src/canonical/preparedAudioRegistry.generated.json'), 'utf8'));
  const byId = new Map(registry.entries.map(entry => [entry.id, entry]));
  const used = new Set();
  for (const entry of contracts.narrationEntries(payload)) {
    const asset = byId.get(entry.id);
    assert.ok(asset, `actual canonical narration ${entry.id} has a prepared asset`);
    assert.equal(await hash(entry.text), asset.textSha256);
    Object.assign(entry.audio, { state: 'available', assetId: asset.assetId, textSha256: asset.textSha256, durationSeconds: asset.durationSeconds });
    delete entry.audio.reason;
    if (!used.has(asset.assetId)) {
      payload.assets.items.push({ id: asset.assetId, role: 'audio', locale: entry.locale, sha256: asset.sha256, bytes: asset.bytes,
        required: true, license: asset.license, attribution: asset.attribution, location: { kind: 'bundled', path: asset.path } });
      used.add(asset.assetId);
    }
  }
  sourceBundle = await contracts.sealBundle(payload, hash);
});

function execute(filename, dependencies) {
  const loaded = new Module(filename, module);
  loaded.filename = filename; loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded.require = id => {
    if (Object.hasOwn(dependencies, id)) return dependencies[id];
    throw new Error(`Unexpected real-source runtime dependency: ${id} (${filename})`);
  };
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  loaded._compile(output, filename);
  return loaded.exports;
}

function harness() {
  const trace = [], nativeListeners = new Set(), lifecycleListeners = new Set();
  const bundle = clone(sourceBundle);
  const session = { schemaVersion: 2, sessionId: 'canonical-callsite-session', bundleHash: bundle.sha256, bundleRevision: bundle.revision,
    phase: 'active', version: 1, currentStopIndex: 0, manualStopIds: [], completedStopIds: [], skippedStopIds: [], readStopIds: [], answers: {},
    startedAt: '2026-10-20T12:00:00.000Z', updatedAt: '2026-10-20T12:00:00.000Z' };
  let snapshot = { bundle, session, discoveries: [] };
  let sequence = 0, nextPlayReply, nextStopFailure, captureFailure;
  const scope = () => ({ host: clone(state.hostScope), audio: clone(state.audioScope) });
  function dto(status = 'stopped', ref = null, extra = {}) {
    const generation = ++sequence;
    return { status, assetId: ref ? `audio-${ref.assetSha256}` : null, positionMs: ref ? 123 : 0, durationMs: ref ? 100000 : 0,
      errorCode: null, generation, hostScope: { processNonce: 'recording-process', requestEpoch: generation },
      audioScope: ref ? { processId: 'recording-runtime', playbackEpoch: generation } : null,
      hostPhase: ref ? 'RUNNING' : 'ABSENT', canResume: status === 'paused', pausedReason: status === 'paused' ? 'USER' : null,
      serviceForeground: status === 'playing', ref: clone(ref), ...extra };
  }
  let state = dto();
  const emit = next => { state = clone(next); sequence = Math.max(sequence, state.generation); for (const listener of [...nativeListeners]) listener(clone(state)); };
  const accept = next => { emit(next); return { accepted: true, rejected: null, state: clone(next) }; };
  const native = {
    narrationCaptureScope() { trace.push({ kind: 'capture' }); if (captureFailure) throw captureFailure; return scope(); },
    async narrationPlay(captured, ref) {
      trace.push({ kind: 'play', captured: clone(captured), ref: clone(ref) });
      if (nextPlayReply) { const reply = nextPlayReply; nextPlayReply = undefined; return reply; }
      return accept(dto('playing', ref));
    },
    async narrationPause(captured) { trace.push({ kind: 'pauseAudio', captured: clone(captured) }); return accept(dto('paused', state.ref)); },
    async narrationResume(captured) { trace.push({ kind: 'resumeAudio', captured: clone(captured) }); return accept(dto('playing', state.ref)); },
    async narrationStop() {
      trace.push({ kind: 'stopAudio' });
      if (nextStopFailure) { const failure = nextStopFailure; nextStopFailure = undefined; throw failure; }
      return accept(dto());
    },
    async narrationGetState() { trace.push({ kind: 'getAudio' }); return clone(state); },
    addListener(name, listener) {
      assert.equal(name, 'onNarrationState'); nativeListeners.add(listener);
      return { remove: () => nativeListeners.delete(listener) };
    },
  };
  const repo = {
    async getCurrentSessionId() { trace.push({ kind: 'currentSession' }); return session.sessionId; },
    async open(id) { assert.equal(id, session.sessionId); trace.push({ kind: 'openSession' }); return clone(snapshot); },
    async snapshot() { trace.push({ kind: 'snapshot' }); return clone(snapshot); },
    async dispatch(command) {
      trace.push({ kind: 'dispatch', command: clone(command) });
      // Canned provider responses, not an imitation of the SQL transition implementation.
      if (command.action.type === 'pause') snapshot = { ...snapshot, session: { ...session, phase: 'paused', version: 2 } };
      return clone(snapshot);
    },
  };

  let cursor = 0, dirty = false, tree, unmounted = false;
  const slots = [], effects = [];
  const equalDeps = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const memo = (factory, deps) => {
    const at = cursor++;
    if (!slots[at] || !equalDeps(slots[at].deps, deps)) slots[at] = { value: factory(), deps };
    return slots[at].value;
  };
  const react = {
    useRef(initial) { const at = cursor++; return slots[at] ??= { current: initial }; },
    useState(initial) {
      const at = cursor++;
      slots[at] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[at].value, value => {
        trace.push({ kind: 'reactSet', afterUnmount: unmounted });
        const next = typeof value === 'function' ? value(slots[at].value) : value;
        if (!Object.is(next, slots[at].value)) { slots[at].value = next; dirty = true; }
      }];
    },
    useMemo: memo, useCallback: (fn, deps) => memo(() => fn, deps),
    useEffect(effect, deps) {
      const at = cursor++;
      if (!slots[at] || !equalDeps(slots[at].deps, deps)) {
        const previous = slots[at]; slots[at] = { deps };
        effects.push(() => { previous?.cleanup?.(); slots[at].cleanup = effect(); });
      }
    },
  };
  const AppState = { currentState: 'active', addEventListener(name, listener) {
    assert.equal(name, 'change'); lifecycleListeners.add(listener); return { remove: () => lifecycleListeners.delete(listener) };
  } };
  const WalkExperience = function RecordingWalkExperience() {};
  const CanonicalPreview = function RecordingCanonicalPreview() {};
  const jsx = (type, props) => ({ type, props });
  const narrationModule = execute(path.join(mobile, 'modules/astana-active-walk/src/narration.ts'), {
    'expo-modules-core': { requireNativeModule(name) { assert.equal(name, 'AstanaActiveWalk'); return native; } },
  });
  const presentation = execute(path.join(mobile, 'src/canonical/presentation.ts'), {});
  const priorityStop = execute(path.join(mobile, 'src/walk/priorityStop.ts'), {});
  const App = execute(path.join(mobile, 'src/canonical/CanonicalApp.tsx'), {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { AppState, StyleSheet: { create: value => value }, ActivityIndicator: 'ActivityIndicator', Pressable: 'Pressable',
      SafeAreaView: 'SafeAreaView', Text: 'Text', View: 'View', Alert: { alert: (...args) => trace.push({ kind: 'alert', args }) },
      Linking: { openURL: async () => { throw new Error('External navigation not allowed in this harness'); } } },
    '@astanaai/contracts': contracts,
    '../features/walk/WalkExperience': { __esModule: true, default: WalkExperience }, '../features/walk/CanonicalPreview': { __esModule: true, default: CanonicalPreview },
    '../../modules/astana-active-walk/src': { nativeActiveWalk: { async stop() { trace.push({ kind: 'stopTracking' }); return { foreground: false, subscribed: false, status: 'stopped' }; } } },
    '../../modules/astana-active-walk/src/narration': narrationModule,
    './mobileSession': { async getCanonicalSession() { trace.push({ kind: 'repository' }); return repo; } },
    './preparation': { async verifyInstalledWalk(value) { assert.equal(value.sha256, bundle.sha256); return { state: 'partial', missing: [{ id: 'map' }] }; },
      async prepareCanonicalWalk() { throw new Error('This harness restores a real canonical bundle'); } },
    './presentation': presentation, '../walk/priorityStop': priorityStop,
  }).default;
  const props = { initialLocale: 'ru', onBack: () => trace.push({ kind: 'navigateBack' }), onOpenCity: () => trace.push({ kind: 'navigateCity' }),
    onOpenDiagnostics: () => trace.push({ kind: 'navigateDiagnostics' }), onLocaleChange: async locale => trace.push({ kind: 'persistLocale', locale }) };
  function render() { assert.equal(unmounted, false); cursor = 0; dirty = false; tree = App(props); while (effects.length) effects.shift()(); return tree; }
  async function settle(turns = 5) { for (let i = 0; i < turns; i++) { await new Promise(setImmediate); if (dirty && !unmounted) render(); } }
  return {
    trace, bundle,
    async ready() { render(); await settle(); assert.equal(tree.type, WalkExperience); assert.equal(tree.props.busy, false); trace.length = 0; return this; },
    get ui() { if (dirty) render(); assert.equal(tree.type, WalkExperience); return tree.props; },
    get state() { return clone(state); }, get listenerCount() { return nativeListeners.size; }, get lifecycleCount() { return lifecycleListeners.size; },
    get currentScope() { return scope(); },
    expectedRef(stop = bundle.stops[0], locale = 'ru') {
      const narrationId = `chapter:${stop.id}:${locale}`;
      const entry = contracts.narrationEntries(bundle).find(item => item.id === narrationId);
      const asset = bundle.assets.items.find(item => item.id === entry.audio.assetId);
      return { walkSessionId: session.sessionId, bundleSha256: bundle.sha256, narrationId, locale,
        assetPath: `astana-${asset.location.path}`, assetSha256: asset.sha256 };
    },
    async inject(status, ref, extra) { emit(dto(status, ref, extra)); await settle(); },
    emitRaw: emit,
    emitApp(next) { AppState.currentState = next; for (const listener of [...lifecycleListeners]) listener(next); },
    holdNextPlay() { const held = deferred(); nextPlayReply = held.promise; return held; },
    rejectNextPlay(code = 'STALE_HOST_SCOPE') { nextPlayReply = Promise.resolve({ accepted: false, rejected: code, state: clone(state) }); },
    failNextStop() { nextStopFailure = new Error('STOP_UNCONFIRMED'); },
    failCapture() { captureFailure = new Error('NARRATION_UNAVAILABLE'); },
    settle,
    unmount() { if (unmounted) return; unmounted = true; for (const slot of slots) slot?.cleanup?.(); },
  };
}
const events = (h, kind) => h.trace.filter(event => event.kind === kind);
const kinds = h => h.trace.map(event => event.kind);

test('real TSX captures the gesture before operate state writes and sends the exact prepared identity without a pre-Play Stop', async t => {
  const h = await harness().ready(); t.after(() => h.unmount());
  const expectedScope = h.currentScope, ref = h.expectedRef();
  h.ui.onSpeak(h.bundle.stops[0].id);
  assert.equal(h.trace[0].kind, 'capture');
  assert.ok(kinds(h).indexOf('capture') < kinds(h).indexOf('reactSet'));
  assert.deepEqual(events(h, 'play'), [{ kind: 'play', captured: expectedScope, ref }]);
  assert.equal(events(h, 'stopAudio').length, 0);
  await h.settle(); assert.equal(h.ui.audio.playing, true); assert.equal(h.ui.busy, false);
});

test('background retains accepted narration; foreground only observes state and never autoplays', async t => {
  const h = await harness().ready(); t.after(() => h.unmount());
  h.ui.onSpeak(h.bundle.stops[0].id); await h.settle(); h.trace.length = 0;
  h.emitApp('background'); await h.settle();
  assert.equal(h.ui.audio.playing, true); assert.deepEqual(kinds(h), []);
  h.emitApp('active'); await h.settle();
  assert.equal(events(h, 'getAudio').length, 1); assert.equal(events(h, 'snapshot').length, 1);
  for (const kind of ['play', 'resumeAudio', 'pauseAudio', 'stopAudio', 'stopTracking', 'capture']) assert.equal(events(h, kind).length, 0, kind);
  assert.equal(h.ui.audio.playing, true);
});

test('late accepted native Play after background does not trigger a JS Stop, retry, or automatic Resume', async t => {
  const h = await harness().ready(); t.after(() => h.unmount());
  const held = h.holdNextPlay(); h.ui.onSpeak(h.bundle.stops[0].id);
  h.emitApp('background'); await h.inject('playing', h.expectedRef());
  held.resolve({ accepted: true, rejected: null, state: h.state }); await h.settle();
  assert.equal(events(h, 'play').length, 1); assert.equal(events(h, 'capture').length, 1);
  for (const kind of ['resumeAudio', 'stopAudio', 'stopTracking', 'pauseAudio']) assert.equal(events(h, kind).length, 0, kind);
  assert.equal(h.ui.audio.playing, true); assert.equal(h.ui.busy, false);
});

test('explicit Stop invokes both native boundaries before a held Play settles, then persists walk pause', async t => {
  const h = await harness().ready(); t.after(() => h.unmount());
  const held = h.holdNextPlay(); h.ui.onSpeak(h.bundle.stops[0].id); h.ui.onStop();
  assert.equal(events(h, 'stopTracking').length, 1); assert.equal(events(h, 'stopAudio').length, 1);
  assert.equal(events(h, 'dispatch').length, 0); assert.equal(h.ui.busy, true);
  h.ui.onSpeak(h.bundle.stops[0].id); assert.equal(events(h, 'capture').length, 1);
  held.resolve({ accepted: false, rejected: 'STALE_HOST_SCOPE', state: h.state }); await h.settle();
  assert.equal(events(h, 'play').length, 1); assert.equal(h.ui.audio.playing, false); assert.equal(h.ui.busy, false);
  assert.deepEqual(events(h, 'dispatch').map(event => event.command.action), [{ type: 'pause' }]);
  assert.ok(kinds(h).indexOf('dispatch') > kinds(h).indexOf('stopAudio'));
});

for (const [callback, navigation] of [['onOpenCity', 'navigateCity'], ['onOpenDiagnostics', 'navigateDiagnostics'], ['onBackToSaved', 'navigateBack']]) {
  test(`${callback} stops narration and tracking before navigation, preserving a pause action`, async t => {
    const h = await harness().ready(); t.after(() => h.unmount());
    h.ui.onSpeak(h.bundle.stops[0].id); await h.settle(); h.trace.length = 0;
    h.ui[callback](); await h.settle();
    assert.equal(events(h, 'stopAudio').length, 1); assert.equal(events(h, 'stopTracking').length, 1);
    assert.equal(events(h, navigation).length, 1);
    assert.ok(kinds(h).indexOf(navigation) > kinds(h).indexOf('dispatch'));
    assert.deepEqual(events(h, 'dispatch')[0].command.action, { type: 'pause' });
    assert.equal(events(h, 'play').length, 0);
  });
}

test('a failed audio Stop blocks navigation while still attempting tracking cleanup and durable pause', async t => {
  const h = await harness().ready(); t.after(() => h.unmount());
  h.failNextStop(); h.ui.onOpenCity(); await h.settle();
  assert.equal(events(h, 'stopTracking').length, 1); assert.equal(events(h, 'dispatch').length, 1);
  assert.equal(events(h, 'navigateCity').length, 0); assert.match(h.ui.error, /остановк/i); assert.equal(h.ui.busy, false);
});

test('unmount stops audio, detaches listeners and refuses late UI writes', async () => {
  const h = await harness().ready();
  h.ui.onSpeak(h.bundle.stops[0].id); await h.settle(); h.trace.length = 0;
  assert.equal(h.listenerCount, 1); assert.equal(h.lifecycleCount, 1);
  h.unmount(); await h.settle();
  assert.equal(events(h, 'stopAudio').length, 1); assert.equal(h.listenerCount, 0); assert.equal(h.lifecycleCount, 0);
  h.emitApp('active'); h.emitRaw(h.state); await h.settle();
  assert.equal(events(h, 'getAudio').length, 0); assert.equal(events(h, 'reactSet').length, 0);
});

test('only a resumable paused exact six-field narration identity uses Resume', async t => {
  const h = await harness().ready(); t.after(() => h.unmount());
  await h.inject('paused', h.expectedRef()); h.trace.length = 0;
  const captured = h.currentScope; h.ui.onSpeak(h.bundle.stops[0].id); await h.settle();
  assert.deepEqual(events(h, 'resumeAudio'), [{ kind: 'resumeAudio', captured }]);
  assert.equal(events(h, 'play').length, 0); assert.equal(events(h, 'capture').length, 1);
});

test('shared MP3 identity never resumes a different session, bundle, chapter or locale; expired pause starts a new explicit Play', async t => {
  const h = await harness().ready(); t.after(() => h.unmount());
  const ref = h.expectedRef();
  const alternatives = [
    { ...ref, walkSessionId: 'another-session' },
    { ...ref, bundleSha256: 'f'.repeat(64) },
    { ...ref, narrationId: 'cue:pause:ru' },
    { ...ref, narrationId: ref.narrationId.replace(/:ru$/, ':en'), locale: 'en' },
    { ...ref, assetPath: `astana-audio/${'a'.repeat(64)}.mp3`, assetSha256: 'a'.repeat(64) },
  ];
  for (const other of alternatives) {
    await h.inject('paused', other); h.trace.length = 0;
    h.ui.onSpeak(h.bundle.stops[0].id); await h.settle();
    assert.equal(events(h, 'resumeAudio').length, 0, JSON.stringify(other));
    assert.equal(events(h, 'play').length, 1); assert.deepEqual(events(h, 'play')[0].ref, ref);
  }
  await h.inject('paused', ref, { canResume: false, pausedReason: 'EXPIRED' }); h.trace.length = 0;
  h.ui.onSpeak(h.bundle.stops[0].id); await h.settle();
  assert.equal(events(h, 'resumeAudio').length, 0); assert.equal(events(h, 'play').length, 1);
});

test('a stale native rejection is visible and never borrows a new scope or retries', async t => {
  const h = await harness().ready(); t.after(() => h.unmount());
  h.rejectNextPlay(); h.ui.onSpeak(h.bundle.stops[0].id); await h.settle(10);
  assert.equal(events(h, 'capture').length, 1); assert.equal(events(h, 'play').length, 1);
  assert.equal(events(h, 'resumeAudio').length, 0); assert.equal(events(h, 'stopAudio').length, 0);
  assert.match(h.ui.error, /Не удалось/); assert.equal(h.ui.busy, false);
});

test('audio Pause captures scope but does not pause the walk or stop tracking', async t => {
  const h = await harness().ready(); t.after(() => h.unmount());
  h.ui.onSpeak(h.bundle.stops[0].id); await h.settle(); h.trace.length = 0;
  const captured = h.currentScope; h.ui.onPauseAudio(); await h.settle();
  assert.equal(h.trace[0].kind, 'capture');
  assert.deepEqual(events(h, 'pauseAudio'), [{ kind: 'pauseAudio', captured }]);
  assert.equal(events(h, 'stopTracking').length, 0); assert.equal(events(h, 'dispatch').length, 0);
  assert.equal(h.ui.audio.playing, false);
});

test('Pause during cold STARTING cancels the pending audio request without pretending a player is resumable', async t => {
  const h = await harness().ready(); t.after(() => h.unmount());
  const held = h.holdNextPlay(); h.ui.onSpeak(h.bundle.stops[0].id);
  await h.inject('stopped', null, { hostPhase: 'STARTING' });
  assert.equal(h.currentScope.audio, null); assert.equal(h.ui.audio.playing, true);
  h.trace.length = 0; h.ui.onPauseAudio();
  assert.equal(events(h, 'capture').length, 1);
  assert.equal(events(h, 'stopAudio').length, 1);
  assert.equal(events(h, 'pauseAudio').length, 0);
  assert.equal(events(h, 'stopTracking').length, 0); assert.equal(events(h, 'dispatch').length, 0);
  held.resolve({ accepted: false, rejected: 'STALE_HOST_SCOPE', state: h.state }); await h.settle();
  assert.equal(h.ui.audio.playing, false); assert.equal(events(h, 'play').length, 0);
});

test('audio-only Stop keeps walk progress and tracking separate', async t => {
  const h = await harness().ready(); t.after(() => h.unmount());
  h.ui.onSpeak(h.bundle.stops[0].id); await h.settle(); h.trace.length = 0;
  h.ui.onStopAudio(); await h.settle();
  assert.equal(events(h, 'stopAudio').length, 1); assert.equal(h.ui.audio.playing, false);
  assert.equal(events(h, 'stopTracking').length, 0); assert.equal(events(h, 'dispatch').length, 0);
});

test('unmount with a held command stops sound immediately and late rejection cannot update the removed screen', async () => {
  const h = await harness().ready();
  const held = h.holdNextPlay(); h.ui.onSpeak(h.bundle.stops[0].id); h.trace.length = 0;
  h.unmount();
  assert.equal(events(h, 'stopAudio').length, 1); assert.equal(h.listenerCount, 0); assert.equal(h.lifecycleCount, 0);
  held.resolve({ accepted: false, rejected: 'STALE_HOST_SCOPE', state: h.state }); await h.settle();
  assert.equal(events(h, 'reactSet').length, 0); assert.equal(events(h, 'play').length, 0);
});

test('unavailable capture and background gestures fail closed before native Play', async t => {
  const h = await harness().ready(); t.after(() => h.unmount());
  h.failCapture(); h.ui.onSpeak(h.bundle.stops[0].id); await h.settle();
  assert.equal(events(h, 'play').length, 0); assert.match(h.ui.error, /Звук/);
  h.trace.length = 0; h.emitApp('background'); h.ui.onSpeak(h.bundle.stops[0].id); await h.settle();
  assert.equal(events(h, 'capture').length, 0); assert.equal(events(h, 'play').length, 0);
});

test('changing locale stops audio before persistence and never auto-starts another language', async t => {
  const h = await harness().ready(); t.after(() => h.unmount());
  h.ui.onSpeak(h.bundle.stops[0].id); await h.settle(); h.trace.length = 0;
  h.ui.onLocaleChange('kk'); await h.settle();
  assert.equal(h.ui.locale, 'kk'); assert.equal(events(h, 'stopAudio').length, 1);
  assert.deepEqual(events(h, 'persistLocale'), [{ kind: 'persistLocale', locale: 'kk' }]);
  assert.ok(kinds(h).indexOf('stopAudio') < kinds(h).indexOf('persistLocale'));
  assert.equal(events(h, 'play').length, 0); assert.equal(events(h, 'resumeAudio').length, 0);
});
