import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { previewCollection, createPublicationCapabilities, createSqlitePublicationAuthority, createPublicCollection, createPublicCollectionHandler } from '../src/index.mjs';

const NOW = Date.parse('2026-10-20T10:00:00.000Z');
const titles = (ru, kk, en) => ({ ru, kk, en });
const catalog = () => ({
  discoveries: [{ id: 'baiterek', titles: titles('Байтерек', 'Бәйтерек', 'Baiterek'), allowedProofs: ['gps_nearby', 'manual_reported'] }],
  badges: [{ id: 'story-reader', titles: titles('Читатель', 'Оқырман', 'Reader'), allowedProofs: ['quest_completed'] }],
  quests: [{ id: 'sky-story', titles: titles('История неба', 'Аспан хикаясы', 'Sky story') }],
});
const selection = (locale = 'ru') => {
  const trusted = catalog();
  return { locale, pseudonym: 'Explorer', discoveries: [{ id: 'baiterek', title: trusted.discoveries[0].titles[locale], proof: 'gps_nearby' }],
    badges: [{ id: 'story-reader', title: trusted.badges[0].titles[locale], proof: 'quest_completed' }],
    quests: [{ id: 'sky-story', title: trusted.quests[0].titles[locale] }] };
};
const rawHash = snapshot => createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');

function fixture(t, supplied = catalog()) {
  const folder = mkdtempSync(join(tmpdir(), 'astana-public-catalog-'));
  const authority = createSqlitePublicationAuthority({ databasePath: join(folder, 'authority.sqlite'), confirmedOutsideProfileBackups: true });
  authority.openNewEpoch();
  let now = NOW;
  const open = trusted => createPublicCollection({ databasePath: join(folder, 'profiles.sqlite'), authority, now: () => now, publicBaseUrl: 'https://example.test', catalog: trusted });
  let collection = open(supplied);
  t.after(() => { collection.close(); authority.close(); rmSync(folder, { recursive: true, force: true }); });
  return { get collection() { return collection; }, authority, folder, setNow(value) { now = value; },
    reopen(trusted) { collection.close(); collection = open(trusted); } };
}
const publication = (collection, snapshot = selection()) => ({ operationId: 'catalog-publication-0001', ...createPublicationCapabilities(), snapshot,
  confirmedPreviewHash: collection.preview(snapshot).hash, confirmed: true, acknowledgedLossOfDevice: true });

test('publication is disabled without a valid explicit trusted catalog and standalone previews cannot omit it', t => {
  const f = fixture(t);
  assert.throws(() => previewCollection(selection()), { code: 'CATALOG_UNAVAILABLE', status: 503 });
  for (const invalid of [undefined, {}, { ...catalog(), quests: [{ id: 'sky-story', titles: { ru: 'Only one language' } }] },
    { ...catalog(), discoveries: [...catalog().discoveries, ...catalog().discoveries] },
    { ...catalog(), badges: [{ ...catalog().badges[0], allowedProofs: ['made_up'] }] }]) {
    assert.throws(() => createPublicCollection({ databasePath: join(f.folder, 'disabled.sqlite'), authority: f.authority, publicBaseUrl: 'https://example.test', catalog: invalid }), { code: 'CATALOG_UNAVAILABLE', status: 503 });
  }
});

test('all locales publish the exact trusted titles and proof shown in the bound HTTP preview', async t => {
  for (const locale of ['ru', 'kk', 'en']) {
    const f = fixture(t);
    const snapshot = selection(locale);
    const handler = createPublicCollectionHandler(f.collection);
    const response = await handler(new Request('https://example.test/v1/public-profiles/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(snapshot) }));
    assert.equal(response.status, 200);
    const preview = await response.json();
    assert.deepEqual(preview, previewCollection(snapshot, catalog()));
    const command = publication(f.collection, snapshot);
    assert.equal(command.confirmedPreviewHash, preview.hash);
    const receipt = f.collection.publish(command);
    assert.deepEqual(f.collection.read(command.readToken), snapshot);
    const html = await handler(new Request(receipt.readUrl, { headers: { Accept: 'text/html' } }));
    assert.equal(html.status, 200);
    assert.ok((await html.text()).includes(snapshot.quests[0].title));
  }
});

test('unknown IDs, substituted localized titles and disallowed proofs fail preview, publish and update even with a matching attacker hash', async t => {
  const f = fixture(t); const { collection } = f;
  const valid = publication(collection); const receipt = collection.publish(valid);
  const handler = createPublicCollectionHandler(collection);
  const bad = [];
  for (const group of ['discoveries', 'badges', 'quests']) {
    for (const change of [{ id: 'private-home-address' }, { title: 'My private address and visit time' }]) {
      const snapshot = selection(); snapshot[group][0] = { ...snapshot[group][0], ...change }; bad.push(snapshot);
    }
  }
  bad.push({ ...selection(), discoveries: [{ ...selection().discoveries[0], proof: 'quest_completed' }] });
  bad.push({ ...selection(), badges: [{ ...selection().badges[0], proof: 'gps_nearby' }] });
  bad.push({ ...selection('kk'), quests: selection('ru').quests });
  for (const [i, snapshot] of bad.entries()) {
    assert.throws(() => collection.preview(snapshot), { code: 'PUBLIC_SELECTION_NOT_ALLOWED' });
    assert.throws(() => collection.publish({ ...valid, ...createPublicationCapabilities(), operationId: `catalog-rejected-publish-${i}`, snapshot, confirmedPreviewHash: rawHash(snapshot) }), { code: 'PUBLIC_SELECTION_NOT_ALLOWED' });
    assert.throws(() => collection.update({ profileId: receipt.profileId, adminCapability: valid.adminCapability, expectedRevision: 1,
      operationId: `catalog-rejected-update-${i}`, snapshot, confirmedPreviewHash: rawHash(snapshot), confirmed: true }), { code: 'PUBLIC_SELECTION_NOT_ALLOWED' });
    const preview = await handler(new Request('https://example.test/v1/public-profiles/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(snapshot) }));
    assert.equal(preview.status, 400); assert.deepEqual(await preview.json(), { error: 'PUBLIC_SELECTION_NOT_ALLOWED' });
    assert.equal(preview.headers.get('Cache-Control'), 'no-store');
  }
  assert.deepEqual(collection.read(valid.readToken), selection());
  const foreign = catalog(); foreign.discoveries[0].titles.ru = 'Private personal text';
  const snapshot = selection(); snapshot.discoveries[0].title = foreign.discoveries[0].titles.ru;
  const attackerPreview = previewCollection(snapshot, foreign);
  assert.throws(() => collection.publish({ ...valid, snapshot, confirmedPreviewHash: attackerPreview.hash }), { code: 'PUBLIC_SELECTION_NOT_ALLOWED' });
  const injection = await handler(new Request('https://example.test/v1/public-profiles/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...snapshot, catalog: foreign }) }));
  assert.equal(injection.status, 400);
});

test('constructor snapshots nested catalog titles, IDs and proof permissions rather than retaining caller-mutable trust', t => {
  const trusted = catalog(); const f = fixture(t, trusted);
  trusted.discoveries[0].titles.ru = 'Private personal text';
  trusted.discoveries[0].allowedProofs.push('quest_completed');
  trusted.quests.push({ id: 'private-home-address', titles: titles('Address', 'Address', 'Address') });
  assert.deepEqual(f.collection.preview(selection()).snapshot, selection());
  const forged = selection(); forged.discoveries[0].title = trusted.discoveries[0].titles.ru;
  assert.throws(() => f.collection.preview(forged), { code: 'PUBLIC_SELECTION_NOT_ALLOWED' });
  assert.throws(() => f.collection.preview({ ...selection(), discoveries: [{ ...selection().discoveries[0], proof: 'quest_completed' }] }), { code: 'PUBLIC_SELECTION_NOT_ALLOWED' });
  assert.throws(() => f.collection.preview({ ...selection(), quests: [{ id: 'private-home-address', title: 'Address' }] }), { code: 'PUBLIC_SELECTION_NOT_ALLOWED' });
  const command = publication(f.collection); f.collection.publish(command);
  assert.deepEqual(f.collection.read(command.readToken), selection());
});

test('reads and HTML fail closed after trusted content changes; they never silently rename a previously confirmed persisted snapshot', async t => {
  const f = fixture(t); const command = publication(f.collection); const receipt = f.collection.publish(command);
  const changed = catalog(); changed.discoveries[0].titles.ru = 'Edited trusted title';
  f.reopen(changed);
  assert.throws(() => f.collection.read(command.readToken), { code: 'PUBLICATION_GONE' });
  const handler = createPublicCollectionHandler(f.collection);
  for (const accept of ['application/json', 'text/html']) {
    const read = await handler(new Request(receipt.readUrl, { headers: { Accept: accept } }));
    assert.equal(read.status, 410); assert.equal(read.headers.get('Cache-Control'), 'no-store');
    const text = await read.text(); assert.ok(!text.includes('Байтерек')); assert.ok(!text.includes('Edited trusted title'));
  }
  f.setNow(NOW + 1000);
  const snapshot = selection(); snapshot.discoveries[0].title = changed.discoveries[0].titles.ru;
  const update = { profileId: receipt.profileId, adminCapability: command.adminCapability, expectedRevision: 1, operationId: 'catalog-reviewed-update-0001',
    snapshot, confirmedPreviewHash: f.collection.preview(snapshot).hash, confirmed: true };
  const updated = f.collection.update(update);
  assert.equal(updated.revision, 2); assert.deepEqual(f.collection.read(command.readToken), snapshot);
  assert.deepEqual(f.collection.update(update), updated);
  const removed = catalog(); removed.discoveries = [];
  f.reopen(removed);
  assert.throws(() => f.collection.read(command.readToken), { code: 'PUBLICATION_GONE' });
});
