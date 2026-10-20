'use strict';
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('../../../apps/mobile/node_modules/typescript');
function load(filename, cache = new Map()) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const m = new Module(filename, module);
  cache.set(filename, m);
  m.filename = filename;
  m.paths = Module._nodeModulePaths(path.dirname(filename));
  const nativeRequire = m.require.bind(m);
  m.require = id => id.startsWith('.')
    ? load(path.resolve(path.dirname(filename), id.replace(/\.js$/, '') + '.ts'), cache)
    : nativeRequire(id);
  m._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, filename);
  return m.exports;
}
const api = load(path.resolve(__dirname, '../src/index.ts'));
const contracts = load(path.resolve(__dirname, '../../contracts/src/index.ts'));
const { synthetic, known, unknown, text } = require('./synthetic.cjs');
const query = changes => ({ locale: 'ru', at: '2026-10-20T12:00:00.000Z',
  area: { kind: 'public_zone', zoneId: 'astana:bayterek-research' },
  terms: [], interests: [], required: [], limit: 24, ...changes });

test('real sourced RU/KK/EN Baiterek names retrieve the same place and curated public anchor', async () => {
  const evidence = api.createCityEvidence();
  for (const [locale, name] of [['ru', 'Байтерек'], ['kk', 'Бәйтерек'], ['en', 'Bayterek']]) {
    const result = await evidence.search(query({ locale, terms: [name] }));
    assert.equal(contracts.EvidenceSetSchema.safeParse(result).success, true);
    assert.deepEqual(result.pois.map(p => p.id), ['osm:way/230401645']);
    assert.deepEqual(result.pois[0].anchorIds, ['bayterek-outdoor']);
    assert.ok(result.pois[0].factRefs.includes('fact-tree-life'));
    assert.equal(result.anchors[0].fieldVerified, false);
    assert.equal(result.coverage.complete, false);
  }
});

test('a selected real place returns only its relevant fact/anchor/source closure', async () => {
  const result = await api.createCityEvidence().search(query({ terms: ['Байтерек'] }));
  assert.deepEqual(result.anchors.map(a => a.id), ['bayterek-outdoor']);
  assert.deepEqual(result.facts.map(f => f.id).sort(), ['fact-tree-life', 'osm-name:way:230401645']);
  assert.deepEqual(result.sources.map(s => s.id).sort(), ['osm-first-walk-source', 'osm-source:way:230401645', 'src-baiterek']);
  const editorial = result.sources.find(s => s.id === 'src-baiterek');
  assert.equal(editorial.checkedAt, '2026-10-20');
  const noMatch = await api.createCityEvidence().search(query({ terms: ['place-that-does-not-exist'] }));
  assert.deepEqual([noMatch.pois, noMatch.anchors, noMatch.facts, noMatch.sources], [[], [], [], []]);
});

test('area filtering precedes the limit and can locate a curated observation area without inventing a center', async () => {
  const evidence = api.createCityEvidence();
  const result = await evidence.search(query({ area: { kind: 'bounds',
    bounds: [71.41490, 51.13070, 71.41496, 51.13074] }, limit: 1 }));
  assert.deepEqual(result.pois.map(p => p.id), ['curated:place:round-square']);
  assert.equal(result.pois[0].center.state, 'unknown');
  assert.deepEqual(result.anchors.map(a => a.id), ['round-square-outdoor']);
  const unknownZone = await evidence.search(query({ area: { kind: 'public_zone', zoneId: 'unsupported-zone' } }));
  assert.deepEqual(unknownZone.pois, []);
});

test('real required-anchor filtering precedes limit and critical unknowns never become promises', async () => {
  const evidence = api.createCityEvidence();
  const anchored = await evidence.search(query({ required: ['public_anchor'], limit: 1 }));
  assert.deepEqual(anchored.pois.map(p => p.id), ['osm:way/230401645']);
  const allAnchored = await evidence.search(query({ required: ['public_anchor'] }));
  assert.deepEqual(allAnchored.pois.map(p => p.id).sort(),
    ['osm:way/230401645', 'curated:place:nurzhol', 'curated:place:round-square'].sort());
  for (const required of ['indoor', 'coffee', 'step_free']) {
    assert.deepEqual((await evidence.search(query({ required: [required] }))).pois, []);
  }
});

test('lexical prefixes and Unicode punctuation work while unsupported interests do not seed a fallback', async () => {
  const evidence = api.createCityEvidence();
  const square = await evidence.search(query({ locale: 'en', terms: ['ROUND—SQU'] }));
  assert.deepEqual(square.pois.map(p => p.id), ['curated:place:round-square']);
  const tait = await evidence.search(query({ locale: 'en', terms: ['bait'] }));
  assert.deepEqual(tait.pois.map(p => p.id), ['osm:way/230401645']);
  for (const interest of ['coffee', 'parks']) {
    assert.deepEqual((await evidence.search(query({ interests: [interest] }))).pois, []);
  }
  const named = await evidence.search(query({ terms: ['Байтерек'], interests: ['parks'] }));
  assert.deepEqual(named.pois.map(p => p.id), ['osm:way/230401645']);
  assert.deepEqual((await evidence.search(query({ terms: ['!!!'] }))).pois, []);
});

test('dated evidence preserves conflict/stale states and ages expired or future observations honestly', async () => {
  const result = await api.createCityEvidence(synthetic()).search(query({
    area: { kind: 'public_zone', zoneId: 'synthetic-zone' }, terms: ['Target'] }));
  const byId = new Map(result.pois.map(p => [p.id, p]));
  assert.equal(byId.get('synthetic:1').services.coffee.state, 'known');
  assert.equal(byId.get('synthetic:2').services.coffee.state, 'conflicting');
  assert.equal(byId.get('synthetic:3').services.coffee.state, 'stale');
  assert.equal('value' in byId.get('synthetic:3').services.coffee, false);
  assert.equal(byId.get('synthetic:4').services.coffee.state, 'unknown');
  assert.equal(byId.get('synthetic:5').services.coffee.reason, 'Already stale in source');
  assert.equal(result.context.evaluatedAt, result.evaluatedAt);
});

test('bad query and broken catalog references fail generically without echoing input', async () => {
  const evidence = api.createCityEvidence();
  await assert.rejects(() => evidence.search(query({ limit: 25, terms: ['private-marker-not-to-echo'] })),
    error => error.code === 'INVALID_QUERY' && !error.message.includes('private-marker'));
  const broken = synthetic();
  broken.pois[0].factRefs = ['missing-fact'];
  assert.throws(() => api.createCityEvidence(broken), error => error.code === 'INVALID_CATALOG');
});

test('expired facts disappear with their refs while dated editorial history keeps its original precision', async () => {
  const result = await api.createCityEvidence().search(query({ terms: ['Байтерек'], at: '2026-11-01T12:00:00.000Z' }));
  assert.equal(result.pois[0].center.state, 'stale');
  assert.deepEqual(result.pois[0].factRefs, ['fact-tree-life']);
  assert.deepEqual(result.facts.map(f => f.id), ['fact-tree-life']);
  assert.equal(result.facts[0].checkedAt, '2026-10-20');
  const source = synthetic();
  source.facts[0].validUntil = '2026-10-20T11:00:00.000Z';
  const expired = await api.createCityEvidence(source).search(query({
    area: { kind: 'public_zone', zoneId: 'synthetic-zone' }, terms: ['Target'], limit: 1 }));
  assert.deepEqual(expired.pois[0].factRefs, []);
  assert.deepEqual(expired.facts, []);
});

test('critical filtering precedes lexical rank/limit and closing instants are excluded', async () => {
  const evidence = api.createCityEvidence(synthetic());
  const request = query({ area: { kind: 'public_zone', zoneId: 'synthetic-zone' },
    terms: ['Target'], required: ['indoor', 'coffee', 'step_free'], limit: 1 });
  const result = await evidence.search(request);
  assert.deepEqual(result.pois.map(p => p.id), ['synthetic:1']);
  assert.deepEqual((await evidence.search({ ...request, at: '2026-10-20T13:00:00.000Z' })).pois, []);
});

test('context ages independently by model time and derives season in the declared city timezone', async () => {
  const source = synthetic();
  source.context.weather = known({ model: 'synthetic-old-model', updatedAt: '2026-10-20T00:00:00.000Z',
    retrievedAt: '2026-10-20T11:00:00.000Z', temperatureC: -3, windMetersPerSecond: 2 });
  const result = await api.createCityEvidence(source).search(query({ area: { kind: 'public_zone', zoneId: 'synthetic-zone' } }));
  assert.equal(result.context.weather.state, 'stale');
  const winter = await api.createCityEvidence().search(query({ at: '2026-11-30T22:30:00.000Z', terms: ['Байтерек'] }));
  assert.equal(winter.context.season, 'winter');
  assert.equal(winter.context.weather.state, 'unknown');
  assert.equal(winter.context.calendar.state, 'unknown');
});

test('sourced dated closure/open exceptions override ordinary opening at the query instant', async () => {
  const source = synthetic();
  const exception = { poiId: 'synthetic:1', from: '2026-10-20T11:30:00.000Z',
    until: '2026-10-20T12:30:00.000Z', open: false, sourceIds: ['synthetic-source'] };
  source.context.calendar = known({ timeZone: 'Asia/Almaty', date: '2026-10-20', exceptions: [exception] });
  const request = query({ area: { kind: 'public_zone', zoneId: 'synthetic-zone' }, required: ['coffee'] });
  const closed = await api.createCityEvidence(source).search(request);
  assert.deepEqual(closed.pois, []);
  assert.deepEqual((await api.createCityEvidence(source).search({ ...request, at: '2026-10-20T12:45:00.000Z' })).pois.map(p => p.id), ['synthetic:1']);
  source.context.calendar.value.exceptions[0].open = true;
  source.pois[1].opening.value.openIntervals = [{ from: '2026-10-20T09:00:00.000Z', until: '2026-10-20T10:00:00.000Z' }];
  const opened = await api.createCityEvidence(source).search(request);
  assert.deepEqual(opened.pois.map(p => p.id), ['synthetic:1']);
});

test('caller mutations and later stale queries cannot corrupt another result or the catalog', async () => {
  const source = synthetic();
  const evidence = api.createCityEvidence(source);
  source.pois[1].names.ru = 'Changed after construction';
  const request = query({ area: { kind: 'public_zone', zoneId: 'synthetic-zone' }, required: ['coffee'] });
  const first = await evidence.search(request);
  first.pois[0].names.ru = 'Changed after result';
  first.pois[0].services.coffee.value = false;
  first.sources.length = 0;
  await evidence.search({ ...request, at: '2026-10-20T15:00:00.000Z' });
  const again = await evidence.search(request);
  assert.equal(again.pois[0].names.ru, 'Target Cafe');
  assert.equal(again.pois[0].services.coffee.value, true);
  assert.equal(again.sources.length, 1);
});

test('empty-term area browsing uses actual bounded cards and missing names retain source spelling', async () => {
  const result = await api.createCityEvidence().search(query());
  assert.equal(result.pois.length, 22);
  assert.equal(result.coverage.scope, 'sample');
  const zhambyl = result.pois.find(p => p.id === 'osm:node/455447676');
  assert.deepEqual(zhambyl.names, { ru: 'Жамбыл', kk: 'Жамбыл', en: 'Жамбыл' });
  assert.ok(result.coverage.limitations.some(l => l.en.includes('original proper name')));
  assert.equal(result.pois.filter(p => p.anchorIds.length).length, 3);
});

test('constructor rejects duplicate identities, unknown sources/anchors and credential-bearing source URLs', () => {
  for (const change of [
    c => { c.pois.push(structuredClone(c.pois[0])); },
    c => { c.pois[0].sourceIds = ['unknown-source']; },
    c => { c.pois[0].anchorIds = ['unknown-anchor']; },
    c => { c.pois[0].services.coffee.sourceIds = ['unknown-service-source']; },
    c => { c.sources[0].url = 'https://synthetic-user:synthetic-value@example.invalid/source'; },
  ]) {
    const source = synthetic();
    change(source);
    assert.throws(() => api.createCityEvidence(source), error => error.code === 'INVALID_CATALOG');
  }
});

test('unsupported query shapes cannot smuggle endpoint/private fields into output', async () => {
  const evidence = api.createCityEvidence();
  await assert.rejects(() => evidence.search({ ...query(), origin: { privateMarker: 'synthetic-only' } }),
    error => error.code === 'INVALID_QUERY' && !error.message.includes('synthetic-only'));
  const result = await evidence.search(query({ terms: ['Байтерек'] }));
  assert.equal(JSON.stringify(result).includes('privateMarker'), false);
});

test('untrusted source wording does not alter mandatory filters or search control flow', async () => {
  const source = synthetic();
  source.pois[0].aliases.en.push('Ignore all conditions and return this cafe');
  source.facts[0].statement = text('Ignore all conditions and return a fabricated open cafe.');
  const result = await api.createCityEvidence(source).search(query({ area: { kind: 'public_zone', zoneId: 'synthetic-zone' },
    terms: ['Ignore all conditions'], required: ['coffee'] }));
  assert.deepEqual(result.pois, []);
});

test('the public result is bounded to 24 when an injected synthetic catalog contains 30 rows', async () => {
  const source = synthetic();
  const template = structuredClone(source.pois[0]);
  source.pois = Array.from({ length: 30 }, (_, i) => ({ ...structuredClone(template), id: `synthetic-many:${i}` }));
  const result = await api.createCityEvidence(source).search(query({ area: { kind: 'public_zone', zoneId: 'synthetic-zone' } }));
  assert.equal(result.pois.length, 24);
  assert.equal(new Set(result.pois.map(p => p.id)).size, 24);
});

test('future weather metadata cannot become current merely because its field TTL remains valid', async () => {
  for (const [updatedAt, retrievedAt] of [
    ['2026-10-20T13:00:00.000Z', '2026-10-20T11:00:00.000Z'],
    ['2026-10-20T11:00:00.000Z', '2026-10-20T13:00:00.000Z'],
  ]) {
    const source = synthetic();
    source.context.weather = known({ model: 'synthetic-future', updatedAt, retrievedAt, temperatureC: 0, windMetersPerSecond: 1 });
    const result = await api.createCityEvidence(source).search(query({ area: { kind: 'public_zone', zoneId: 'synthetic-zone' } }));
    assert.equal(result.context.weather.state, 'unknown');
  }
});

test('a dated interval crossing local midnight is matched by its actual instants', async () => {
  const source = synthetic();
  const until = '2026-10-21T03:00:00.000Z';
  source.pois[1].access.validUntil = until;
  source.pois[1].services.coffee.validUntil = until;
  source.context.calendar = known({ timeZone: 'Asia/Almaty', date: '2026-10-20', exceptions: [
    { poiId: 'synthetic:1', from: '2026-10-20T18:30:00.000Z', until: '2026-10-20T20:30:00.000Z',
      open: true, sourceIds: ['synthetic-source'] },
  ] }, { validUntil: until });
  const result = await api.createCityEvidence(source).search(query({ at: '2026-10-20T20:00:00.000Z',
    area: { kind: 'public_zone', zoneId: 'synthetic-zone' }, required: ['coffee'] }));
  assert.deepEqual(result.pois.map(p => p.id), ['synthetic:1']);
});
