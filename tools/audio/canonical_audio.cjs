/** Build-time bridge to the actual contracts. No provider or network access. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Module = require('node:module');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const hash = async text => sha(Buffer.from(text, 'utf8'));

function modules(repoRoot) {
  const ts = require(path.join(repoRoot, 'apps/mobile/node_modules/typescript'));
  const cache = new Map();
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const m = new Module(filename, module); cache.set(filename, m);
    m.filename = filename; m.paths = Module._nodeModulePaths(path.dirname(filename));
    const native = m.require.bind(m);
    m.require = id => id.startsWith('.') ? load(path.resolve(path.dirname(filename), id.replace(/\.js$/, '') + '.ts')) : native(id);
    m._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, filename);
    return m.exports;
  }
  return { contracts: load(path.join(repoRoot, 'packages/contracts/src/index.ts')), planner: () => load(path.join(repoRoot, 'packages/walk-planner/src/index.ts')) };
}

async function exportCanonicalCorpus({ repoRoot, bundleJson }) {
  const { contracts } = modules(repoRoot);
  const parsed = await contracts.readBundle(bundleJson, hash);
  if (!parsed.ok) throw new Error(`Invalid canonical bundle: ${parsed.code}`);
  const bundle = parsed.bundle;
  const entries = contracts.narrationEntries(bundle).map(({ id, locale, text }) => ({ id, locale, text, textSha256: sha(Buffer.from(text, 'utf8')) }));
  if (!entries.length || entries.length > 500 || new Set(entries.map(e => e.id)).size !== entries.length) throw new Error('Invalid corpus coverage');
  const corpus = { schemaVersion: 1, kind: 'canonical-prepared-narration-corpus', sourceBundleHash: bundle.sha256,
    bundleId: bundle.bundleId, revision: bundle.revision, contentRevision: bundle.contentRevision,
    narrationFormat: 'contracts.narrationEntries.v1', textFormatting: 'none', entries };
  return { bundle, corpus };
}

async function exportCanonicalReplay({ repoRoot, at, bundleId }) {
  const { planner } = modules(repoRoot);
  const reply = await planner().createReplayPlanner({ hash, now: () => at, id: () => bundleId }).plan({ requestId: `${bundleId}-request`, locale: 'ru',
    origin: { kind: 'public_anchor', anchorId: 'bayterek-outdoor', explicitlyChosen: true }, startAt: at, budgetMinutes: 80,
    endRule: { kind: 'return_to_start' }, interests: ['architecture'], constraints: [], contextFlags: [] });
  if (reply.kind !== 'candidates' || reply.bundles.length !== 1) throw new Error('Canonical replay did not produce one supported walk');
  return exportCanonicalCorpus({ repoRoot, bundleJson: JSON.stringify(reply.bundles[0]) });
}

function writeNew(file, value) { fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' }); }

function durableFile(root, relative) {
  if (typeof relative !== 'string' || !/^[a-zA-Z0-9_./-]+$/.test(relative) || path.isAbsolute(relative) || relative.split('/').some(p => !p || p === '.' || p === '..')) throw new Error('Unsafe asset path');
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep)) throw new Error('Asset path escapes root');
  let current = root;
  for (const part of relative.split('/')) { current = path.join(current, part); if (fs.lstatSync(current).isSymbolicLink()) throw new Error('Linked asset path'); }
  if (!fs.statSync(file).isFile()) throw new Error('Asset path is not a regular file');
  return file;
}

function measuredBytes(file, expectedBytes) {
  if (fs.statSync(file).size !== expectedBytes) throw new Error('Corrupt narration size');
  const fd = fs.openSync(file, 'r'), digest = crypto.createHash('sha256'), buffer = Buffer.alloc(65536);
  let total = 0;
  try {
    while (true) {
      const count = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (!count) break;
      total += count;
      if (total > expectedBytes) throw new Error('Corrupt narration size changed while reading');
      digest.update(buffer.subarray(0, count));
    }
  } finally { fs.closeSync(fd); }
  if (total !== expectedBytes) throw new Error('Corrupt narration size changed while reading');
  return { sha256: digest.digest('hex'), bytes: total };
}

/** Build adapter: verifies actual local bytes, retains all route/text data and reseals.
 * Codec decoding belongs to the explicit builder, not this integrity seam.
 */
async function applyPreparedNarration({ repoRoot, bundleJson, manifest, assetRoot }) {
  const { contracts } = modules(repoRoot);
  const { bundle: original, corpus } = await exportCanonicalCorpus({ repoRoot, bundleJson });
  if (manifest?.schemaVersion !== 1 || manifest.kind !== 'verified-prepared-narration' || manifest.narrationFormat !== corpus.narrationFormat || manifest.textFormatting !== 'none' || manifest.contentRevision !== corpus.contentRevision) throw new Error('Narration manifest identity mismatch');
  if (!Array.isArray(manifest.entries) || manifest.entries.length !== corpus.entries.length || new Set(manifest.entries.map(e => e.id)).size !== corpus.entries.length) throw new Error('Narration coverage mismatch');
  if (fs.lstatSync(assetRoot).isSymbolicLink()) throw new Error('Linked asset root');
  const root = fs.realpathSync(assetRoot), receipts = new Map(), assets = new Map();
  const expected = new Map(corpus.entries.map(e => [e.id, e]));
  for (const entry of manifest.entries) {
    const text = expected.get(entry.id);
    if (!text || entry.locale !== text.locale || entry.textSha256 !== text.textSha256) throw new Error('Narration text identity mismatch');
    if (!/^[a-f0-9]{64}$/.test(entry.sha256) || entry.assetId !== `audio-${entry.sha256}` || entry.path !== `audio/${entry.sha256}.mp3`) throw new Error('Narration content-address path mismatch');
    if (!Number.isSafeInteger(entry.bytes) || entry.bytes <= 0 || entry.bytes > 100_000_000 || !Number.isFinite(entry.durationSeconds) || entry.durationSeconds <= 0 || entry.durationSeconds >= 7200 || entry.decodingVerified !== true) throw new Error('Invalid verified narration metadata');
    if (typeof entry.provenance?.license !== 'string' || !entry.provenance.license || typeof entry.provenance.attribution !== 'string' || !entry.provenance.attribution) throw new Error('Narration provenance missing');
    const actual = measuredBytes(durableFile(root, entry.path), entry.bytes);
    if (actual.sha256 !== entry.sha256) throw new Error('Corrupt narration checksum/size');
    const asset = { id: entry.assetId, role: 'audio', locale: entry.locale, sha256: entry.sha256, bytes: entry.bytes,
      required: true, license: entry.provenance.license, attribution: entry.provenance.attribution,
      location: { kind: 'bundled', path: entry.path } };
    if (assets.has(asset.id) && JSON.stringify(assets.get(asset.id)) !== JSON.stringify(asset)) throw new Error('Conflicting audio asset identity');
    assets.set(asset.id, asset);
    receipts.set(entry.id, { state: 'available', assetId: entry.assetId, textSha256: entry.textSha256, durationSeconds: entry.durationSeconds });
  }
  const payload = structuredClone(original); delete payload.sha256;
  const replaced = new Set(contracts.narrationEntries(original).filter(e => e.audio.state === 'available').map(e => e.audio.assetId));
  const retained = payload.assets.items.filter(a => !replaced.has(a.id));
  for (const item of retained) if (assets.has(item.id)) throw new Error('Existing asset conflicts with prepared narration');
  payload.assets.items = [...retained, ...assets.values()];
  for (const locale of ['ru', 'kk', 'en']) {
    for (const chapter of payload.content.chapters) chapter.audio[locale] = receipts.get(`${chapter.id}:${locale}`);
    for (const quest of payload.content.quests) for (const part of ['question', 'hint', 'explanation']) quest.audio[part][locale] = receipts.get(`${quest.id}:${part}:${locale}`);
    for (const [name, cue] of Object.entries(payload.content.cues)) cue.audio[locale] = receipts.get(`cue:${name}:${locale}`);
  }
  const bundle = await contracts.sealBundle(payload, hash);
  const verification = await contracts.verifyPack(JSON.stringify(bundle), hash, async asset => {
    if (asset.location.kind !== 'bundled') return { state: 'missing' };
    try { return { state: 'present', ...measuredBytes(durableFile(root, asset.location.path), asset.bytes), storage: 'durable' }; }
    catch { return { state: 'missing' }; }
  });
  if (verification.state === 'invalid_bundle') throw new Error('Resealed narration bundle is invalid');
  return { bundle, verification };
}

module.exports = { exportCanonicalCorpus, exportCanonicalReplay, applyPreparedNarration, hash, sha, modules };

if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    const get = name => { const i = args.indexOf(name); if (i < 0 || !args[i + 1]) throw new Error(`Required ${name}`); return args[i + 1]; };
    const repoRoot = path.resolve(get('--repo')), output = path.resolve(get('--output'));
    if (args.includes('--apply-manifest')) {
      const bytes = fs.readFileSync(get('--apply-manifest'));
      if (sha(bytes) !== get('--manifest-sha256')) throw new Error('Explicit narration manifest SHA-256 mismatch');
      const result = await applyPreparedNarration({ repoRoot, bundleJson: fs.readFileSync(get('--bundle'), 'utf8'), manifest: JSON.parse(bytes.toString('utf8')), assetRoot: path.resolve(get('--asset-root')) });
      fs.mkdirSync(output, { recursive: true });
      writeNew(path.join(output, 'narrated-bundle.json'), result.bundle);
      writeNew(path.join(output, 'pack-verification.json'), result.verification);
      console.log(JSON.stringify({ bundleHash: result.bundle.sha256, verification: result.verification }));
      return;
    }
    const result = args.includes('--bundle') ? await exportCanonicalCorpus({ repoRoot, bundleJson: fs.readFileSync(get('--bundle'), 'utf8') })
      : await exportCanonicalReplay({ repoRoot, at: get('--at'), bundleId: get('--bundle-id') });
    fs.mkdirSync(output, { recursive: true });
    writeNew(path.join(output, 'canonical-bundle.json'), result.bundle);
    writeNew(path.join(output, 'canonical-corpus.json'), result.corpus);
    console.log(JSON.stringify({ entries: result.corpus.entries.length, corpusSha256: sha(fs.readFileSync(path.join(output, 'canonical-corpus.json'))), sourceBundleHash: result.bundle.sha256 }));
  })().catch(error => { console.error(error.message); process.exitCode = 1; });
}
