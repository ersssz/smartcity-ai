import { z } from 'zod';
import { IdSchema, InstantSchema, Sha256Schema, TextSchema } from '@astanaai/contracts';

/** Private additive schema; no legacy table, global schema version or native migration is changed. */
export const CANONICAL_SCHEMA_SQL = `
  PRAGMA busy_timeout = 2500;
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS canonical_bundles (
    bundle_hash TEXT PRIMARY KEY, bundle_json TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS canonical_sessions (
    session_id TEXT PRIMARY KEY, bundle_hash TEXT NOT NULL REFERENCES canonical_bundles(bundle_hash),
    bundle_revision INTEGER NOT NULL CHECK(bundle_revision > 0),
    phase TEXT NOT NULL CHECK(phase IN ('prepared','active','paused','completed','abandoned')),
    version INTEGER NOT NULL CHECK(version >= 0), session_json TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS canonical_one_active ON canonical_sessions(phase) WHERE phase = 'active';
  CREATE TABLE IF NOT EXISTS canonical_selection (
    id INTEGER PRIMARY KEY CHECK(id = 1), session_id TEXT NOT NULL UNIQUE REFERENCES canonical_sessions(session_id)
  );
  CREATE TABLE IF NOT EXISTS canonical_events (
    session_id TEXT NOT NULL REFERENCES canonical_sessions(session_id), event_id TEXT NOT NULL,
    version INTEGER NOT NULL, command_hash TEXT NOT NULL, kind TEXT NOT NULL,
    stop_id TEXT, choice_id TEXT, proposal_id TEXT, proposal_hash TEXT, consent INTEGER,
    occurred_at TEXT NOT NULL, result_bundle_hash TEXT NOT NULL REFERENCES canonical_bundles(bundle_hash),
    result_session_json TEXT NOT NULL, result_discoveries_json TEXT NOT NULL,
    PRIMARY KEY(session_id,event_id), UNIQUE(session_id,version)
  );
  CREATE TABLE IF NOT EXISTS canonical_discoveries (
    walk_id TEXT PRIMARY KEY, title_json TEXT NOT NULL,
    proof TEXT NOT NULL CHECK(proof = 'manual_reported'), earned_at TEXT NOT NULL
  );
`;

export const ProgressSchema = z.object({
  schemaVersion: z.literal(2), sessionId: IdSchema, bundleHash: Sha256Schema, bundleRevision: z.number().int().positive(),
  phase: z.enum(['prepared', 'active', 'paused', 'completed', 'abandoned']), version: z.number().int().nonnegative(),
  currentStopIndex: z.number().int().nonnegative(), manualStopIds: z.array(IdSchema), completedStopIds: z.array(IdSchema), skippedStopIds: z.array(IdSchema),
  readStopIds: z.array(IdSchema).default([]),
  answers: z.record(IdSchema, z.object({ choiceId: IdSchema, correct: z.boolean() }).strict()),
  startedAt: InstantSchema.nullable(), updatedAt: InstantSchema,
}).strict();
export const DiscoverySchema = z.object({ walkId: IdSchema, title: TextSchema, proof: z.literal('manual_reported'), earnedAt: InstantSchema }).strict();
export const CommandSchema = z.object({
  eventId: z.string().regex(/^[A-Za-z0-9:._-]{1,100}$/).refine(id => !id.startsWith('system.'), 'Reserved event namespace'), expectedVersion: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER - 1),
  action: z.discriminatedUnion('type', [
    z.object({ type: z.literal('start') }).strict(), z.object({ type: z.literal('pause') }).strict(), z.object({ type: z.literal('resume') }).strict(),
    z.object({ type: z.literal('mark_stop'), stopId: IdSchema }).strict(),
    z.object({ type: z.literal('read_story'), stopId: IdSchema }).strict(),
    z.object({ type: z.literal('answer'), stopId: IdSchema, choiceId: IdSchema }).strict(),
    z.object({ type: z.literal('continue'), stopId: IdSchema }).strict(), z.object({ type: z.literal('skip'), stopId: IdSchema }).strict(),
    z.object({ type: z.literal('confirm_end') }).strict(), z.object({ type: z.literal('abandon') }).strict(),
  ]),
}).strict();
export type CanonicalSessionState = z.infer<typeof ProgressSchema>;
export type ManualDiscovery = z.infer<typeof DiscoverySchema>;
