import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile, mkdir, rename, symlink, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createPackStore } from '../src/index.mjs';
import { openFilesystemStorage } from '../src/node-storage.mjs';
import helpers from './helpers.cjs';
const { contracts, hash, bundle } = helpers;
const userAgent = 'AstanaAI/0.1 (offline-pack-tests; contact: project@example.invalid)';
const source = files => ({ async open(asset) { return { body: (async function* () { yield files.get(asset.id); })() }; } });
async function environment(t, sample, options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'astana-pack-'));
  const storage = await openFilesystemStorage(join(root, 'owned'));
  t.after(async () => { storage.close(); await rm(root, { recursive: true, force: true }); });
  return { root, storage, packs: createPackStore({ storage, source: source(sample.files), contracts, hash, userAgent, ...options }) };
}

test('prepare verifies durable bytes, activation survives storage restart with exact identity', async t => {
  const root = await mkdtemp(join(tmpdir(), 'astana-pack-'));
  let storage, reopened;
  t.after(async () => { reopened?.close(); storage?.close(); await rm(root, { recursive: true, force: true }); });
  const sample = await bundle();
  storage = await openFilesystemStorage(join(root, 'owned'));
  const packs = createPackStore({ storage, source: source(sample.files), contracts, hash, userAgent });
  const prepared = await packs.prepare(sample.json);
  assert.equal(prepared.state, 'ready');
  assert.equal((await packs.snapshot()).current, null);
  await packs.activate(sample.bundle.sha256);
  storage.close();
  reopened = await openFilesystemStorage(join(root, 'owned'));
  const restored = createPackStore({ storage: reopened, source: source(new Map()), contracts, hash, userAgent });
  const state = await restored.snapshot();
  assert.equal(state.current.identity.bundleHash, sample.bundle.sha256);
  assert.equal(state.current.verification.state, 'ready');
  assert.equal(state.current.identity.revision, 1);
  assert.equal(state.previous, null);
});

test('an interrupted revision preserves current, retries reuse hashes, and session pin prevents eviction', async t => {
  const first = await bundle();
  const next = await bundle(2, first.bundle, (w, files, asset) => {
    w.assets.items.push(asset('new-text', 'text', 'New revision material'));
  });
  let offline = true, requests = [];
  const feed = { async open(asset) {
    requests.push(asset.id);
    if (asset.id === 'new-text' && offline) throw new Error('SOURCE_UNAVAILABLE');
    return { body: (async function* () { yield next.files.get(asset.id); })() };
  } };
  const { packs } = await environment(t, first, { source: feed });
  await packs.prepare(first.json); await packs.activate(first.bundle.sha256);
  await packs.pin('active-session', first.bundle.sha256);
  requests = [];
  const partial = await packs.prepare(next.json);
  assert.equal(partial.state, 'partial');
  assert.deepEqual(requests, ['new-text']);
  assert.equal((await packs.snapshot()).current.identity.bundleHash, first.bundle.sha256);
  await assert.rejects(packs.activate(next.bundle.sha256), /PACK_NOT_READY/);
  offline = false; requests = [];
  assert.equal((await packs.prepare(next.json)).state, 'ready');
  assert.deepEqual(requests, ['new-text']);
  await packs.activate(next.bundle.sha256);
  assert.equal((await packs.snapshot()).previous.identity.bundleHash, first.bundle.sha256);
  await assert.rejects(packs.remove(first.bundle.sha256), /PACK_PINNED/);
  await packs.unpin('active-session');
  await packs.remove(first.bundle.sha256);
  assert.equal((await packs.verify(next.bundle.sha256)).state, 'ready');
  assert.equal((await packs.snapshot()).previous, null);
});

test('downloads overlap only within four slots and every source receives identifying headers', async t => {
  const sample = await bundle(); let active = 0, peak = 0;
  const feed = { async open(asset, request) {
    assert.equal(request.headers['User-Agent'], userAgent);
    active++; peak = Math.max(peak, active);
    return { body: (async function* () {
      try { await new Promise(resolve => setTimeout(resolve, 5)); yield sample.files.get(asset.id); }
      finally { active--; }
    })() };
  } };
  const { packs } = await environment(t, sample, { source: feed, limits: { concurrency: 4 } });
  assert.equal((await packs.prepare(sample.json)).state, 'ready');
  assert.equal(peak, 4); assert.equal(active, 0);
});

test('actual streamed bytes enforce transfer and storage bounds before writing the excessive chunk', async t => {
  const sample = await bundle(); let opened = 0;
  const feed = { async open() { opened++; return { body: (async function* () {
    yield Buffer.from('ab'); yield Buffer.from('cd'); yield Buffer.from('never read');
  })() }; } };
  const { packs, storage } = await environment(t, sample, { source: feed,
    limits: { concurrency: 1, maxTransferBytes: 2 } });
  const result = await packs.prepare(sample.json);
  assert.equal(result.state, 'partial');
  assert.equal(result.transfer.receivedBytes, 4);
  assert.equal(result.transfer.downloadedBytes, 2);
  assert.equal(result.transfer.failures[0].code, 'TRANSFER_BYTE_LIMIT');
  assert.equal(opened, 1);
  assert.equal(await storage.usage(), 0);
  assert.equal((await packs.snapshot()).current, null);
});

test('tile-provider map and whole-pack budgets fail before a source is opened', async t => {
  const sample = await bundle(); let opened = 0;
  const feed = { async open() { opened++; throw new Error('must not download'); } };
  const { packs } = await environment(t, sample, { source: feed,
    limits: { maxPackBytes: 1, maxMapBytes: 1 }, mapPolicy: { kind: 'tile_provider', tileAssetIds: ['map'] } });
  const result = await packs.prepare(sample.json);
  assert.equal(result.state, 'partial');
  assert.deepEqual(result.policyErrors.sort(), ['MAP_BYTE_LIMIT', 'PACK_BYTE_LIMIT']);
  assert.equal(opened, 0);
  await assert.rejects(packs.activate(sample.bundle.sha256), /PACK_NOT_READY/);
});

test('an unsupported bundle is preserved outside active state without parsing or fetching its paths', async t => {
  const sample = await bundle();
  const { packs } = await environment(t, sample);
  await packs.prepare(sample.json); await packs.activate(sample.bundle.sha256);
  const future = JSON.stringify({ schemaVersion: 99, maliciousPath: '../outside', notes: 'retain original future payload' });
  const rejected = await packs.prepare(future);
  assert.equal(rejected.code, 'UNSUPPORTED_BUNDLE_VERSION');
  assert.equal((await packs.getRejected(rejected.rejectedId)).json, future);
  assert.equal((await packs.snapshot()).current.verification.state, 'ready');
  assert.equal((await packs.snapshot()).current.identity.bundleHash, sample.bundle.sha256);
});

test('cancelling a stalled source returns partial promptly and discards only its temporary writer', async t => {
  const sample = await bundle();
  const controller = new AbortController();
  const feed = { async open() { return new Promise(() => {}); } };
  const { packs, storage } = await environment(t, sample, { source: feed, limits: { concurrency: 1 } });
  const pending = packs.prepare(sample.json, { signal: controller.signal });
  const abort = setTimeout(() => controller.abort(), 20);
  let deadline;
  try {
    const result = await Promise.race([pending, new Promise((_, reject) => {
      deadline = setTimeout(() => reject(new Error('Cancel did not stop the stalled request')), 1500);
    })]);
    assert.equal(result.state, 'partial');
    assert.equal(result.transfer.failures[0].code, 'CANCELLED');
    assert.equal(await storage.usage(), 0);
  } finally { clearTimeout(abort); clearTimeout(deadline); }
});

test('snapshot rechecks actual current bytes and a repaired retry restores the same identity', async t => {
  const sample = await bundle();
  const { packs, root } = await environment(t, sample);
  await packs.prepare(sample.json); await packs.activate(sample.bundle.sha256);
  const map = sample.bundle.assets.items.find(a => a.id === 'map');
  // Inject physical file damage, then observe only through the public Module.
  await writeFile(join(root, 'owned', 'objects', map.sha256), 'damaged');
  const current = (await packs.snapshot()).current;
  assert.equal(current.verification.state, 'partial');
  assert.ok(current.verification.missing.some(item => item.id === 'map' && item.reason === 'CORRUPT_FILE'));
  assert.equal('status' in current, false);
  assert.equal((await packs.prepare(sample.json)).state, 'ready');
  assert.equal((await packs.snapshot()).current.identity.bundleHash, sample.bundle.sha256);
});

test('filesystem adapter refuses traversal and a substituted object-directory junction before deletion', async t => {
  const sample = await bundle();
  const { packs, storage, root } = await environment(t, sample);
  await packs.prepare(sample.json);
  await assert.rejects(storage.removeBlob('../outside'), /UNSAFE_BLOB_NAME/);
  const unrelated = join(root, 'unrelated'); await mkdir(unrelated);
  const digest = sample.bundle.assets.items[0].sha256;
  const victim = join(unrelated, digest); await writeFile(victim, 'unrelated sentinel');
  const objectPath = join(root, 'owned', 'objects');
  await rename(objectPath, join(root, 'owned', 'saved-objects'));
  try { await symlink(unrelated, objectPath, 'junction'); }
  catch (error) {
    await rename(join(root, 'owned', 'saved-objects'), objectPath);
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) return t.skip('OS cannot create the test junction');
    throw error;
  }
  try {
    await assert.rejects(storage.removeBlob(digest), /UNSAFE_STORAGE_DIRECTORY/);
    assert.equal(await readFile(victim, 'utf8'), 'unrelated sentinel');
  } finally {
    await unlink(objectPath);
    await rename(join(root, 'owned', 'saved-objects'), objectPath);
  }
});

test('a killed writer leaves current and session pin intact; reopening reclaims only its dead temporary file', async t => {
  const sample = await bundle();
  const { packs, storage, root } = await environment(t, sample);
  await packs.prepare(sample.json); await packs.activate(sample.bundle.sha256);
  await packs.pin('session-before-crash', sample.bundle.sha256);
  // Use the URL directly on Windows too; never invoke a shell for process control.
  const moduleUrl = new URL('../src/node-storage.mjs', import.meta.url).href;
  const script = `const {openFilesystemStorage}=await import(${JSON.stringify(moduleUrl)});
    const s=await openFilesystemStorage(${JSON.stringify(join(root, 'owned'))});
    const w=await s.createBlob('${'f'.repeat(64)}'); await w.write(new Uint8Array([1,2,3]));
    process.send('temporary-written'); setInterval(()=>{},1000);`;
  const child = spawn(process.execPath, ['--experimental-sqlite', '--input-type=module', '-e', script],
    { stdio: ['ignore', 'ignore', 'pipe', 'ipc'], windowsHide: true });
  let errorText = ''; child.stderr.on('data', chunk => { errorText += chunk; });
  try {
    await Promise.race([once(child, 'message'), once(child, 'exit').then(() => { throw new Error(errorText); })]);
    const exited = once(child, 'exit'); child.kill(); await exited;
    storage.close();
    const restarted = await openFilesystemStorage(join(root, 'owned'));
    try {
      const restored = createPackStore({ storage: restarted, source: source(sample.files), contracts, hash, userAgent });
      const state = await restored.snapshot();
      assert.equal(state.current.verification.state, 'ready');
      assert.deepEqual(state.pins, [{ sessionId: 'session-before-crash', bundleHash: sample.bundle.sha256 }]);
      const expectedBytes = [...new Map(sample.bundle.assets.items.map(a => [a.sha256, a.bytes])).values()].reduce((a, b) => a + b, 0);
      assert.equal(await restarted.usage(), expectedBytes);
    } finally { restarted.close(); }
  } finally {
    if (child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
  }
});

test('a simulated storage-open failure reports a partial revision while the real previous pack stays ready', async t => {
  const first = await bundle();
  const next = await bundle(2, first.bundle, (w, files, asset) => w.assets.items.push(asset('additional', 'text', 'new bytes')));
  const { packs, storage } = await environment(t, first);
  await packs.prepare(first.json); await packs.activate(first.bundle.sha256);
  const failedStorage = { ...storage, async createBlob() { throw Object.assign(new Error('simulated disk full'), { code: 'ENOSPC' }); } };
  const newStore = createPackStore({ storage: failedStorage, source: source(next.files), contracts, hash, userAgent });
  const result = await newStore.prepare(next.json);
  assert.equal(result.state, 'partial');
  assert.equal(result.transfer.failures.at(-1).code, 'STORAGE_UNAVAILABLE');
  assert.equal((await packs.snapshot()).current.identity.bundleHash, first.bundle.sha256);
  assert.equal((await packs.snapshot()).current.verification.state, 'ready');
});

test('the actual storage byte quota rejects a chunk before persistence without evicting anything', async t => {
  const sample = await bundle();
  const { packs, storage } = await environment(t, sample, { limits: { concurrency: 1, maxStoredBytes: 2 } });
  const result = await packs.prepare(sample.json);
  assert.equal(result.state, 'partial');
  assert.equal(result.transfer.failures[0].code, 'STORAGE_BYTE_LIMIT');
  assert.equal(result.transfer.downloadedBytes, 0);
  assert.equal(await storage.usage(), 0);
});

test('unsafe bundled path normalization and a non-owned root fail closed', async t => {
  const sample = await bundle(1, undefined, w => { w.assets.items[0].location.path = 'maps/./city.bin'; });
  let opened = 0;
  const { packs, root } = await environment(t, sample, { source: { async open() { opened++; throw new Error('not expected'); } } });
  const result = await packs.prepare(sample.json);
  assert.equal(result.state, 'partial');
  assert.ok(result.policyErrors.includes('UNSAFE_ASSET_PATH'));
  assert.equal(opened, 0);
  const unrelated = join(root, 'unowned'); await mkdir(unrelated);
  await writeFile(join(unrelated, 'keep.txt'), 'original content');
  await assert.rejects(openFilesystemStorage(unrelated), /UNOWNED_STORAGE/);
  assert.equal(await readFile(join(unrelated, 'keep.txt'), 'utf8'), 'original content');
});

test('configuration cannot raise hard provider or concurrency caps', async t => {
  const sample = await bundle(); const { storage } = await environment(t, sample);
  for (const limits of [{ concurrency: 5 }, { maxMapBytes: 50_000_001 }, { maxMapTiles: 3001 }]) {
    assert.throws(() => createPackStore({ storage, source: source(sample.files), contracts, hash, userAgent, limits }), /INVALID_/);
  }
  assert.throws(() => createPackStore({ storage, source: source(sample.files), contracts, hash, userAgent: 'unknown' }), /IDENTIFYING_USER_AGENT_REQUIRED/);
});
