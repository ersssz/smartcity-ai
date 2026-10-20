/** Node-only task-owned filesystem Adapter. Not an Android storage adapter. */
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, lstat, readFile, writeFile, open, rename, unlink, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const DIGEST = /^[a-f0-9]{64}$/;
const MARKER = 'AstanaAI offline-pack storage v1\n';
const PARTIAL = /^([1-9]\d*)-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.partial$/;
const initial = () => ({ version: 1, packs: {}, current: null, previous: null, pins: [], rejected: [] });
const missing = error => error?.code === 'ENOENT';
const queues = new Map();

async function regular(path) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('UNSAFE_STORAGE_FILE');
  return stat;
}
async function directory(path) {
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('UNSAFE_STORAGE_DIRECTORY');
}

export async function openFilesystemStorage(root) {
  const owned = resolve(root);
  await mkdir(owned, { recursive: true });
  await directory(owned);
  const marker = join(owned, '.astanaai-offline-owner');
  try {
    await regular(marker);
    if (await readFile(marker, 'utf8') !== MARKER) throw new Error('UNOWNED_STORAGE');
  } catch (error) {
    if (!missing(error)) throw error;
    if ((await readdir(owned)).length) throw new Error('UNOWNED_STORAGE');
    await writeFile(marker, MARKER, { flag: 'wx' });
  }
  const objects = join(owned, 'objects'), temporary = join(owned, 'temporary');
  for (const path of [objects, temporary]) { await mkdir(path, { recursive: true }); await directory(path); }
  async function guardDirectories() {
    for (const path of [owned, objects, temporary]) await directory(path);
    await regular(marker);
    if (await readFile(marker, 'utf8') !== MARKER) throw new Error('UNOWNED_STORAGE');
  }
  await guardDirectories();
  // Only unpublished writers whose owning OS process is confirmed absent.
  // Live/reused PIDs and unrecognized names are retained, never guessed stale.
  for (const name of await readdir(temporary)) {
    const match = PARTIAL.exec(name);
    if (!match) continue;
    const pid = Number(match[1]);
    if (!Number.isSafeInteger(pid)) continue;
    let dead = false;
    try { process.kill(pid, 0); }
    catch (error) { if (error.code === 'ESRCH') dead = true; else if (error.code !== 'EPERM') throw error; }
    if (dead) {
      await guardDirectories();
      const path = join(temporary, name);
      try { await regular(path); await unlink(path); } catch (error) { if (!missing(error)) throw error; }
    }
  }
  const dbPath = join(owned, 'manifests.sqlite');
  try { await regular(dbPath); } catch (error) { if (!missing(error)) throw error; }
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id = 1), value TEXT NOT NULL)');
  db.prepare('INSERT OR IGNORE INTO state(id,value) VALUES(1,?)').run(JSON.stringify(initial()));
  let closed = false;
  const blobPath = digest => {
    if (!DIGEST.test(digest)) throw new Error('UNSAFE_BLOB_NAME');
    return join(objects, digest);
  };
  async function inspectBlob(digest) {
    const path = blobPath(digest);
    await guardDirectories();
    try {
      await regular(path);
      const hash = createHash('sha256'); let bytes = 0;
      for await (const chunk of createReadStream(path)) { hash.update(chunk); bytes += chunk.length; }
      return { state: 'present', sha256: hash.digest('hex'), bytes, storage: 'durable' };
    } catch (error) { if (missing(error)) return { state: 'missing' }; throw error; }
  }
  return {
    exclusive(operation) {
      const previous = queues.get(owned) ?? Promise.resolve();
      const next = previous.catch(() => {}).then(operation);
      queues.set(owned, next);
      const release = () => { if (queues.get(owned) === next) queues.delete(owned); };
      next.then(release, release);
      return next;
    },
    async readState() { await guardDirectories(); return JSON.parse(db.prepare('SELECT value FROM state WHERE id=1').get().value); },
    async updateState(change) {
      await guardDirectories();
      db.exec('BEGIN IMMEDIATE');
      try {
        const before = JSON.parse(db.prepare('SELECT value FROM state WHERE id=1').get().value);
        const next = change(before);
        if (next?.then) throw new Error('STATE_MUTATION_MUST_BE_SYNCHRONOUS');
        const json = JSON.stringify(next);
        if (Buffer.byteLength(json) > 32 * 1024 * 1024) throw new Error('METADATA_LIMIT');
        db.prepare('UPDATE state SET value=? WHERE id=1').run(json);
        db.exec('COMMIT');
        return structuredClone(next);
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    inspectBlob,
    async *readBlob(digest) {
      const path = blobPath(digest); await guardDirectories(); await regular(path);
      yield* createReadStream(path);
    },
    async createBlob(digest) {
      const target = blobPath(digest);
      await guardDirectories();
      const temp = join(temporary, `${process.pid}-${randomUUID()}.partial`);
      const file = await open(temp, 'wx');
      const hash = createHash('sha256'); let bytes = 0, closed = false;
      return {
        async write(chunk) {
          if (closed || !(chunk instanceof Uint8Array)) throw new Error('INVALID_BLOB_WRITE');
          if (bytes + chunk.byteLength > 100_000_000) throw new Error('ASSET_BYTE_LIMIT');
          await file.writeFile(chunk); hash.update(chunk); bytes += chunk.byteLength;
        },
        async commit(expectedBytes) {
          if (closed) throw new Error('BLOB_WRITER_CLOSED');
          if (hash.digest('hex') !== digest || bytes !== expectedBytes) throw new Error('CORRUPT_FILE');
          await guardDirectories();
          await file.sync(); await file.close(); closed = true;
          const current = await inspectBlob(digest);
          if (current.state === 'present' && current.sha256 === digest && current.bytes === bytes) await unlink(temp);
          else await rename(temp, target);
        },
        async abort() {
          if (!closed) { await file.close(); closed = true; }
          await guardDirectories();
          try { await unlink(temp); } catch (error) { if (!missing(error)) throw error; }
        },
      };
    },
    async usage() {
      await guardDirectories();
      let bytes = 0;
      for (const [path, pattern] of [[objects, DIGEST], [temporary, PARTIAL]]) {
        await directory(path);
        for (const name of await readdir(path)) {
          if (!pattern.test(name)) throw new Error('UNRECOGNIZED_STORAGE_FILE');
          bytes += (await regular(join(path, name))).size;
        }
      }
      return bytes;
    },
    async removeBlob(digest) {
      const path = blobPath(digest);
      await guardDirectories();
      try { await regular(path); await unlink(path); } catch (error) { if (!missing(error)) throw error; }
    },
    close() { if (!closed) { db.close(); closed = true; } },
  };
}
