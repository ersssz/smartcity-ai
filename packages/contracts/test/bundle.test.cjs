const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const fs = require('node:fs/promises');
const os = require('node:os');
const crypto = require('node:crypto');
const Module = require('node:module');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('../../../apps/mobile/node_modules/typescript');
function load(filename, cache = new Map()) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const m = new Module(filename, module); cache.set(filename, m);
  m.filename = filename; m.paths = Module._nodeModulePaths(path.dirname(filename));
  const nativeRequire = m.require.bind(m);
  m.require = id => id.startsWith('.') ? load(path.resolve(path.dirname(filename), id.replace(/\.js$/, '') + '.ts'), cache) : nativeRequire(id);
  m._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, filename);
  return m.exports;
}
const api = load(path.resolve(__dirname, '../src/index.ts'));
const { fixture, text } = require('./fixture.cjs');
const hash = async bytes => crypto.createHash('sha256').update(bytes, 'utf8').digest('hex');

test('a sealed immutable bundle survives JSON transport without adding progress or offline readiness', async () => {
  const sealed = await api.sealBundle(fixture(), hash);
  const read = await api.readBundle(JSON.stringify(sealed), hash);
  assert.equal(read.ok, true);
  assert.equal(read.bundle.sha256, sealed.sha256);
  assert.equal(read.bundle.timing.totalMinutes, 17);
  assert.equal('progress' in read.bundle, false);
  assert.equal('offlineReady' in read.bundle, false);
});

test('changed content and unknown-version bundles are reported separately without replacing the caller source', async () => {
  const sealed = await api.sealBundle(fixture(), hash);
  const edited = structuredClone(sealed); edited.theme.title.ru = 'Altered text';
  assert.deepEqual(await api.readBundle(JSON.stringify(edited), hash), { ok: false, code: 'HASH_MISMATCH' });
  const future = { ...sealed, schemaVersion: 2 };
  assert.deepEqual(await api.readBundle(JSON.stringify(future), hash), { ok: false, code: 'UNSUPPORTED_BUNDLE_VERSION' });
  assert.equal(future.schemaVersion, 2);
});

test('hash is verified before unknown fields can be discarded; private fields cannot be sealed', async () => {
  const sealed = await api.sealBundle(fixture(), hash);
  assert.equal((await api.readBundle(JSON.stringify({ ...sealed, adminToken: 'not-a-real-secret' }), hash)).code, 'HASH_MISMATCH');
  await assert.rejects(() => api.sealBundle({ ...fixture(), progress: { completed: [] } }, hash));
});

test('last-stop ending omits the return leg and consumes exactly its shorter time', async () => {
  const w = fixture(); w.request.endRule = { kind: 'last_stop' };
  w.resolvedEnd = { endpoint: structuredClone(w.legs[1].to), stopId: 'stop-1' };
  w.legs.pop(); Object.assign(w.timing, { walkMinutes: 2, distanceMeters: 111.32, totalMinutes: 15, endsAt: '2026-10-20T10:15:00.000Z' });
  const s = await api.sealBundle(w, hash);
  assert.equal(s.legs.length, 2); assert.equal(s.resolvedEnd.stopId, 'stop-1');
});

test('a tiny unproved connector, missing return, changed explicit end and omitted reserve never become feasible', async () => {
  const connector = fixture(); connector.legs[1].geometry.coordinates[0][0] += 0.000001;
  await assert.rejects(() => api.sealBundle(connector, hash));
  const missing = fixture(); missing.legs.pop(); await assert.rejects(() => api.sealBundle(missing, hash));
  const end = fixture(); end.request.endRule = { kind: 'point', endpoint: { kind: 'point', coordinate: [0.003, 0], source: 'manual' } };
  await assert.rejects(() => api.sealBundle(end, hash));
  const reserve = fixture(); reserve.timing.reserveMinutes = 1; reserve.timing.totalMinutes = 13; reserve.timing.endsAt = '2026-10-20T10:13:00.000Z';
  await assert.rejects(() => api.sealBundle(reserve, hash));
});

test('required languages, valid fact references and unique quest answers survive transport validation', async () => {
  const language = fixture(); delete language.content.chapters[0].blocks[0].text.kk;
  await assert.rejects(() => api.sealBundle(language, hash));
  const fact = fixture(); fact.stops[0].factRefs = ['invented-fact']; await assert.rejects(() => api.sealBundle(fact, hash));
  const answer = fixture(); answer.content.quests[0].choices[1].id = 'yes'; await assert.rejects(() => api.sealBundle(answer, hash));
});

test('an indoor visit must fit the whole fresh access and opening window', async () => {
  const w = fixture(); const stop = w.stops[0]; stop.intent = 'indoor_visit';
  stop.access = { state: 'known', value: { public: true, stepFree: 'unknown', indoor: true }, sourceIds: ['fixture-source'], observedAt: '2026-10-20T09:00:00.000Z', validUntil: '2026-10-20T11:00:00.000Z' };
  stop.opening = { state: 'known', value: { timeZone: 'Asia/Almaty', openIntervals: [{ from: '2026-10-20T09:00:00.000Z', until: '2026-10-20T10:02:00.000Z' }] }, sourceIds: ['fixture-source'], observedAt: '2026-10-20T09:00:00.000Z', validUntil: '2026-10-20T11:00:00.000Z' };
  await assert.rejects(() => api.sealBundle(w, hash));
  stop.opening.value.openIntervals[0].until = '2026-10-20T11:00:00.000Z';
  assert.equal((await api.sealBundle(w, hash)).stops[0].intent, 'indoor_visit');
});

test('canonical bytes are independent of object insertion order and retain arrays and Unicode', async () => {
  assert.equal(api.canonicalJson({ z: 'Қала', a: [2, 1], n: -0 }), '{"a":[2,1],"n":0,"z":"Қала"}');
  assert.throws(() => api.canonicalJson({ x: undefined })); assert.throws(() => api.canonicalJson({ x: '\ud800' }));
  const s = await api.sealBundle(fixture(), hash);
  const reordered = Object.fromEntries(Object.entries(s).reverse());
  assert.equal((await api.readBundle(JSON.stringify(reordered), hash)).ok, true);
  assert.equal((await api.readBundle(' '.repeat(524289), hash)).code, 'BUNDLE_TOO_LARGE');
});

test('an intact text-only package remains partial even if no declared file is missing', async () => {
  const s = await api.sealBundle(fixture(), hash);
  const result = await api.verifyPack(JSON.stringify(s), hash, async () => ({ state: 'missing' }));
  assert.equal(result.state, 'partial');
  assert.ok(result.missing.some(m => m.reason === 'MAP_UNAVAILABLE'));
  assert.equal(result.missing.filter(m => m.reason === 'AUDIO_UNAVAILABLE').length, 42);
  assert.equal(result.identity.bundleHash, s.sha256);
});

test('pack integrity is derived from actual durable bytes, audio text and the current revision', async t => {
  // Synthetic bytes exercise the storage seam; these are not real audio/maps.
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'astana-contract-pack-'));
  const owned = [];
  t.after(async () => { for (const p of owned) await fs.unlink(p); await fs.rmdir(dir); });
  const w = fixture();
  const add = async (id, role, content, locale) => {
    const bytes = Buffer.from(content, 'utf8'); const filename = path.join(dir, id);
    await fs.writeFile(filename, bytes); owned.push(filename);
    const asset = { id, role, ...(locale ? { locale } : {}), sha256: crypto.createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, required: true, license: 'CC0-1.0', attribution: 'Synthetic integrity fixture', location: { kind: 'bundled', path: `fixtures/${id}` } };
    w.assets.items.push(asset); return asset;
  };
  const entries = api.narrationEntries(w);
  assert.equal(entries.length, 42);
  assert.equal(entries.find(e => e.id === 'chapter-0:ru').text, 'Test chapter 0\n\nThis is synthetic contract test data.\n\nLook around in this test.');
  for (const e of entries) {
    const asset = await add(e.id.replaceAll(':', '-'), 'audio', 'synthetic-byte-fixture:' + e.id, e.locale);
    delete e.audio.reason;
    Object.assign(e.audio, { state: 'available', assetId: asset.id, textSha256: await hash(e.text), durationSeconds: 1 });
  }
  for (const role of ['map', 'style', 'attribution']) await add(role, role, `synthetic-${role}`);
  w.assets.map = { state: 'available', bounds: [-1, -1, 1, 1], minZoom: 12, maxZoom: 16, assetIds: ['map', 'style', 'attribution'], attribution: 'Synthetic test only' };
  const s = await api.sealBundle(w, hash);
  const reader = async a => {
    const bytes = await fs.readFile(path.join(dir, a.id));
    return { state: 'present', bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), storage: 'durable' };
  };
  const ready = await api.verifyPack(JSON.stringify(s), hash, reader);
  assert.equal(ready.state, 'ready');
  const modified = structuredClone(w); modified.revision = 2; modified.parentRevision = 1; modified.parentHash = s.sha256;
  modified.content.chapters[0].blocks[0].text.ru = 'New text needs new narration';
  const newBundle = await api.sealBundle(modified, hash);
  const next = await api.verifyPack(JSON.stringify(newBundle), hash, reader);
  assert.equal(next.state, 'partial'); assert.notEqual(next.identity.bundleHash, ready.identity.bundleHash);
  assert.ok(next.missing.some(m => m.reason === 'AUDIO_TEXT_MISMATCH'));
  await fs.writeFile(path.join(dir, 'map'), 'different bytes');
  const corrupt = await api.verifyPack(JSON.stringify(s), hash, reader);
  assert.equal(corrupt.state, 'partial'); assert.ok(corrupt.missing.some(m => m.id === 'map' && m.reason === 'CORRUPT_FILE'));
});
