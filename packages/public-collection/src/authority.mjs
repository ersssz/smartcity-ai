import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { DAY_MS, PublicationError, fail, json, nowValue, record } from './model.mjs';

const DEFAULT_LIMITS = Object.freeze({
  mutationsPerDay: 200, readsPerMinute: 120, readsPerDay: 5000, requestsPerMinute: 240, requestsPerDay: 10000,
  maxProfiles: 500, maxReadTokens: 5000, maxOperations: 20000, maxActors: 500,
});

const limited = (code, seconds) => {
  const error = new PublicationError(code, 429);
  error.retryAfterSeconds = Math.max(1, Math.ceil(seconds));
  throw error;
};

/** This file is deliberately separate from the profile database/backup set. */
export function createSqlitePublicationAuthority({ databasePath, confirmedOutsideProfileBackups = false, limits = {} }) {
  record(limits, Object.keys(DEFAULT_LIMITS), []);
  const ceilings = { ...DEFAULT_LIMITS, ...limits };
  for (const key of Object.keys(ceilings)) if (!Number.isSafeInteger(ceilings[key]) || ceilings[key] < 1 || ceilings[key] > DEFAULT_LIMITS[key]) fail('INVALID_LIMIT_CONFIGURATION', 503);
  if (typeof databasePath !== 'string' || !databasePath || databasePath === ':memory:') fail('INVALID_AUTHORITY_CONFIGURATION', 503);
  const path = resolve(databasePath);
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS publication_authority (id INTEGER PRIMARY KEY CHECK(id=1), epoch TEXT NOT NULL, enabled INTEGER NOT NULL CHECK(enabled IN(0,1)), last_now_ms INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS authority_profiles (profile_id TEXT PRIMARY KEY, permit_json TEXT, pending_operation TEXT);
    CREATE TABLE IF NOT EXISTS authority_read_tokens (read_hash TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS authority_operations (
      operation_hash TEXT PRIMARY KEY, mutation_hash TEXT NOT NULL, epoch TEXT NOT NULL,
      expected_json TEXT, next_json TEXT NOT NULL, receipt_json TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN('pending','committed')), retain_until_ms INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS authority_actors (admin_hash TEXT PRIMARY KEY, day INTEGER NOT NULL, used INTEGER NOT NULL, last_ms INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS authority_budget (bucket TEXT PRIMARY KEY, period INTEGER NOT NULL, used INTEGER NOT NULL);
  `);
  const transaction = task => {
    db.exec('BEGIN IMMEDIATE');
    try { const result = task(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  const requireEpoch = () => {
    if (confirmedOutsideProfileBackups !== true) fail('AUTHORITY_UNAVAILABLE', 503);
    const state = db.prepare('SELECT epoch,enabled FROM publication_authority WHERE id=1').get();
    if (!state || state.enabled !== 1) fail('AUTHORITY_UNAVAILABLE', 503);
    return state.epoch;
  };
  const takeBudget = (bucket, maximum, periodMs, currentTime, code) => {
    const period = Math.floor(currentTime / periodMs);
    const row = db.prepare('SELECT period,used FROM authority_budget WHERE bucket=?').get(bucket);
    const used = row?.period === period ? row.used : 0;
    if (used >= maximum) limited(code, ((period + 1) * periodMs - currentTime) / 1000);
    db.prepare('INSERT INTO authority_budget(bucket,period,used) VALUES(?,?,?) ON CONFLICT(bucket) DO UPDATE SET period=excluded.period,used=excluded.used').run(bucket, period, used + 1);
  };
  const operation = (operationHash, mutationHash, currentTime) => {
    const epoch = requireEpoch();
    const row = db.prepare('SELECT * FROM authority_operations WHERE operation_hash=?').get(operationHash);
    if (!row) return null;
    if (row.epoch !== epoch || row.mutation_hash !== mutationHash) fail('OPERATION_CONFLICT', 409);
    if (currentTime >= row.retain_until_ms) fail('RESULT_NOT_RETAINED', 409);
    return { status: row.status, expected: row.expected_json === null ? null : JSON.parse(row.expected_json),
      next: JSON.parse(row.next_json), receipt: JSON.parse(row.receipt_json) };
  };
  const current = state => {
    const epoch = requireEpoch();
    const row = db.prepare('SELECT * FROM authority_profiles WHERE profile_id=?').get(state.profileId);
    return state.epoch === epoch && !!row && row.pending_operation === null && row.permit_json === json(state);
  };
  const hasActiveAdmin = adminHash => {
    const epoch = requireEpoch();
    return db.prepare('SELECT permit_json,pending_operation FROM authority_profiles').all().some(row => {
      if (row.permit_json) {
        const state = JSON.parse(row.permit_json);
        if (state.epoch === epoch && state.adminHash === adminHash && state.status === 'active') return true;
      }
      if (row.pending_operation) {
        const pending = db.prepare('SELECT next_json FROM authority_operations WHERE operation_hash=?').get(row.pending_operation);
        const state = pending && JSON.parse(pending.next_json);
        return state?.epoch === epoch && state.adminHash === adminHash && state.status === 'active';
      }
      return false;
    });
  };
  let closed = false;
  return {
    databasePath: path,
    epoch: requireEpoch,
    admitRead(currentTime) {
      nowValue(currentTime); requireEpoch();
      transaction(() => {
        takeBudget('reads-minute', ceilings.readsPerMinute, 60_000, currentTime, 'PUBLIC_READ_RATE_LIMITED');
        takeBudget('reads-day', ceilings.readsPerDay, DAY_MS, currentTime, 'PUBLIC_READ_BUDGET_EXHAUSTED');
      });
    },
    admitRequest(currentTime) {
      nowValue(currentTime); requireEpoch();
      transaction(() => {
        takeBudget('requests-minute', ceilings.requestsPerMinute, 60_000, currentTime, 'PUBLIC_REQUEST_RATE_LIMITED');
        takeBudget('requests-day', ceilings.requestsPerDay, DAY_MS, currentTime, 'PUBLIC_REQUEST_BUDGET_EXHAUSTED');
      });
    },
    observeTime(value) {
      nowValue(value);
      if (confirmedOutsideProfileBackups !== true) fail('AUTHORITY_UNAVAILABLE', 503);
      return transaction(() => {
        const state = db.prepare('SELECT last_now_ms FROM publication_authority WHERE id=1').get();
        if (!state) fail('AUTHORITY_UNAVAILABLE', 503);
        const effective = Math.max(state.last_now_ms, value);
        db.prepare('UPDATE publication_authority SET last_now_ms=? WHERE id=1').run(effective);
        return effective;
      });
    },
    isCurrent: current,
    shouldPurge(state) {
      if (confirmedOutsideProfileBackups !== true) fail('AUTHORITY_UNAVAILABLE', 503);
      const meta = db.prepare('SELECT epoch,enabled FROM publication_authority WHERE id=1').get();
      if (!meta) fail('AUTHORITY_UNAVAILABLE', 503);
      if (meta.enabled !== 1) return true;
      const epoch = meta.epoch;
      if (state.epoch !== epoch) return true;
      const row = db.prepare('SELECT * FROM authority_profiles WHERE profile_id=?').get(state.profileId);
      if (!row) return true;
      if (row.pending_operation) {
        const pending = db.prepare('SELECT next_json FROM authority_operations WHERE operation_hash=?').get(row.pending_operation);
        if (!pending) fail('AUTHORITY_DIVERGED', 503);
        const next = JSON.parse(pending.next_json);
        // Keep a matching payload during pending rotate/commit recovery.
        return next.epoch !== epoch || next.status === 'revoked' || next.payloadHash !== state.payloadHash;
      }
      return row.permit_json !== json(state) || JSON.parse(row.permit_json).status === 'revoked';
    },
    hasActiveAdmin,
    hasReadToken(readHash) { requireEpoch(); return !!db.prepare('SELECT 1 FROM authority_read_tokens WHERE read_hash=?').get(readHash); },
    operation,
    reserve({ operationHash, mutationHash, expected, next, receipt, currentTime }) {
      const result = transaction(() => {
        const prior = operation(operationHash, mutationHash, currentTime);
        if (prior) return prior;
        const epoch = requireEpoch();
        if (next.epoch !== epoch || (expected && !current(expected))) fail('PUBLICATION_GONE', 410);
        if (!expected && db.prepare('SELECT 1 FROM authority_profiles WHERE profile_id=?').get(next.profileId)) fail('AUTHORITY_DIVERGED', 503);
        if (!expected && hasActiveAdmin(next.adminHash)) fail('EXISTING_PUBLICATION', 409);
        const changedRead = !expected || expected.readHash !== next.readHash;
        if (changedRead && db.prepare('SELECT 1 FROM authority_read_tokens WHERE read_hash=?').get(next.readHash)) fail('READ_TOKEN_RETIRED', 409);
        const day = Math.floor(currentTime / DAY_MS);
        const actor = db.prepare('SELECT * FROM authority_actors WHERE admin_hash=?').get(next.adminHash);
        const count = table => Number(db.prepare(`SELECT count(*) AS count FROM ${table}`).get().count);
        const full = (!expected && count('authority_profiles') >= ceilings.maxProfiles)
          || (changedRead && count('authority_read_tokens') >= ceilings.maxReadTokens)
          || (count('authority_operations') >= ceilings.maxOperations)
          || (!actor && count('authority_actors') >= ceilings.maxActors);
        if (full) {
          // Commit closure before returning the capacity error. Public payloads
          // remain inaccessible, even when no more operation rows can be stored.
          db.prepare('UPDATE publication_authority SET enabled=0 WHERE id=1').run();
          return { capacityExhausted: true };
        }
        const used = actor?.day === day ? actor.used : 0;
        // The tenth accepted operation is reserved for revocation.
        if (used >= (next.status === 'revoked' ? 10 : 9)) limited('INSTALLATION_BUDGET_EXHAUSTED', ((day + 1) * DAY_MS - currentTime) / 1000);
        if (actor && currentTime < actor.last_ms + 1000) limited('MUTATION_RATE_LIMITED', (actor.last_ms + 1000 - currentTime) / 1000);
        takeBudget('mutations-day', ceilings.mutationsPerDay, DAY_MS, currentTime, 'GLOBAL_MUTATION_BUDGET_EXHAUSTED');
        db.prepare('INSERT INTO authority_actors(admin_hash,day,used,last_ms) VALUES(?,?,?,?) ON CONFLICT(admin_hash) DO UPDATE SET day=excluded.day,used=excluded.used,last_ms=excluded.last_ms')
          .run(next.adminHash, day, used + 1, currentTime);
        if (changedRead) db.prepare('INSERT INTO authority_read_tokens(read_hash) VALUES(?)').run(next.readHash);
        db.prepare('INSERT INTO authority_operations(operation_hash,mutation_hash,epoch,expected_json,next_json,receipt_json,status,retain_until_ms) VALUES(?,?,?,?,?,?,\'pending\',?)')
          .run(operationHash, mutationHash, epoch, expected ? json(expected) : null, json(next), json(receipt), currentTime + DAY_MS);
        db.prepare('INSERT INTO authority_profiles(profile_id,permit_json,pending_operation) VALUES(?,?,?) ON CONFLICT(profile_id) DO UPDATE SET pending_operation=excluded.pending_operation')
          .run(next.profileId, expected ? json(expected) : null, operationHash);
        return { status: 'pending', expected, next, receipt };
      });
      if (result.capacityExhausted) fail('PUBLIC_CAPACITY_EXHAUSTED', 503);
      return result;
    },
    complete(operationHash, mutationHash, currentTime) {
      return transaction(() => {
        const pending = operation(operationHash, mutationHash, currentTime);
        if (!pending || pending.status === 'committed') return;
        const row = db.prepare('SELECT pending_operation FROM authority_profiles WHERE profile_id=?').get(pending.next.profileId);
        if (row?.pending_operation !== operationHash) fail('AUTHORITY_DIVERGED', 503);
        db.prepare('UPDATE authority_profiles SET permit_json=?,pending_operation=NULL WHERE profile_id=?').run(json(pending.next), pending.next.profileId);
        db.prepare("UPDATE authority_operations SET status='committed' WHERE operation_hash=?").run(operationHash);
      });
    },
    maintenance(currentTime) {
      nowValue(currentTime);
      const result = db.prepare("UPDATE authority_operations SET receipt_json='{}' WHERE retain_until_ms<=? AND receipt_json<>'{}'").run(currentTime);
      return { receiptsCleared: Number(result.changes) };
    },
    openNewEpoch() {
      if (confirmedOutsideProfileBackups !== true) fail('AUTHORITY_UNAVAILABLE', 503);
      const epoch = randomBytes(32).toString('hex');
      db.prepare('INSERT INTO publication_authority(id,epoch,enabled) VALUES(1,?,1) ON CONFLICT(id) DO UPDATE SET epoch=excluded.epoch,enabled=1').run(epoch);
      return epoch;
    },
    suspend() { db.prepare('UPDATE publication_authority SET enabled=0 WHERE id=1').run(); },
    close() { if (!closed) { db.close(); closed = true; } },
  };
}
