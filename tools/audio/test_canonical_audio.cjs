const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { test } = require('node:test');
const { exportCanonicalReplay, applyPreparedNarration, sha } = require('./canonical_audio.cjs');

const repoRoot = path.resolve(__dirname, '../..');
test('canonical replay exports all 54 exact narrations, keeping quest answers separate', async () => {
  const { bundle, corpus } = await exportCanonicalReplay({ repoRoot, at: '2026-10-20T12:00:00.000Z', bundleId: 'prepared-audio-corpus' });
  assert.equal(corpus.entries.length, 54);
  for (const locale of ['ru', 'kk', 'en']) assert.equal(corpus.entries.filter(e => e.locale === locale).length, 18);
  assert.equal(corpus.entries.find(e => e.id === 'cue:start:ru').text, 'Начинаем прогулку.');
  const quest = bundle.content.quests[0];
  const question = corpus.entries.find(e => e.id === `${quest.id}:question:ru`);
  assert.ok(question.text.includes(quest.question.ru));
  for (const choice of quest.choices) assert.ok(question.text.includes(choice.label.ru));
  assert.equal(question.text.includes(quest.explanation.ru), false);
  const chapter = bundle.content.chapters[0];
  const narration = corpus.entries.find(e => e.id === `${chapter.id}:ru`);
  assert.ok(narration.text.startsWith(`${chapter.title.ru}\n\n`));
  assert.ok(narration.text.endsWith(chapter.blocks.at(-1).text.ru));
});

function fixtureManifest(corpus, root) {
  fs.mkdirSync(path.join(root, 'audio'));
  return { schemaVersion: 1, kind: 'verified-prepared-narration', contentRevision: corpus.contentRevision,
    narrationFormat: 'contracts.narrationEntries.v1', textFormatting: 'none', entries: corpus.entries.map(e => {
      // The adapter seam tests file integrity, not audio decoding or model quality.
      const bytes = Buffer.from(`not playable: explicit integrity fixture ${e.id}`), digest = sha(bytes), relative = `audio/${digest}.mp3`;
      fs.writeFileSync(path.join(root, relative), bytes);
      return { id: e.id, locale: e.locale, textSha256: e.textSha256, assetId: `audio-${digest}`, path: relative,
        sha256: digest, bytes: bytes.length, durationSeconds: 1, decodingVerified: true,
        provenance: { license: 'CC0 test fixture', attribution: 'Integrity fixture; not a real recording' } };
    }) };
}

test('adapter binds all exact narration files, reseals a new bundle and keeps missing map partial', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astana-audio-adapter-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const original = await exportCanonicalReplay({ repoRoot, at: '2026-10-20T12:00:00.000Z', bundleId: 'adapter-test' });
  const manifest = fixtureManifest(original.corpus, root);
  const result = await applyPreparedNarration({ repoRoot, bundleJson: JSON.stringify(original.bundle), manifest, assetRoot: root });
  assert.equal(result.bundle.assets.items.filter(a => a.role === 'audio').length, 54);
  assert.notEqual(result.bundle.sha256, original.bundle.sha256);
  assert.deepEqual(result.bundle.legs, original.bundle.legs);
  assert.deepEqual(result.bundle.content.chapters[0].blocks, original.bundle.content.chapters[0].blocks);
  assert.deepEqual(result.bundle.assets.map, original.bundle.assets.map);
  assert.equal(result.verification.state, 'partial');
  assert.deepEqual(result.verification.missing, [{ id: 'map', reason: 'MAP_UNAVAILABLE' }]);
  assert.equal(original.bundle.content.chapters[0].audio.ru.state, 'missing');
});

test('adapter refuses text substitution, missing coverage, corruption and path escape', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astana-audio-refusal-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const { bundle, corpus } = await exportCanonicalReplay({ repoRoot, at: '2026-10-20T12:00:00.000Z', bundleId: 'adapter-refusal' });
  const manifest = fixtureManifest(corpus, root), bundleJson = JSON.stringify(bundle);
  const wrongText = structuredClone(manifest); wrongText.entries[0].textSha256 = '0'.repeat(64);
  await assert.rejects(() => applyPreparedNarration({ repoRoot, bundleJson, manifest: wrongText, assetRoot: root }), /text|identity/i);
  const missing = structuredClone(manifest); missing.entries.pop();
  await assert.rejects(() => applyPreparedNarration({ repoRoot, bundleJson, manifest: missing, assetRoot: root }), /coverage/i);
  const escape = structuredClone(manifest); escape.entries[0].path = '../unrelated.mp3';
  await assert.rejects(() => applyPreparedNarration({ repoRoot, bundleJson, manifest: escape, assetRoot: root }), /path/i);
  fs.writeFileSync(path.join(root, manifest.entries[0].path), 'corrupt');
  await assert.rejects(() => applyPreparedNarration({ repoRoot, bundleJson, manifest, assetRoot: root }), /corrupt|checksum/i);
});
