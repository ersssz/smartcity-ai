const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const Module = require('node:module');
const path = require('node:path');
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
const contracts = load(path.resolve(__dirname, '../../contracts/src/index.ts'));
const { fixture } = require('../../contracts/test/fixture.cjs');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const hash = async bytes => sha(bytes);
async function bundle(revision = 1, parent, tweak) {
  const w = fixture();
  // Current contract requires continuation constraints explicitly.
  w.continuation.constraints = structuredClone(w.request.constraints);
  const files = new Map();
  function asset(id, role, bytes, locale) {
    const data = Buffer.from(bytes), digest = sha(data);
    files.set(id, data);
    return { id, role, ...(locale ? { locale } : {}), sha256: digest, bytes: data.length,
      required: true, license: 'CC0-1.0', attribution: 'Owned synthetic offline test data',
      location: { kind: 'bundled', path: `fixtures/${digest}.bin` } };
  }
  w.assets = { version: 1, items: [asset('map', 'map', 'synthetic map'), asset('style', 'style', 'synthetic style'), asset('attribution', 'attribution', 'Owned fixture')],
    map: { state: 'available', bounds: [-0.01, -0.01, 0.01, 0.01], minZoom: 1, maxZoom: 2,
      assetIds: ['map', 'style', 'attribution'], attribution: 'Owned synthetic map; not a real basemap' } };
  for (const entry of contracts.narrationEntries(w)) {
    const id = `audio-${sha(entry.id).slice(0, 24)}`;
    const a = asset(id, 'audio', `Synthetic audio ${entry.id}`, entry.locale);
    w.assets.items.push(a);
    for (const key of Object.keys(entry.audio)) delete entry.audio[key];
    Object.assign(entry.audio, { state: 'available', assetId: id, textSha256: sha(entry.text), durationSeconds: 1 });
  }
  w.revision = revision;
  if (parent) { w.parentRevision = revision - 1; w.parentHash = parent.sha256; }
  if (tweak) await tweak(w, files, asset);
  const sealed = await contracts.sealBundle(w, hash);
  return { bundle: sealed, json: JSON.stringify(sealed), files };
}
module.exports = { contracts, hash, sha, bundle };
