const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const Module = require('node:module');
const filename = path.resolve(__dirname, '../src/discovery/context.ts');
const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const m = new Module(filename, module); m.filename = filename; m.paths = module.paths; m._compile(source, filename);
const context = m.exports;
const NOW = Date.parse('2026-10-20T10:00:00Z');
function fixture(change = {}) {
  return { latitude: 51.17, longitude: 71.45, utc_offset_seconds: 0, timezone: 'GMT',
    current_units: { time: 'unixtime', interval: 'seconds', temperature_2m: '°C', apparent_temperature: '°C', precipitation: 'mm', weather_code: 'wmo code', wind_speed_10m: 'km/h', is_day: '' },
    current: { time: NOW / 1000, interval: 900, temperature_2m: 12, apparent_temperature: 10, precipitation: 0, weather_code: 0, wind_speed_10m: 12, is_day: 1, ...change } };
}
test('current weather accepts exact UTC units and bounded actual values', () => {
  assert.deepEqual(context.parseCurrentWeather(fixture(), NOW), { timeMs: NOW, temperatureC: 12, apparentC: 10, precipitationMm: 0, windKmh: 12, code: 0, isDay: true });
});
test('RAM cache coalesces concurrent requests and prevents another call inside 30 minutes', async () => {
  let calls = 0; let now = NOW;
  const client = new context.DiscoveryWeatherClient({ now: () => now, fetcher: async (url, options) => {
    calls++; assert.equal(url, context.ASTANA_WEATHER_URL); assert.equal(options.credentials, 'omit');
    return { ok: true, json: async () => fixture() };
  } });
  const [first, second] = await Promise.all([client.load(), client.load()]);
  assert.equal(first.status, 'available'); assert.equal(second.status, 'available'); assert.equal(calls, 1);
  now += 29 * 60_000; assert.equal((await client.load()).status, 'available'); assert.equal(calls, 1);
});
test('wrong units, missing fields, unrelated city and invalid finite ranges are refused', () => {
  for (const change of [{ temperature_2m: NaN }, { apparent_temperature: -101 }, { precipitation: -1 }, { wind_speed_10m: 301 },
    { weather_code: 12 }, { is_day: true }, { time: null }, { interval: 0 }]) assert.equal(context.parseCurrentWeather(fixture(change), NOW), null);
  for (const [field, value] of [['temperature_2m', '°F'], ['wind_speed_10m', 'm/s'], ['time', 'iso8601'], ['precipitation', 'inch']]) {
    const wrong = fixture(); wrong.current_units[field] = value; assert.equal(context.parseCurrentWeather(wrong, NOW), null);
  }
  const far = fixture(); far.latitude = 43.2; assert.equal(context.parseCurrentWeather(far, NOW), null);
  const timezone = fixture(); timezone.utc_offset_seconds = 18_000; assert.equal(context.parseCurrentWeather(timezone, NOW), null);
  assert.equal(context.parseCurrentWeather([], NOW), null); assert.equal(context.parseCurrentWeather(null, NOW), null);
});
test('freshness boundaries are exactly 90 minutes past and 10 minutes future', () => {
  assert.ok(context.parseCurrentWeather(fixture({ time: (NOW - 90 * 60_000) / 1000 }), NOW));
  assert.equal(context.parseCurrentWeather(fixture({ time: (NOW - 90 * 60_000 - 1000) / 1000 }), NOW), null);
  assert.ok(context.parseCurrentWeather(fixture({ time: (NOW + 10 * 60_000) / 1000 }), NOW));
  assert.equal(context.parseCurrentWeather(fixture({ time: (NOW + 10 * 60_000 + 1000) / 1000 }), NOW), null);
});
test('cache permits a new user request after 30 minutes, not an automatic fetch', async () => {
  let calls = 0; let now = NOW;
  const client = new context.DiscoveryWeatherClient({ now: () => now, fetcher: async () => { calls++; return { ok: true, json: async () => fixture({ time: now / 1000 }) }; } });
  await client.load(); now += 30 * 60_000; client.read(); assert.equal(calls, 1);
  await client.load(); assert.equal(calls, 2);
});
test('HTTP failure never retries or calls a paid fallback, even repeated manual refresh', async () => {
  let calls = 0;
  const client = new context.DiscoveryWeatherClient({ now: () => NOW, fetcher: async () => { calls++; return { ok: false, json: async () => { throw Error('Must not read failed body'); } }; } });
  assert.equal((await client.load()).status, 'unavailable');
  await client.load(); await client.load(); assert.equal(calls, 1);
});
test('8 second timeout aborts actual boundary signal even if fetch ignores cancellation', async () => {
  let timeout; let signal; let resolve;
  const pending = new Promise((done) => { resolve = done; });
  const client = new context.DiscoveryWeatherClient({ now: () => NOW, schedule: (task, ms) => { assert.equal(ms, 8000); timeout = task; return () => {}; },
    fetcher: async (_url, options) => { signal = options.signal; return pending; } });
  const load = client.load(); timeout(); const result = await load;
  assert.equal(signal.aborted, true); assert.equal(result.reason, 'WEATHER_TIMEOUT');
  resolve({ ok: true, json: async () => fixture() }); await new Promise(setImmediate);
  assert.equal(client.read().status, 'unavailable');
});
test('one cancelled consumer cannot abort a different mounted consumer of shared weather', async () => {
  let signal; let resolve;
  const client = new context.DiscoveryWeatherClient({ now: () => NOW, fetcher: async (_url, options) => {
    signal = options.signal; return new Promise((done) => { resolve = done; });
  } });
  const first = new AbortController(); const second = new AbortController();
  const a = client.load(first.signal); const b = client.load(second.signal); first.abort();
  assert.equal(signal.aborted, false); await a;
  resolve({ ok: true, json: async () => fixture() }); assert.equal((await b).status, 'available');
});
const PLACES = [{ id: 'river', category: 'river' }, { id: 'museum', category: 'history', hasIndoorOption: true }, { id: 'tower', category: 'architecture' }];
const NO_HOLIDAY = Date.parse('2026-02-15T12:00:00Z');
function available(change = {}, time = NO_HOLIDAY) { return { status: 'available', sample: context.parseCurrentWeather(fixture({ time: time / 1000, ...change }), time) }; }
test('sunny minus 20 and sunny strong wind never get the sunshine outdoor boost', () => {
  const cold = available({ temperature_2m: -20, apparent_temperature: -28 });
  assert.equal(context.weatherCondition(cold, 'auto', NO_HOLIDAY), 'cold');
  assert.deepEqual(context.discoveryContextView('ru', PLACES, cold, 'auto', NO_HOLIDAY).rankedPlaceIds, ['museum', 'tower', 'river']);
  assert.equal(context.weatherCondition(available({ wind_speed_10m: 40 }), 'auto', NO_HOLIDAY), 'windy');
  assert.equal(context.weatherCondition(available({ weather_code: 73 }), 'auto', NO_HOLIDAY), 'snow');
  assert.equal(context.weatherCondition(available({ weather_code: 61 }), 'auto', NO_HOLIDAY), 'rain');
});
test('unknown or aged weather gives neutral stable weather ranking without attribution', () => {
  for (const read of [{ status: 'unknown' }, { status: 'stale', sample: available().sample }, available({}, NO_HOLIDAY - 91 * 60_000)]) {
    const result = context.discoveryContextView('en', PLACES, read, 'auto', NO_HOLIDAY);
    assert.equal(result.weatherAdapted, false); assert.deepEqual(result.rankedPlaceIds, ['river', 'museum', 'tower']);
    assert.equal(result.attribution, undefined);
  }
});
test('manual presets are expressly chosen, have no invented temperature, source or live claim in every locale', () => {
  for (const locale of ['ru', 'kk', 'en']) for (const choice of ['sunshine', 'rain', 'cold', 'windy']) {
    const result = context.discoveryContextView(locale, PLACES, available(), choice, NO_HOLIDAY);
    assert.equal(result.attribution, undefined); assert.equal(result.weatherAdapted, true);
    assert.doesNotMatch(result.summary + result.detail, /°C/);
    assert.match(result.summary, /Вы выбрали|Сіз таңдадыңыз|You chose/);
  }
});
test('outside-only building with an indoor option is never promised open or a warm shelter', () => {
  const result = context.discoveryContextView('en', PLACES, { status: 'unknown' }, 'rain', NO_HOLIDAY);
  assert.match(result.reasonByPlace.museum, /short exterior/i); assert.match(result.reasonByPlace.museum, /hours need checking/i);
  assert.match(result.reasonByPlace.river, /exposed/i); assert.equal(result.rankedPlaceIds.at(-1), 'river');
  const indoor = context.discoveryContextView('en', [{ id: 'entry', category: 'history', indoor: true, hoursVerified: false }], available(), 'rain', NO_HOLIDAY);
  assert.match(indoor.reasonByPlace.entry, /check opening hours/i); assert.doesNotMatch(indoor.reasonByPlace.entry, /is open|warm shelter available/i);
});
test('actual data include mandatory Open-Meteo link and current-model limitations in all locales', () => {
  for (const locale of ['ru', 'kk', 'en']) {
    const result = context.discoveryContextView(locale, PLACES, available(), 'auto', NO_HOLIDAY);
    assert.equal(result.attribution.url, 'https://open-meteo.com/'); assert.match(result.summary, /12 °C/);
    assert.match(result.detail, /не прогноз|болжам емес|not a forecast/);
    assert.match(result.detail, /15\.02\.2026 17:00/); assert.match(result.detail, /UTC\+5/);
  }
});
test('Astana calendar crosses midnight at UTC+5 independently of phone timezone', () => {
  assert.equal(context.holidayContext(Date.parse('2026-10-24T18:59:59Z'), 'en').daysUntil, 1);
  const after = context.holidayContext(Date.parse('2026-10-24T19:00:00Z'), 'en'); assert.equal(after.daysUntil, 0); assert.equal(after.id, 'republic');
});
test('transferred off-days are not invented event days and calendar is only 2026', () => {
  assert.equal(context.holidayContext(Date.parse('2026-10-26T08:00:00Z'), 'en'), null);
  assert.equal(context.holidayContext(Date.parse('2027-07-06T08:00:00Z'), 'en'), null);
  assert.equal(context.holidayContext(Date.parse('2026-12-30T08:00:00Z'), 'en'), null);
  assert.equal(context.holidayContext(Date.parse('2026-05-27T08:00:00Z'), 'en').id, 'kurban-2026');
  assert.equal(context.holidayContext(Date.parse('2026-05-28T08:00:00Z'), 'en'), null);
  assert.equal(context.holidayContext(Date.parse('2026-03-15T08:00:00Z'), 'en').id, 'constitution');
  assert.equal(context.holidayContext(Date.parse('2026-08-30T08:00:00Z'), 'en'), null);
});
test('today/upcoming holiday gives grounded historical interest without inventing festivals', () => {
  for (const locale of ['ru', 'kk', 'en']) {
    const result = context.discoveryContextView(locale, PLACES, { status: 'unknown' }, 'auto', NOW);
    assert.equal(result.holiday.id, 'republic'); assert.equal(result.holiday.daysUntil, 5);
    assert.equal(result.rankedPlaceIds[0], 'museum'); assert.equal(result.weatherAdapted, false);
    assert.match(result.detail, /не подтверждены|расталмаған|not been confirmed/);
  }
  const july = context.holidayContext(Date.parse('2026-07-05T21:00:00Z'), 'en'); assert.equal(july.theme, 'capital');
});
