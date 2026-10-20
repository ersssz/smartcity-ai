// Real bundled guide through its app interface; not a native interaction test.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { test } = require('node:test');
const ts = require('typescript');
function load(filename) {
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = loaded.require.bind(loaded);
  loaded.require = id => id.startsWith('.') && !id.endsWith('.json') ? load(path.resolve(path.dirname(filename), `${id}.ts`)) : originalRequire(id);
  loaded._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true, resolveJsonModule: true } }).outputText, filename);
  return loaded.exports;
}
const { getCityGuide } = load(path.resolve(__dirname, '../src/city/catalog.ts'));
test('the app opens the actual six-district guide with linked evidence in all three languages', () => {
  const expected = ['almaty', 'baikonyr', 'esil', 'nura', 'sarayshyq', 'saryarka'];
  for (const locale of ['ru', 'kk', 'en']) {
    const guide = getCityGuide(locale);
    assert.deepEqual(guide.districts.map(d => d.id).sort(), expected);
    assert.deepEqual(guide.boundaries.features.map(f => f.properties.id).sort(), expected);
    for (const district of guide.districts) {
      assert.ok(district.name && district.description && district.experience);
      assert.ok(district.sources.length && district.sources.every(s => s.url.startsWith('https://')));
    }
    assert.ok(guide.river.features.length && guide.riverSources.length);
    assert.notDeepEqual(guide.bankLabelPoints.left, guide.bankLabelPoints.right);
  }
  assert.equal(getCityGuide('ru').districts.find(d => d.id === 'nura').name, 'Нура');
  assert.match(getCityGuide('ru').riverDescription, /реки Есиль/);
});
