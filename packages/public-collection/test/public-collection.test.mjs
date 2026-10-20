import assert from 'node:assert/strict';
import { copyFileSync, linkSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  previewCollection as standalonePreview, createPublicationCapabilities,
  createSqlitePublicationAuthority, createPublicCollection,
  createPublicCollectionHandler,
} from '../src/index.mjs';

const NOW = Date.parse('2026-10-20T10:00:00.000Z');
const DAY = 86_400_000;
const catalog = () => ({
  discoveries: [{ id: 'baiterek', titles: { ru: 'Байтерек', kk: 'Бәйтерек', en: 'Baiterek' }, allowedProofs: ['gps_nearby', 'manual_reported'] }],
  badges: [{ id: 'three-forms', titles: { ru: 'Три формы', kk: 'Үш пішін', en: 'Three forms' }, allowedProofs: ['quest_completed'] }],
  quests: [{ id: 'three-forms', titles: { ru: 'Город между небом и землёй', kk: 'Аспан мен жер арасындағы қала', en: 'City between sky and earth' } }],
});
const previewCollection = input => standalonePreview(input, catalog());
const selected = (locale = 'ru') => ({
  locale, pseudonym: 'Исследователь',
  discoveries: [{ id: 'baiterek', title: catalog().discoveries[0].titles[locale], proof: 'gps_nearby' }],
  badges: [{ id: 'three-forms', title: catalog().badges[0].titles[locale], proof: 'quest_completed' }],
  quests: [{ id: 'three-forms', title: catalog().quests[0].titles[locale] }],
});

function fixture(t, limits) {
  const folder = mkdtempSync(join(tmpdir(), 'astana-public-'));
  let now = NOW;
  const authority = createSqlitePublicationAuthority({ databasePath: join(folder, 'authority.sqlite'), confirmedOutsideProfileBackups: true, limits });
  authority.openNewEpoch();
  const open = () => createPublicCollection({ databasePath: join(folder, 'profiles.sqlite'), authority, now: () => now, publicBaseUrl: 'https://example.test', catalog: catalog() });
  let collection = open();
  const closing = [];
  t.after(() => { for (const close of closing) close(); collection.close(); authority.close(); rmSync(folder, { recursive: true, force: true }); });
  return { get collection() { return collection; }, authority, folder, setNow: next => { now = next; },
    onClose(close) { closing.push(close); },
    reopen(change = () => {}) { collection.close(); change(join(folder, 'profiles.sqlite')); collection = open(); return collection; } };
}

function publish(collection, overrides = {}) {
  const snapshot = selected();
  const preview = previewCollection(snapshot);
  const capabilities = createPublicationCapabilities();
  const command = { operationId: 'publish-operation-0001', ...capabilities, snapshot, confirmedPreviewHash: preview.hash, confirmed: true, acknowledgedLossOfDevice: true, ...overrides };
  return { command, receipt: collection.publish(command) };
}

test('an exact preview is private until confirmed publish, then reads only the selected public snapshot for thirty days', t => {
  const { collection, setNow } = fixture(t);
  const preview = previewCollection(selected());
  assert.deepEqual(preview.snapshot, selected());
  assert.ok(preview.warnings.length > 0);
  const capabilities = createPublicationCapabilities();
  assert.notEqual(capabilities.readToken, capabilities.adminCapability);
  assert.equal(Buffer.from(capabilities.readToken, 'base64url').length, 32);
  assert.throws(() => collection.read(capabilities.readToken), { code: 'PUBLICATION_GONE' });
  const { receipt } = publish(collection, capabilities);
  assert.equal(receipt.revision, 1);
  assert.equal(receipt.expiresAt, '2026-11-19T10:00:00.000Z');
  assert.equal(receipt.readUrl, `https://example.test/v1/public-profiles/${capabilities.readToken}`);
  assert.deepEqual(collection.read(capabilities.readToken), selected());
  setNow(NOW + 30 * DAY);
  assert.throws(() => collection.read(capabilities.readToken), { code: 'PUBLICATION_GONE' });
});

test('an interrupted publish is retried idempotently and explicit reviewed updates alone renew the same link', t => {
  const { collection, setNow } = fixture(t);
  const { command, receipt } = publish(collection);
  setNow(NOW + DAY / 24);
  assert.deepEqual(collection.publish(command), receipt);
  assert.deepEqual(collection.read(command.readToken), selected());
  const changed = { ...selected(), pseudonym: 'Новые открытия' };
  assert.throws(() => collection.publish({ ...command, snapshot: changed }), { code: 'EXPLICIT_PREVIEW_REQUIRED' });
  assert.throws(() => collection.publish({ ...command, snapshot: changed, confirmedPreviewHash: previewCollection(changed).hash }), { code: 'OPERATION_CONFLICT' });
  assert.throws(() => collection.publish({ ...command, operationId: 'publish-operation-0002' }), { code: 'EXISTING_PUBLICATION' });
  setNow(NOW + DAY);
  const update = { profileId: receipt.profileId, adminCapability: command.adminCapability, expectedRevision: 1, operationId: 'update-operation-0001', snapshot: changed, confirmedPreviewHash: previewCollection(changed).hash, confirmed: true };
  const updated = collection.update(update);
  assert.equal(updated.revision, 2);
  assert.equal(updated.expiresAt, '2026-11-20T10:00:00.000Z');
  assert.deepEqual(collection.read(command.readToken), changed);
  assert.deepEqual(collection.update(update), updated);
  assert.throws(() => collection.update({ ...update, operationId: 'update-operation-0002' }), { code: 'REVISION_CONFLICT' });
  assert.throws(() => collection.update({ ...update, expectedRevision: 2, operationId: 'update-operation-0002', adminCapability: command.readToken }), { code: 'NOT_AUTHORIZED' });
  assert.throws(() => collection.update({ ...update, expectedRevision: 2, operationId: 'update-operation-0002', confirmed: false }), { code: 'EXPLICIT_PREVIEW_REQUIRED' });
});

test('rotation and revocation immediately retire old URLs without renewing expiry or permitting a public reader to manage them', t => {
  const { collection, setNow } = fixture(t);
  const { command, receipt } = publish(collection);
  const replacement = createPublicationCapabilities();
  setNow(NOW + 2 * DAY);
  const rotate = { profileId: receipt.profileId, adminCapability: command.adminCapability, expectedRevision: 1, operationId: 'rotate-operation-0001', newReadToken: replacement.readToken };
  assert.throws(() => collection.rotate({ ...rotate, adminCapability: command.readToken }), { code: 'NOT_AUTHORIZED' });
  const rotated = collection.rotate(rotate);
  assert.equal(rotated.expiresAt, receipt.expiresAt);
  assert.equal(rotated.revision, 2);
  assert.deepEqual(collection.rotate(rotate), rotated);
  assert.throws(() => collection.read(command.readToken), { code: 'PUBLICATION_GONE' });
  assert.deepEqual(collection.read(replacement.readToken), selected());
  const revoke = { profileId: receipt.profileId, adminCapability: command.adminCapability, expectedRevision: 2, operationId: 'revoke-operation-0001' };
  setNow(NOW + 2 * DAY + 1000);
  const revoked = collection.revoke(revoke);
  assert.equal(revoked.status, 'revoked');
  assert.equal(revoked.revision, 3);
  assert.deepEqual(collection.revoke(revoke), revoked);
  assert.throws(() => collection.read(replacement.readToken), { code: 'PUBLICATION_GONE' });
  assert.throws(() => collection.update({ profileId: receipt.profileId, adminCapability: command.adminCapability, expectedRevision: 3, operationId: 'update-operation-0003', snapshot: selected(), confirmedPreviewHash: previewCollection(selected()).hash, confirmed: true }), { code: 'PUBLICATION_GONE' });
  assert.throws(() => collection.publish({ ...command, operationId: 'publish-operation-0003' }), { code: 'READ_TOKEN_RETIRED' });
  const next = createPublicationCapabilities();
  setNow(NOW + 2 * DAY + 2000);
  const republished = publish(collection, { ...next, adminCapability: command.adminCapability, operationId: 'publish-operation-0004' });
  assert.notEqual(republished.receipt.readUrl, receipt.readUrl);
  assert.deepEqual(collection.read(next.readToken), selected());
});

test('maintenance removes expired payloads and old receipts while an explicit new preview can renew the same expired URL', t => {
  const { collection, setNow } = fixture(t);
  const { command, receipt } = publish(collection);
  setNow(NOW + 31 * DAY);
  assert.equal(collection.maintenance().payloadsRemoved, 1);
  assert.equal(collection.maintenance().payloadsRemoved, 0);
  assert.throws(() => collection.read(command.readToken), { code: 'PUBLICATION_GONE' });
  assert.throws(() => collection.publish(command), { code: 'RESULT_NOT_RETAINED' });
  const renewal = collection.update({ profileId: receipt.profileId, adminCapability: command.adminCapability, expectedRevision: 1, operationId: 'renewal-operation-0001', snapshot: selected(), confirmedPreviewHash: previewCollection(selected()).hash, confirmed: true });
  assert.equal(renewal.expiresAt, '2026-12-20T10:00:00.000Z');
  assert.equal(renewal.revision, 2);
  assert.deepEqual(collection.read(command.readToken), selected());
});

test('restoring an old profile database cannot resurrect a revoked URL or grant an old revision control', t => {
  const f = fixture(t);
  const { command, receipt } = publish(f.collection);
  const backup = join(f.folder, 'before-revoke.sqlite');
  f.reopen(path => copyFileSync(path, backup));
  f.setNow(NOW + 1000);
  f.collection.revoke({ profileId: receipt.profileId, adminCapability: command.adminCapability, expectedRevision: 1, operationId: 'revoke-operation-0005' });
  f.reopen(path => copyFileSync(backup, path));
  assert.equal(f.collection.maintenance().payloadsRemoved, 1);
  assert.throws(() => f.collection.read(command.readToken), { code: 'PUBLICATION_GONE' });
  assert.throws(() => f.collection.update({ profileId: receipt.profileId, adminCapability: command.adminCapability, expectedRevision: 1, operationId: 'update-operation-0005', snapshot: selected(), confirmedPreviewHash: previewCollection(selected()).hash, confirmed: true }), { code: 'PUBLICATION_GONE' });
});

test('the HTTP interface publishes the reviewed selection and renders uncached JSON/HTML without exposing management secrets or executing names', async t => {
  const { collection } = fixture(t);
  const handler = createPublicCollectionHandler(collection);
  const capabilities = createPublicationCapabilities();
  const snapshot = { ...selected(), pseudonym: '<script>alert(1)</script>' };
  const privateBody = { readToken: capabilities.readToken, snapshot, confirmedPreviewHash: previewCollection(snapshot).hash, confirmed: true, acknowledgedLossOfDevice: true };
  const create = () => new Request('https://example.test/v1/public-profiles', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${capabilities.adminCapability}`, 'Idempotency-Key': 'http-publish-operation-0001' }, body: JSON.stringify(privateBody) });
  const published = await handler(create());
  assert.equal(published.status, 201);
  const receipt = await published.json();
  assert.ok(receipt.profileId);
  assert.equal(receipt.adminCapability, undefined);
  assert.deepEqual(await (await handler(create())).json(), receipt);
  const read = await handler(new Request(receipt.readUrl));
  assert.equal(read.status, 200);
  assert.equal(read.headers.get('Cache-Control'), 'no-store');
  assert.equal(read.headers.get('Referrer-Policy'), 'no-referrer');
  assert.match(read.headers.get('X-Robots-Tag'), /noindex/);
  assert.deepEqual(await read.json(), snapshot);
  const html = await handler(new Request(receipt.readUrl, { headers: { Accept: 'text/html' } }));
  const page = await html.text();
  assert.equal(html.status, 200);
  assert.equal(html.headers.get('Cache-Control'), 'no-store');
  assert.match(html.headers.get('Content-Security-Policy'), /default-src 'none'/);
  assert.match(page, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(page, /<script/i);
  assert.doesNotMatch(page, new RegExp(capabilities.adminCapability));
  const illegalUpdate = await handler(new Request(`https://example.test/v1/public-profiles/${receipt.profileId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${capabilities.readToken}`, 'Idempotency-Key': 'http-update-operation-0001' }, body: JSON.stringify({ expectedRevision: 1, snapshot, confirmedPreviewHash: previewCollection(snapshot).hash, confirmed: true }) }));
  assert.equal(illegalUpdate.status, 403);
  assert.deepEqual(await illegalUpdate.json(), { error: 'NOT_AUTHORIZED' });
  assert.equal(illegalUpdate.headers.get('Cache-Control'), 'no-store');
});

test('an unavailable independent authority fails closed, and a new restore epoch requires an explicit publication with a new URL', async t => {
  const f = fixture(t);
  const { command, receipt } = publish(f.collection);
  f.authority.suspend();
  const unavailable = await createPublicCollectionHandler(f.collection)(new Request(receipt.readUrl));
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), { error: 'AUTHORITY_UNAVAILABLE' });
  f.authority.openNewEpoch();
  assert.throws(() => f.collection.read(command.readToken), { code: 'PUBLICATION_GONE' });
  assert.throws(() => f.collection.publish({ ...command, operationId: 'new-epoch-publication-0001' }), { code: 'READ_TOKEN_RETIRED' });
  const next = createPublicationCapabilities();
  f.setNow(NOW + 1000);
  const republished = publish(f.collection, { ...next, adminCapability: command.adminCapability, operationId: 'new-epoch-publication-0002' });
  assert.notEqual(republished.receipt.readUrl, receipt.readUrl);
  assert.deepEqual(f.collection.read(next.readToken), selected());
  const unconfirmed = createSqlitePublicationAuthority({ databasePath: join(f.folder, 'unconfirmed.sqlite') });
  f.onClose(() => unconfirmed.close());
  assert.throws(() => unconfirmed.openNewEpoch(), { code: 'AUTHORITY_UNAVAILABLE' });
  const blocked = createPublicCollection({ databasePath: join(f.folder, 'unconfirmed-profiles.sqlite'), authority: unconfirmed, now: () => NOW, publicBaseUrl: 'https://example.test', catalog: catalog() });
  f.onClose(() => blocked.close());
  assert.throws(() => blocked.read(next.readToken), { code: 'AUTHORITY_UNAVAILABLE' });
});

test('private coordinates, dates, device IDs and extra nested fields are rejected instead of being copied or silently published', async t => {
  const { collection } = fixture(t);
  const handler = createPublicCollectionHandler(collection);
  const forbidden = [
    { ...selected(), coordinates: [71.4, 51.1] },
    { ...selected(), visitedAt: '2026-10-20T10:00:00Z' },
    { ...selected(), deviceId: 'private-device' },
    { ...selected(), adminCapability: createPublicationCapabilities().adminCapability },
    { ...selected(), discoveries: [{ ...selected().discoveries[0], latitude: 51.1 }] },
    { ...selected(), badges: [{ ...selected().badges[0], earnedAt: NOW }] },
    { ...selected(), quests: [{ ...selected().quests[0], gpsTrack: [] }] },
  ];
  for (const snapshot of forbidden) {
    assert.throws(() => previewCollection(snapshot), { code: 'INVALID_INPUT' });
    const response = await handler(new Request('https://example.test/v1/public-profiles/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(snapshot) }));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'INVALID_INPUT' });
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  }
  const capabilities = createPublicationCapabilities();
  const snapshot = selected();
  const unconfirmed = { operationId: 'unconfirmed-publish-0001', ...capabilities, snapshot, confirmedPreviewHash: previewCollection(snapshot).hash, confirmed: false, acknowledgedLossOfDevice: true };
  assert.throws(() => collection.publish(unconfirmed), { code: 'EXPLICIT_PREVIEW_REQUIRED' });
  assert.throws(() => collection.publish({ ...unconfirmed, confirmed: true, acknowledgedLossOfDevice: false }), { code: 'EXPLICIT_PREVIEW_REQUIRED' });
  assert.throws(() => collection.read(capabilities.readToken), { code: 'PUBLICATION_GONE' });
  const tooLarge = { ...selected(), discoveries: Array.from({ length: 128 }, (_, i) => ({ id: `place-${i}`, title: 'Ж'.repeat(160), proof: 'manual_reported' })) };
  assert.throws(() => previewCollection(tooLarge), { code: 'PAYLOAD_TOO_LARGE' });
});

test('the profile database cannot alias the independent authority file through a different hard-link path', t => {
  const f = fixture(t);
  const alias = join(f.folder, 'not-independent.sqlite');
  linkSync(join(f.folder, 'authority.sqlite'), alias);
  let mistaken;
  try {
    assert.throws(() => { mistaken = createPublicCollection({ databasePath: alias, authority: f.authority, now: () => NOW, publicBaseUrl: 'https://example.test', catalog: catalog() }); }, { code: 'AUTHORITY_MUST_BE_SEPARATE' });
  } finally { mistaken?.close(); }
});

test('the HTTP owner path updates language, replaces the link, revokes both representations and rejects oversized or malformed requests', async t => {
  const { collection, setNow } = fixture(t);
  const handler = createPublicCollectionHandler(collection);
  const { command, receipt } = publish(collection);
  const owner = (url, method, operation, input) => handler(new Request(url, { method, headers: { Authorization: `Bearer ${command.adminCapability}`, 'Idempotency-Key': operation, 'Content-Type': 'application/json' }, body: JSON.stringify(input) }));
  const snapshot = selected('kk');
  setNow(NOW + 1000);
  const updated = await owner(`https://example.test/v1/public-profiles/${receipt.profileId}`, 'PUT', 'http-owner-update-0001', { expectedRevision: 1, snapshot, confirmedPreviewHash: previewCollection(snapshot).hash, confirmed: true });
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).revision, 2);
  const translated = await handler(new Request(receipt.readUrl, { headers: { Accept: 'text/html' } }));
  const translatedPage = await translated.text();
  assert.match(translatedPage, /lang="kk"/);
  assert.match(translatedPage, /Қолмен белгіленген|Тапсырма орындалды/);
  const nextReadToken = createPublicationCapabilities().readToken;
  setNow(NOW + 2000);
  const rotation = await owner(`https://example.test/v1/public-profiles/${receipt.profileId}/rotate`, 'POST', 'http-owner-rotate-0001', { expectedRevision: 2, newReadToken: nextReadToken });
  const rotated = await rotation.json();
  assert.equal(rotation.status, 200);
  assert.equal(rotated.revision, 3);
  for (const accept of ['application/json', 'text/html']) {
    const gone = await handler(new Request(receipt.readUrl, { headers: { Accept: accept } }));
    assert.equal(gone.status, 410);
    assert.equal(gone.headers.get('Cache-Control'), 'no-store');
  }
  setNow(NOW + 3000);
  const revoked = await owner(`https://example.test/v1/public-profiles/${receipt.profileId}`, 'DELETE', 'http-owner-revoke-0001', { expectedRevision: 3 });
  assert.equal(revoked.status, 200);
  assert.equal((await revoked.json()).status, 'revoked');
  assert.equal((await handler(new Request(rotated.readUrl))).status, 410);
  const headGone = await handler(new Request(rotated.readUrl, { method: 'HEAD' }));
  assert.equal(headGone.status, 410);
  assert.equal(await headGone.text(), '');
  const malformed = await handler(new Request('https://example.test/v1/public-profiles/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"coordinates":' }));
  assert.equal(malformed.status, 400);
  assert.deepEqual(await malformed.json(), { error: 'INVALID_JSON' });
  const oversized = await handler(new Request('https://example.test/v1/public-profiles/preview', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': '2' }, body: 'x'.repeat(42_000) }));
  assert.equal(oversized.status, 413);
  assert.equal(oversized.headers.get('Cache-Control'), 'no-store');
});

test('a rotated URL is never revived by restoring an older profile snapshot or republishing its read token', t => {
  const f = fixture(t);
  const { command, receipt } = publish(f.collection);
  const backup = join(f.folder, 'before-rotate.sqlite');
  f.reopen(path => copyFileSync(path, backup));
  const nextReadToken = createPublicationCapabilities().readToken;
  f.setNow(NOW + 1000);
  f.collection.rotate({ profileId: receipt.profileId, adminCapability: command.adminCapability, expectedRevision: 1, operationId: 'backup-rotate-operation-0001', newReadToken: nextReadToken });
  assert.deepEqual(f.collection.read(nextReadToken), selected());
  f.reopen(path => copyFileSync(backup, path));
  assert.throws(() => f.collection.read(command.readToken), { code: 'PUBLICATION_GONE' });
  assert.throws(() => f.collection.read(nextReadToken), { code: 'PUBLICATION_GONE' });
  const replacement = createPublicationCapabilities();
  assert.throws(() => publish(f.collection, { ...replacement, readToken: command.readToken, operationId: 'reused-old-url-publication-0001' }), { code: 'READ_TOKEN_RETIRED' });
});

test('server clock rollback and ordinary reads cannot revive or silently extend an expired publication', t => {
  const { collection, setNow } = fixture(t);
  const { command, receipt } = publish(collection);
  setNow(NOW + 30 * DAY);
  assert.throws(() => collection.read(command.readToken), { code: 'PUBLICATION_GONE' });
  setNow(NOW - DAY);
  assert.throws(() => collection.read(command.readToken), { code: 'PUBLICATION_GONE' });
  const renewed = collection.update({ profileId: receipt.profileId, adminCapability: command.adminCapability, expectedRevision: 1, operationId: 'clock-renewal-operation-0001', snapshot: selected(), confirmedPreviewHash: previewCollection(selected()).hash, confirmed: true });
  assert.equal(renewed.expiresAt, '2026-12-19T10:00:00.000Z');
  assert.deepEqual(collection.read(command.readToken), selected());
});

test('concurrent HTTP updates cannot overwrite a winning revision and a later stale request cannot undo revoke', async t => {
  const { collection, setNow } = fixture(t);
  const { command, receipt } = publish(collection);
  const handler = createPublicCollectionHandler(collection);
  const choices = ['Первый выбор', 'Второй выбор'].map(pseudonym => ({ ...selected(), pseudonym }));
  setNow(NOW + 1000);
  const results = await Promise.all(choices.map((snapshot, i) => handler(new Request(`https://example.test/v1/public-profiles/${receipt.profileId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${command.adminCapability}`, 'Idempotency-Key': `concurrent-update-000${i}` },
    body: JSON.stringify({ expectedRevision: 1, snapshot, confirmedPreviewHash: previewCollection(snapshot).hash, confirmed: true }),
  }))));
  assert.deepEqual(results.map(response => response.status).sort(), [200, 409]);
  const winner = results.findIndex(response => response.status === 200);
  assert.deepEqual(collection.read(command.readToken), choices[winner]);
  setNow(NOW + 2000);
  collection.revoke({ profileId: receipt.profileId, adminCapability: command.adminCapability, expectedRevision: 2, operationId: 'concurrent-revoke-0001' });
  assert.throws(() => collection.update({ profileId: receipt.profileId, adminCapability: command.adminCapability, expectedRevision: 2, operationId: 'late-concurrent-update-0001', snapshot: selected(), confirmedPreviewHash: previewCollection(selected()).hash, confirmed: true }), { code: 'PUBLICATION_GONE' });
  assert.throws(() => collection.read(command.readToken), { code: 'PUBLICATION_GONE' });
});

test('an invalid server clock or closed authority produces a bounded unavailable response without disclosing underlying errors', async t => {
  const f = fixture(t);
  const { receipt } = publish(f.collection);
  const handler = createPublicCollectionHandler(f.collection);
  f.setNow(Number.NaN);
  const invalidClock = await handler(new Request(receipt.readUrl));
  assert.equal(invalidClock.status, 503);
  assert.deepEqual(await invalidClock.json(), { error: 'CLOCK_UNAVAILABLE' });
  f.setNow(NOW);
  assert.equal((await handler(new Request(receipt.readUrl))).status, 200);
  f.authority.close();
  const unavailable = await handler(new Request(receipt.readUrl));
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), { error: 'AUTHORITY_UNAVAILABLE' });
  assert.throws(() => f.collection.maintenance(), { code: 'STORAGE_UNAVAILABLE' });
});

test('atomic installation budgets enforce one mutation per second and reserve the tenth daily action for revoke', t => {
  const { collection, setNow } = fixture(t);
  const { command, receipt } = publish(collection);
  const update = (expectedRevision, operation) => ({ profileId: receipt.profileId, adminCapability: command.adminCapability, expectedRevision, operationId: operation, snapshot: selected(), confirmedPreviewHash: previewCollection(selected()).hash, confirmed: true });
  assert.throws(() => collection.update(update(1, 'rate-too-fast-update-0001')), { code: 'MUTATION_RATE_LIMITED', status: 429 });
  let currentRevision = 1;
  for (let i = 1; i <= 8; i++) {
    setNow(NOW + i * 1000);
    currentRevision = collection.update(update(currentRevision, `daily-budget-update-000${i}`)).revision;
  }
  setNow(NOW + 9000);
  assert.throws(() => collection.update(update(currentRevision, 'daily-budget-update-0010')), { code: 'INSTALLATION_BUDGET_EXHAUSTED', status: 429 });
  const revoked = collection.revoke({ profileId: receipt.profileId, adminCapability: command.adminCapability, expectedRevision: currentRevision, operationId: 'reserved-daily-revoke-0001' });
  assert.equal(revoked.status, 'revoked');
  assert.throws(() => collection.read(command.readToken), { code: 'PUBLICATION_GONE' });
  const next = createPublicationCapabilities();
  setNow(NOW + 10000);
  assert.throws(() => publish(collection, { ...next, adminCapability: command.adminCapability, operationId: 'after-daily-revoke-publish-0001' }), { code: 'INSTALLATION_BUDGET_EXHAUSTED', status: 429 });
  setNow(NOW + DAY);
  const fresh = publish(collection, { ...next, adminCapability: command.adminCapability, operationId: 'after-daily-revoke-publish-0002' });
  assert.equal(fresh.receipt.revision, 1);
});

test('the persistent global mutation budget cannot be bypassed by creating fresh capabilities', t => {
  const f = fixture(t, { mutationsPerDay: 2 });
  publish(f.collection);
  publish(f.collection, { ...createPublicationCapabilities(), operationId: 'second-global-publication-0001' });
  const third = { operationId: 'third-global-publication-0001', ...createPublicationCapabilities(), snapshot: selected(), confirmedPreviewHash: previewCollection(selected()).hash, confirmed: true, acknowledgedLossOfDevice: true };
  assert.throws(() => f.collection.publish(third), { code: 'GLOBAL_MUTATION_BUDGET_EXHAUSTED', status: 429 });
  f.reopen();
  assert.throws(() => f.collection.publish(third), { code: 'GLOBAL_MUTATION_BUDGET_EXHAUSTED', status: 429 });
  f.setNow(NOW + DAY);
  assert.equal(f.collection.publish(third).revision, 1);
});

test('aggregate persistent read and HTTP budgets bound traffic without IP identifiers and send Retry-After', async t => {
  const f = fixture(t, { readsPerMinute: 2, readsPerDay: 3, requestsPerMinute: 3 });
  const { receipt } = publish(f.collection);
  let handler = createPublicCollectionHandler(f.collection);
  assert.equal((await handler(new Request(receipt.readUrl))).status, 200);
  assert.equal((await handler(new Request(receipt.readUrl))).status, 200);
  const readLimit = await handler(new Request(receipt.readUrl));
  assert.equal(readLimit.status, 429);
  assert.equal(readLimit.headers.get('Retry-After'), '60');
  assert.deepEqual(await readLimit.json(), { error: 'PUBLIC_READ_RATE_LIMITED' });
  f.reopen(); handler = createPublicCollectionHandler(f.collection);
  const requestLimit = await handler(new Request(receipt.readUrl));
  assert.equal(requestLimit.status, 429);
  assert.deepEqual(await requestLimit.json(), { error: 'PUBLIC_REQUEST_RATE_LIMITED' });
  f.setNow(NOW + 60_000);
  assert.equal((await handler(new Request(receipt.readUrl))).status, 200);
  f.setNow(NOW + 120_000);
  const daily = await handler(new Request(receipt.readUrl));
  assert.equal(daily.status, 429);
  assert.deepEqual(await daily.json(), { error: 'PUBLIC_READ_BUDGET_EXHAUSTED' });
});

test('a finite storage ceiling closes publication fail closed and lets maintenance remove inaccessible payloads', t => {
  const f = fixture(t, { maxProfiles: 1 });
  const first = publish(f.collection);
  assert.throws(() => publish(f.collection, { ...createPublicationCapabilities(), operationId: 'storage-capacity-publication-0002' }), { code: 'PUBLIC_CAPACITY_EXHAUSTED', status: 503 });
  assert.throws(() => f.collection.read(first.command.readToken), { code: 'AUTHORITY_UNAVAILABLE', status: 503 });
  assert.equal(f.collection.maintenance().payloadsRemoved, 1);
  assert.equal(f.collection.maintenance().payloadsRemoved, 0);
});
