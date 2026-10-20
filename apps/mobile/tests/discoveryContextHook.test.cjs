// Executes the real hook with a recording React/AppState/timer boundary.
// This is a lifecycle/cancellation test, not a React Native renderer or Android test.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
const Module = require('node:module');
const NOW = Date.parse('2026-10-20T10:00:00Z');
const contextPath = path.resolve(__dirname, '../src/discovery/context.ts');
const contextModule = new Module(contextPath, module); contextModule.filename = contextPath; contextModule.paths = module.paths;
const compile = (filename) => ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
contextModule._compile(compile(contextPath), contextPath);
const { DiscoveryWeatherClient } = contextModule.exports;
function fixture() { return { latitude: 51.17, longitude: 71.45, utc_offset_seconds: 0, timezone: 'GMT',
  current_units: { time: 'unixtime', interval: 'seconds', temperature_2m: '°C', apparent_temperature: '°C', precipitation: 'mm', weather_code: 'wmo code', wind_speed_10m: 'km/h', is_day: '' },
  current: { time: NOW / 1000, interval: 900, temperature_2m: 12, apparent_temperature: 10, precipitation: 0, weather_code: 0, wind_speed_10m: 12, is_day: 1 } }; }
function harness(client, initialState = 'active') {
  let index = 0; let nextTimer = 0; let writes = 0; let time = NOW;
  const slots = []; const pendingEffects = []; const timers = new Map(); const listeners = new Set();
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => v === b[i]);
  const memo = (factory, deps) => { const at = index++; if (!slots[at] || !same(slots[at].deps, deps)) slots[at] = { value: factory(), deps }; return slots[at].value; };
  const react = {
    useRef(initial) { const at = index++; return slots[at] ??= { current: initial }; },
    useState(initial) { const at = index++; slots[at] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[at].value, (value) => { writes++; slots[at].value = typeof value === 'function' ? value(slots[at].value) : value; }]; },
    useMemo: memo, useCallback: (fn, deps) => memo(() => fn, deps),
    useEffect(effect, deps) { const at = index++; if (!slots[at] || !same(slots[at].deps, deps)) {
      const old = slots[at]; slots[at] = { deps }; pendingEffects.push(() => { old?.cleanup?.(); slots[at].cleanup = effect(); });
    } },
  };
  const AppState = { currentState: initialState, addEventListener(_name, fn) { listeners.add(fn); return { remove: () => listeners.delete(fn) }; } };
  const addTimer = (fn, delay, repeat) => { const id = ++nextTimer; timers.set(id, { fn, delay, repeat }); return id; };
  class Clock extends Date { static now() { return time; } }
  const output = { exports: {} };
  const filename = path.resolve(__dirname, '../src/discovery/useDiscoveryContext.ts');
  vm.runInNewContext(compile(filename), { module: output, exports: output.exports, require: (id) => {
    if (id === 'react') return react; if (id === 'react-native') return { AppState }; if (id === './context') return contextModule.exports;
    throw Error(`Unexpected hook runtime dependency: ${id}`);
  }, Date: Clock, AbortController, setTimeout: (fn, delay) => addTimer(fn, delay, false), clearTimeout: (id) => timers.delete(id),
  setInterval: (fn, delay) => addTimer(fn, delay, true), clearInterval: (id) => timers.delete(id) }, { filename });
  const places = [{ id: 'river', category: 'river' }];
  return {
    render() { index = 0; const value = output.exports.useDiscoveryContext('en', places, { client }); while (pendingEffects.length) pendingEffects.shift()(); return value; },
    initial() { for (const [id, timer] of [...timers]) if (timer.delay === 0) { timers.delete(id); timer.fn(); } },
    emit(state) { AppState.currentState = state; [...listeners].forEach((fn) => fn(state)); },
    tick(nextTime) { time = nextTime; for (const timer of [...timers.values()]) if (timer.repeat) timer.fn(); },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
    get writes() { return writes; }, get listenerCount() { return listeners.size; }, get timerCount() { return timers.size; },
  };
}
const flush = () => new Promise(setImmediate);
test('unmount aborts the last weather consumer and late completion cannot set hook state', async () => {
  let resolve; let signal;
  const client = new DiscoveryWeatherClient({ now: () => NOW, schedule: () => () => {}, fetcher: async (_url, options) => {
    signal = options.signal; return new Promise((done) => { resolve = done; });
  } });
  const hook = harness(client); hook.render(); hook.initial(); hook.unmount(); const writes = hook.writes;
  assert.equal(signal.aborted, true); resolve({ ok: true, json: async () => fixture() }); await flush();
  assert.equal(hook.writes, writes); assert.equal(client.read().status, 'unavailable');
  assert.equal(hook.listenerCount, 0); assert.equal(hook.timerCount, 0);
});
test('manual preset cancels the old generation and late auto data cannot replace the chosen conditions', async () => {
  let resolve;
  const client = new DiscoveryWeatherClient({ now: () => NOW, schedule: () => () => {}, fetcher: async () => new Promise((done) => { resolve = done; }) });
  const hook = harness(client); hook.render(); hook.initial();
  hook.render().context.choices.find((choice) => choice.id === 'rain').onPress();
  resolve({ ok: true, json: async () => fixture() }); await flush();
  const view = hook.render(); assert.match(view.context.summary, /You chose: rain/); assert.doesNotMatch(view.context.summary, /°C/);
  assert.equal(view.context.attribution, undefined); assert.equal(view.context.busy, false); hook.unmount();
});
test('background mounting does not fetch, and foreground return does not auto-retry', async () => {
  let calls = 0;
  const client = new DiscoveryWeatherClient({ now: () => NOW, fetcher: async () => { calls++; return { ok: true, json: async () => fixture() }; } });
  const hook = harness(client, 'background'); hook.render(); hook.initial(); await flush(); assert.equal(calls, 0);
  hook.emit('active'); await flush(); assert.equal(calls, 0);
  hook.render().context.onRefresh(); await flush(); assert.equal(calls, 1);
  hook.emit('background'); hook.emit('active'); hook.tick(NOW + 60_000); await flush(); assert.equal(calls, 1); hook.unmount();
});
test('local freshness tick removes weather adaptation without making a background request', async () => {
  let now = NOW; let calls = 0;
  const client = new DiscoveryWeatherClient({ now: () => now, fetcher: async () => { calls++; return { ok: true, json: async () => fixture() }; } });
  const hook = harness(client); hook.render(); hook.initial(); await flush(); assert.match(hook.render().context.summary, /12 °C/);
  now += 91 * 60_000; hook.tick(now);
  const stale = hook.render(); assert.match(stale.context.summary, /unavailable/); assert.equal(stale.context.attribution, undefined);
  assert.equal(stale.reasonByPlace.river, ''); assert.equal(calls, 1); hook.unmount();
});
