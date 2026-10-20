// Offline build tool. The runtime contract has no Node dependency.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Module = require('node:module');
const ts = require('../../../apps/mobile/node_modules/typescript');
const { zodToJsonSchema } = require('zod-to-json-schema');
function load(filename, cache = new Map()) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const m = new Module(filename, module); cache.set(filename, m);
  m.filename = filename; m.paths = Module._nodeModulePaths(path.dirname(filename));
  const nativeRequire = m.require.bind(m);
  m.require = id => id.startsWith('.') ? load(path.resolve(path.dirname(filename), id.replace(/\.js$/, '') + '.ts'), cache) : nativeRequire(id);
  m._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, filename);
  return m.exports;
}
const api = load(path.resolve(__dirname, '../src/index.ts'));
const { fixture } = require('../test/fixture.cjs');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const root = path.resolve(__dirname, '..');
const check = process.argv.includes('--check');
function write(relative, value) {
  const output = path.join(root, relative), bytes = JSON.stringify(value, null, 2) + '\n';
  if (check) {
    if (!fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== bytes) throw new Error(`Generated artifact is missing or stale: ${relative}`);
  } else { fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, bytes); }
  return { file: relative.replaceAll('\\', '/'), bytes: Buffer.byteLength(bytes), sha256: digest(bytes) };
}
async function main() {
  const schema = zodToJsonSchema(api.WalkBundleSchema, { name: 'WalkBundleV1', target: 'jsonSchema7' });
  schema.$comment = 'Structural schema generated from the sole Zod authority. Acceptance also requires readBundle SHA-256 and semantic validation, and local asset verification; JSON Schema alone proves neither route feasibility nor offline readiness.';
  write('schema/WalkBundleV1.schema.json', schema);
  const valid = await api.sealBundle(fixture(), async s => digest(Buffer.from(s, 'utf8')));
  const corrupt = structuredClone(valid); corrupt.theme.title.ru = 'Intentionally modified after sealing';
  const files = [
    write('fixtures/synthetic-v1.json', valid),
    write('fixtures/unsupported-major.json', { ...valid, schemaVersion: 2 }),
    write('fixtures/corrupt-payload.json', corrupt),
  ];
  write('fixtures/manifest.json', { formatVersion: 1, license: 'CC0-1.0', evidenceMode: 'test_fixture', description: 'Owned synthetic contract data; no actual route, venue, audio, map or field acceptance.', files });
  process.stdout.write(`Contract artifacts ${check ? 'verified' : 'generated'}; ${files.length} fixtures.\n`);
}
main().catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1; });
