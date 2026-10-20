// Uses ordinary ESM package exports and real crypto; no transpiling test loader.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import * as contracts from '@astanaai/contracts';
import { readBundle, verifyPack } from '@astanaai/contracts';
import { createCityEvidence } from '@astanaai/city-evidence';
import { createReplayPlanner } from '@astanaai/walk-planner';
import { createPackStore } from '@astanaai/offline-pack';
import { openFilesystemStorage } from '@astanaai/offline-pack/node-storage';
const hash = async value => createHash('sha256').update(value, 'utf8').digest('hex');

test('normal Node package imports search real data, produce a sealed walk and refuse incomplete offline assets', async () => {
  const at = '2026-10-20T12:00:00.000Z';
  const evidence = createCityEvidence();
  const result = await evidence.search({ locale: 'ru', at, area: { kind: 'public_zone', zoneId: 'astana:bayterek-research' }, terms: ['Байтерек'], interests: [], required: ['public_anchor'], limit: 1 });
  assert.equal(result.pois[0].id, 'osm:way/230401645');
  const planner = createReplayPlanner({ evidence, hash, now: () => at, id: () => 'node-workspace-recorded-check' });
  const reply = await planner.plan({ requestId: 'node-check', locale: 'en', origin: { kind: 'public_anchor', anchorId: 'bayterek-outdoor', explicitlyChosen: true }, startAt: at, budgetMinutes: 80, endRule: { kind: 'return_to_start' }, interests: ['architecture'], constraints: [], contextFlags: [] });
  assert.equal(reply.kind, 'candidates');
  const json = JSON.stringify(reply.bundles[0]);
  assert.equal((await readBundle(json, hash)).ok, true);
  const pack = await verifyPack(json, hash, async () => ({ state: 'missing' }));
  assert.equal(pack.state, 'partial');
  assert.ok(pack.missing.some(item => item.reason === 'MAP_UNAVAILABLE'));
});

test('a real planned revision persists as a partial pinned pack across storage reopen without activation', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'astana-node-integration-'));
  let storage;
  t.after(async () => {
    storage?.close();
    // Delete only the exact task-created directory; refuse a substituted root.
    assert.equal(resolve(await realpath(directory)).toLowerCase(), resolve(directory).toLowerCase());
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + '\\'));
    await rm(directory, { recursive: true });
  });
  const at = '2026-10-20T12:00:00.000Z';
  const planner = createReplayPlanner({ hash, now: () => at, id: () => 'node-pack-persistence' });
  const result = await planner.plan({ requestId: 'pack-check', locale: 'ru', origin: { kind: 'public_anchor', anchorId: 'bayterek-outdoor', explicitlyChosen: true }, startAt: at, budgetMinutes: 80, endRule: { kind: 'return_to_start' }, interests: [], constraints: [], contextFlags: [] });
  assert.equal(result.kind, 'candidates');
  const bundle = result.bundles[0];
  let sourceCalls = 0;
  const source = { async open() { sourceCalls++; throw new Error('No source is supplied in this offline source-replay check'); } };
  const open = async () => {
    storage = await openFilesystemStorage(directory);
    return createPackStore({ contracts, storage, source, hash, userAgent: 'AstanaAI/0.4 (local integration; network disabled)' });
  };
  let packs = await open();
  const prepared = await packs.prepare(JSON.stringify(bundle));
  assert.equal(prepared.state, 'partial');
  assert.ok(prepared.missing.some(item => item.reason === 'MAP_UNAVAILABLE'));
  await assert.rejects(() => packs.activate(bundle.sha256), /PACK_NOT_READY/);
  await packs.pin('local-partial-session', bundle.sha256);
  storage.close(); storage = undefined;
  packs = await open();
  const snapshot = await packs.snapshot();
  assert.equal(snapshot.current, null);
  assert.equal(snapshot.previous, null);
  assert.deepEqual(snapshot.pins, [{ sessionId: 'local-partial-session', bundleHash: bundle.sha256 }]);
  assert.equal((await packs.verify(bundle.sha256)).state, 'partial');
  assert.equal(sourceCalls, 0);
});
