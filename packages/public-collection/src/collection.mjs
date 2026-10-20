import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { statSync } from 'node:fs';
import { TTL_MS, PublicationError, createCollectionPreview, digest, fail, json, nowValue, operationId, profileId, record, revision, sameDigest, token } from './model.mjs';

const stateOf = row => row ? ({ profileId: row.id, epoch: row.epoch, adminHash: row.admin_hash, readHash: row.read_hash,
  revision: row.revision, expiresAtMs: row.expires_ms, status: row.status, payloadHash: row.payload_hash }) : null;

export function createPublicCollection({ databasePath, authority, now = Date.now, publicBaseUrl, catalog }) {
  const previewSelection = createCollectionPreview(catalog);
  const path = resolve(databasePath);
  if (authority?.databasePath === path) fail('AUTHORITY_MUST_BE_SEPARATE', 503);
  if (authority?.databasePath) {
    try {
      const profileFile = statSync(path, { bigint: true });
      const authorityFile = statSync(authority.databasePath, { bigint: true });
      if (profileFile.dev === authorityFile.dev && profileFile.ino === authorityFile.ino) fail('AUTHORITY_MUST_BE_SEPARATE', 503);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const base = new URL(publicBaseUrl);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || base.pathname !== '/') fail('INVALID_PUBLIC_ORIGIN');
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS public_profiles (
      id TEXT PRIMARY KEY, epoch TEXT NOT NULL, admin_hash TEXT NOT NULL, read_hash TEXT NOT NULL UNIQUE,
      revision INTEGER NOT NULL, expires_ms INTEGER NOT NULL, status TEXT NOT NULL CHECK(status IN('active','revoked')),
      payload_json TEXT, payload_hash TEXT NOT NULL
    );
  `);
  const requireEpoch = () => {
    try { return authority?.epoch() ?? fail('AUTHORITY_UNAVAILABLE', 503); }
    catch { fail('AUTHORITY_UNAVAILABLE', 503); }
  };
  const clock = () => authority?.observeTime(nowValue(now())) ?? fail('AUTHORITY_UNAVAILABLE', 503);
  const transaction = task => {
    db.exec('BEGIN IMMEDIATE');
    try { const result = task(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  const confirmedSnapshot = command => {
    const preview = previewSelection(command.snapshot);
    if (command.confirmed !== true || command.confirmedPreviewHash !== preview.hash) fail('EXPLICIT_PREVIEW_REQUIRED');
    return preview;
  };
  const receiptReply = (receipt, readToken) => readToken ? { ...receipt, readUrl: `${base.origin}/v1/public-profiles/${readToken}` } : receipt;
  const apply = (pending, suppliedPayload) => {
    const { expected, next } = pending;
    const row = db.prepare('SELECT * FROM public_profiles WHERE id=?').get(next.profileId);
    const actual = stateOf(row);
    if (json(actual) !== json(expected) && json(actual) !== json(next)) fail('AUTHORITY_DIVERGED', 503);
    const payload = next.status === 'revoked' ? null : suppliedPayload ?? row?.payload_json ?? null;
    if (next.status === 'active' && (payload === null || digest(payload) !== next.payloadHash)) fail('AUTHORITY_DIVERGED', 503);
    db.prepare(`INSERT INTO public_profiles(id,epoch,admin_hash,read_hash,revision,expires_ms,status,payload_json,payload_hash) VALUES(?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET epoch=excluded.epoch,admin_hash=excluded.admin_hash,read_hash=excluded.read_hash,revision=excluded.revision,
      expires_ms=excluded.expires_ms,status=excluded.status,payload_json=excluded.payload_json,payload_hash=excluded.payload_hash`)
      .run(next.profileId, next.epoch, next.adminHash, next.readHash, next.revision, next.expiresAtMs, next.status, payload, next.payloadHash);
  };
  const mutate = (command, fingerprint, task, readToken) => {
    const epoch = requireEpoch(); const currentTime = clock();
    const operationHash = digest(`${digest(token(command.adminCapability))}:${operationId(command.operationId)}`);
    const mutationHash = digest(json(fingerprint));
    let operation = authority.operation(operationHash, mutationHash, currentTime);
    if (operation?.status === 'committed') return receiptReply(operation.receipt, readToken);
    transaction(() => {
      if (!operation) {
        const proposed = task(epoch, currentTime);
        operation = authority.reserve({ operationHash, mutationHash, currentTime, ...proposed });
      }
      // The external reservation closes reads before the profile transaction.
      // A crash leaves a pending operation, not an old URL that can still read.
      apply(operation, command.snapshot ? json(previewSelection(command.snapshot).snapshot) : undefined);
    });
    authority.complete(operationHash, mutationHash, currentTime);
    return receiptReply(operation.receipt, readToken);
  };
  const owned = (command, epoch) => {
    profileId(command.profileId); revision(command.expectedRevision);
    const row = db.prepare('SELECT * FROM public_profiles WHERE id=?').get(command.profileId);
    if (!row || !sameDigest(row.admin_hash, digest(token(command.adminCapability)))) fail('NOT_AUTHORIZED', 403);
    if (row.epoch !== epoch || row.status !== 'active') fail('PUBLICATION_GONE', 410);
    if (!authority.isCurrent(stateOf(row))) fail('PUBLICATION_GONE', 410);
    if (row.revision !== command.expectedRevision) fail('REVISION_CONFLICT', 409);
    return row;
  };
  let closed = false;
  const methods = {
    preview: previewSelection,
    admitRequest() { requireEpoch(); authority.admitRequest(clock()); },
    publish(command) {
      record(command, ['operationId', 'readToken', 'adminCapability', 'snapshot', 'confirmedPreviewHash', 'confirmed', 'acknowledgedLossOfDevice']);
      operationId(command.operationId);
      token(command.readToken); token(command.adminCapability);
      if (command.readToken === command.adminCapability) fail('CAPABILITIES_MUST_DIFFER');
      const preview = confirmedSnapshot(command);
      if (command.acknowledgedLossOfDevice !== true) fail('EXPLICIT_PREVIEW_REQUIRED');
      const adminHash = digest(command.adminCapability); const readHash = digest(command.readToken);
      return mutate(command, { kind: 'publish', adminHash, readHash, payloadHash: preview.hash }, (epoch, currentTime) => {
        if (authority.hasActiveAdmin(adminHash)) fail('EXISTING_PUBLICATION', 409);
        if (authority.hasReadToken(readHash)) fail('READ_TOKEN_RETIRED', 409);
        const id = `p_${randomBytes(16).toString('hex')}`;
        return { expected: null,
          next: { profileId: id, epoch, adminHash, readHash, revision: 1, expiresAtMs: currentTime + TTL_MS, status: 'active', payloadHash: preview.hash },
          receipt: { profileId: id, revision: 1, expiresAt: new Date(currentTime + TTL_MS).toISOString() } };
      }, command.readToken);
    },
    update(command) {
      record(command, ['profileId', 'adminCapability', 'expectedRevision', 'operationId', 'snapshot', 'confirmedPreviewHash', 'confirmed']);
      const preview = confirmedSnapshot(command);
      return mutate(command, { kind: 'update', profileId: command.profileId, expectedRevision: command.expectedRevision, payloadHash: preview.hash }, (epoch, currentTime) => {
        const row = owned(command, epoch); const nextRevision = row.revision + 1;
        return { expected: stateOf(row), next: { ...stateOf(row), revision: nextRevision, expiresAtMs: currentTime + TTL_MS, payloadHash: preview.hash },
          receipt: { profileId: row.id, revision: nextRevision, expiresAt: new Date(currentTime + TTL_MS).toISOString() } };
      });
    },
    rotate(command) {
      record(command, ['profileId', 'adminCapability', 'expectedRevision', 'operationId', 'newReadToken']);
      token(command.newReadToken);
      if (command.newReadToken === command.adminCapability) fail('CAPABILITIES_MUST_DIFFER');
      const readHash = digest(command.newReadToken);
      return mutate(command, { kind: 'rotate', profileId: command.profileId, expectedRevision: command.expectedRevision, readHash }, (epoch, currentTime) => {
        const row = owned(command, epoch);
        if (currentTime >= row.expires_ms || row.payload_json === null) fail('PUBLICATION_GONE', 410);
        if (authority.hasReadToken(readHash)) fail('READ_TOKEN_RETIRED', 409);
        const nextRevision = row.revision + 1;
        return { expected: stateOf(row), next: { ...stateOf(row), readHash, revision: nextRevision },
          receipt: { profileId: row.id, revision: nextRevision, expiresAt: new Date(row.expires_ms).toISOString() } };
      }, command.newReadToken);
    },
    revoke(command) {
      record(command, ['profileId', 'adminCapability', 'expectedRevision', 'operationId']);
      return mutate(command, { kind: 'revoke', profileId: command.profileId, expectedRevision: command.expectedRevision }, epoch => {
        const row = owned(command, epoch); const nextRevision = row.revision + 1;
        return { expected: stateOf(row), next: { ...stateOf(row), status: 'revoked', revision: nextRevision },
          receipt: { profileId: row.id, revision: nextRevision, status: 'revoked', expiresAt: new Date(row.expires_ms).toISOString() } };
      });
    },
    read(readToken) {
      token(readToken); const epoch = requireEpoch(); const currentTime = clock();
      authority.admitRead(currentTime);
      const row = db.prepare('SELECT * FROM public_profiles WHERE read_hash=?').get(digest(readToken));
      if (row && (row.epoch !== epoch || row.status !== 'active' || currentTime >= row.expires_ms)) db.prepare('UPDATE public_profiles SET payload_json=NULL WHERE id=?').run(row.id);
      if (!row || row.epoch !== epoch || row.status !== 'active' || currentTime >= row.expires_ms || row.payload_json === null) fail('PUBLICATION_GONE', 410);
      if (!authority.isCurrent(stateOf(row))) {
        if (authority.shouldPurge(stateOf(row))) db.prepare('UPDATE public_profiles SET payload_json=NULL WHERE id=?').run(row.id);
        fail('PUBLICATION_GONE', 410);
      }
      try {
        const snapshot = previewSelection(JSON.parse(row.payload_json)).snapshot;
        if (digest(json(snapshot)) !== row.payload_hash) fail('PUBLICATION_GONE', 410);
        return snapshot;
      } catch { fail('PUBLICATION_GONE', 410); }
    },
    maintenance() {
      const currentTime = clock();
      return transaction(() => {
        let removed = 0;
        for (const row of db.prepare('SELECT * FROM public_profiles WHERE payload_json IS NOT NULL').all()) {
          if (row.expires_ms <= currentTime || row.status === 'revoked' || authority.shouldPurge(stateOf(row))) {
            removed += Number(db.prepare('UPDATE public_profiles SET payload_json=NULL WHERE id=?').run(row.id).changes);
          }
        }
        const receipts = authority.maintenance(currentTime);
        return { payloadsRemoved: removed, receiptsCleared: receipts.receiptsCleared };
      });
    },
    close() { if (!closed) { db.close(); closed = true; } },
  };
  return Object.freeze(Object.fromEntries(Object.entries(methods).map(([name, method]) => [name, name === 'close' ? method : (...args) => {
    if (closed) fail('STORAGE_UNAVAILABLE', 503);
    try { return method(...args); }
    catch (error) { if (error instanceof PublicationError) throw error; fail('STORAGE_UNAVAILABLE', 503); }
  }])));
}
