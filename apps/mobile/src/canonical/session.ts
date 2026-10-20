import { canonicalJson, IdSchema, InstantSchema, Sha256Schema, readBundle, type Sha256, type WalkBundleV1 } from '@astanaai/contracts';
import type { WalkDatabase } from '../walk/repository';
import { CANONICAL_SCHEMA_SQL, CommandSchema, DiscoverySchema, ProgressSchema, type CanonicalSessionState, type ManualDiscovery } from './schema';

export type { CanonicalSessionState } from './schema';
export type Snapshot = { bundle: WalkBundleV1; session: CanonicalSessionState; discoveries: ManualDiscovery[] };
export type CanonicalSessionCommand = { eventId: string; expectedVersion: number; action:
  | { type: 'start' | 'pause' | 'resume' | 'confirm_end' | 'abandon' }
  | { type: 'mark_stop' | 'continue' | 'skip'; stopId: string }
  | { type: 'answer'; stopId: string; choiceId: string }
};
export type CanonicalSessionErrorCode = 'INVALID_BUNDLE' | 'CORRUPT_PROGRESS' | 'INVALID_COMMAND' | 'INVALID_STATE' | 'NOT_CURRENT_STOP' | 'VISIT_REQUIRED' | 'QUEST_REQUIRED' | 'UNKNOWN_CHOICE' | 'NO_SESSION' | 'SESSION_CONFLICT' | 'STALE_VERSION' | 'EVENT_CONFLICT' | 'WRITE_FAILED';
export class CanonicalSessionError extends Error {
  constructor(readonly code: CanonicalSessionErrorCode) { super(code); this.name = 'CanonicalSessionError'; }
}

// Identity only is retained by an instance; every projection is re-read in its transaction.
const databaseQueues = new WeakMap<WalkDatabase, Promise<void>>();
type SessionRow = { session_id: string; bundle_hash: string; bundle_revision: number; phase: string; version: number; session_json: string; bundle_json: string };
type ReceiptRow = { command_hash: string; version: number; result_bundle_hash: string; result_session_json: string; result_discoveries_json: string };
const terminal = (phase: CanonicalSessionState['phase']) => phase === 'completed' || phase === 'abandoned';

export function createCanonicalWalkSession(db: WalkDatabase, dependencies: { hash: Sha256; now: () => string; nextSessionId: () => string }) {
  let initialized = false, selectedId: string | undefined;
  const error = (code: CanonicalSessionErrorCode): never => { throw new CanonicalSessionError(code); };
  const serialize = <T>(task: () => Promise<T>): Promise<T> => {
    const result = (databaseQueues.get(db) ?? Promise.resolve()).then(task).catch(cause => {
      if (cause instanceof CanonicalSessionError) throw cause;
      throw new CanonicalSessionError('WRITE_FAILED');
    });
    databaseQueues.set(db, result.then(() => {}, () => {}));
    return result;
  };
  const initialize = async () => { if (!initialized) { await db.execAsync(CANONICAL_SCHEMA_SQL); initialized = true; } };
  const clock = () => { const value = dependencies.now(); return InstantSchema.safeParse(value).success ? value : error('INVALID_COMMAND'); };
  const bundleFrom = async (value: unknown, code: 'INVALID_BUNDLE' | 'CORRUPT_PROGRESS') => {
    const result = await readBundle(JSON.stringify(value), dependencies.hash);
    return result.ok ? result.bundle : error(code);
  };
  const validateProgress = (bundle: WalkBundleV1, input: unknown): CanonicalSessionState => {
    const parsed = ProgressSchema.safeParse(input);
    if (!parsed.success) return error('CORRUPT_PROGRESS');
    const state = parsed.data, count = bundle.stops.length;
    const manual = new Set(state.manualStopIds), completed = new Set(state.completedStopIds), skipped = new Set(state.skippedStopIds);
    if (state.bundleHash !== bundle.sha256 || state.bundleRevision !== bundle.revision || state.currentStopIndex > count
      || manual.size !== state.manualStopIds.length || completed.size !== state.completedStopIds.length || skipped.size !== state.skippedStopIds.length
      || (state.phase === 'completed' && state.currentStopIndex !== count)
      || (['active', 'paused', 'completed'].includes(state.phase) && state.startedAt === null)) return error('CORRUPT_PROGRESS');
    if (state.phase === 'prepared' && (state.currentStopIndex !== 0 || state.startedAt !== null || state.version !== 0 || manual.size || completed.size || skipped.size || Object.keys(state.answers).length)) return error('CORRUPT_PROGRESS');
    const indices = new Map(bundle.stops.map((stop, index) => [stop.id, index]));
    for (const id of [...manual, ...completed, ...skipped, ...Object.keys(state.answers)]) {
      const index = indices.get(id);
      if (index === undefined || index > state.currentStopIndex) return error('CORRUPT_PROGRESS');
    }
    for (const id of completed) if (!manual.has(id) || skipped.has(id) || state.answers[id]?.correct !== true) return error('CORRUPT_PROGRESS');
    for (const id of skipped) if (indices.get(id)! >= state.currentStopIndex) return error('CORRUPT_PROGRESS');
    for (const [id, answer] of Object.entries(state.answers)) {
      const stop = bundle.stops[indices.get(id)!]!, quest = bundle.content.quests.find(q => q.id === stop.questId);
      if (!manual.has(id) || !quest?.choices.some(choice => choice.id === answer.choiceId)
        || answer.correct !== (answer.choiceId === quest.correctChoiceId) || answer.correct !== completed.has(id)) return error('CORRUPT_PROGRESS');
    }
    for (let index = 0; index < state.currentStopIndex; index++) if (!completed.has(bundle.stops[index]!.id) && !skipped.has(bundle.stops[index]!.id)) return error('CORRUPT_PROGRESS');
    return state;
  };
  const currentId = async () => (await db.getFirstAsync<{ session_id: string }>('SELECT session_id FROM canonical_selection WHERE id = 1'))?.session_id ?? null;
  const readSession = async (id: string): Promise<Pick<Snapshot, 'bundle' | 'session'>> => {
    const row = await db.getFirstAsync<SessionRow>('SELECT s.*, b.bundle_json FROM canonical_sessions s LEFT JOIN canonical_bundles b ON b.bundle_hash = s.bundle_hash WHERE s.session_id = ?', id);
    if (!row) return error('NO_SESSION');
    try {
      const bundle = await bundleFrom(JSON.parse(row.bundle_json), 'CORRUPT_PROGRESS');
      const session = validateProgress(bundle, JSON.parse(row.session_json));
      if (session.sessionId !== row.session_id || session.bundleHash !== row.bundle_hash || session.bundleHash !== bundle.sha256 || session.bundleRevision !== bundle.revision
        || session.bundleRevision !== row.bundle_revision || session.phase !== row.phase || session.version !== row.version || session.currentStopIndex > bundle.stops.length) return error('CORRUPT_PROGRESS');
      return { bundle, session };
    } catch { return error('CORRUPT_PROGRESS'); }
  };
  const discoveries = async (): Promise<ManualDiscovery[]> => {
    const rows = await db.getAllAsync<{ walk_id: string; title_json: string; proof: string; earned_at: string }>('SELECT walk_id,title_json,proof,earned_at FROM canonical_discoveries ORDER BY earned_at,walk_id');
    try { return rows.map(row => DiscoverySchema.parse({ walkId: row.walk_id, title: JSON.parse(row.title_json), proof: row.proof, earnedAt: row.earned_at })); }
    catch { return error('CORRUPT_PROGRESS'); }
  };
  // These schemas contain JSON data only; do not require a structuredClone global on Hermes.
  const snapshotOf = async (value: Pick<Snapshot, 'bundle' | 'session'>): Promise<Snapshot> => JSON.parse(JSON.stringify({ ...value, discoveries: await discoveries() })) as Snapshot;
  const transaction = async <T>(task: () => Promise<T>): Promise<T> => {
    let value!: T;
    await db.withTransactionAsync(async () => { value = await task(); });
    return value;
  };
  const transition = (bundle: WalkBundleV1, input: CanonicalSessionState, action: CanonicalSessionCommand['action'], at: string): CanonicalSessionState => {
    const state = ProgressSchema.parse(JSON.parse(JSON.stringify(input)));
    state.version++; state.updatedAt = at;
    if (action.type === 'start' && state.phase === 'prepared') { state.phase = 'active'; state.startedAt = at; return state; }
    if (action.type === 'pause' && (state.phase === 'active' || state.phase === 'paused')) { state.phase = 'paused'; return state; }
    if (action.type === 'resume' && state.phase === 'paused') { state.phase = 'active'; return state; }
    if (action.type === 'abandon' && !terminal(state.phase)) { state.phase = 'abandoned'; return state; }
    if (action.type === 'confirm_end') {
      if (state.phase !== 'active' || state.currentStopIndex !== bundle.stops.length) return error('INVALID_STATE');
      state.phase = 'completed'; return state;
    }
    if (state.phase !== 'active' || !('stopId' in action)) return error('INVALID_STATE');
    const stop = bundle.stops[state.currentStopIndex];
    if (!stop || stop.id !== action.stopId) return error('NOT_CURRENT_STOP');
    if (action.type === 'mark_stop') {
      if (!state.manualStopIds.includes(stop.id)) state.manualStopIds.push(stop.id);
    } else if (action.type === 'answer') {
      if (!state.manualStopIds.includes(stop.id)) return error('VISIT_REQUIRED');
      const quest = bundle.content.quests.find(q => q.id === stop.questId)!;
      if (!quest.choices.some(choice => choice.id === action.choiceId)) return error('UNKNOWN_CHOICE');
      if (state.completedStopIds.includes(stop.id) && state.answers[stop.id]?.choiceId !== action.choiceId) return error('INVALID_STATE');
      const correct = action.choiceId === quest.correctChoiceId;
      state.answers[stop.id] = { choiceId: action.choiceId, correct };
      if (correct && !state.completedStopIds.includes(stop.id)) state.completedStopIds.push(stop.id);
    } else if (action.type === 'continue' || action.type === 'skip') {
      if (action.type === 'continue' && !state.completedStopIds.includes(stop.id)) return error('QUEST_REQUIRED');
      if (action.type === 'skip' && state.completedStopIds.includes(stop.id)) return error('INVALID_STATE');
      if (action.type === 'skip') state.skippedStopIds.push(stop.id);
      state.currentStopIndex++;
    } else return error('INVALID_STATE');
    return validateProgress(bundle, state);
  };
  const receipt = async (row: ReceiptRow): Promise<Snapshot> => {
    try {
      const stored = await db.getFirstAsync<{ bundle_json: string }>('SELECT bundle_json FROM canonical_bundles WHERE bundle_hash = ?', row.result_bundle_hash);
      if (!stored) return error('CORRUPT_PROGRESS');
      const bundle = await bundleFrom(JSON.parse(stored.bundle_json), 'CORRUPT_PROGRESS');
      const session = validateProgress(bundle, JSON.parse(row.result_session_json));
      if (session.version !== row.version || session.bundleHash !== row.result_bundle_hash) return error('CORRUPT_PROGRESS');
      return { bundle, session, discoveries: DiscoverySchema.array().parse(JSON.parse(row.result_discoveries_json)) };
    } catch { return error('CORRUPT_PROGRESS'); }
  };
  const persist = async (previous: Pick<Snapshot, 'bundle' | 'session'>, next: CanonicalSessionState, eventId: string, commandHash: string, action: CanonicalSessionCommand['action'] | { type: 'restore_pause' }): Promise<Snapshot> => {
    await db.runAsync('UPDATE canonical_sessions SET phase = ?,version = ?,session_json = ? WHERE session_id = ? AND version = ? AND bundle_hash = ?',
      next.phase, next.version, JSON.stringify(next), previous.session.sessionId, previous.session.version, previous.bundle.sha256);
    if ((await db.getFirstAsync<{ changes: number }>('SELECT changes() AS changes'))?.changes !== 1) return error('STALE_VERSION');
    const collection = previous.bundle.content.collections[0];
    if (next.phase === 'completed' && previous.bundle.stops.length > 0 && next.completedStopIds.length === previous.bundle.stops.length && collection) {
      await db.runAsync('INSERT OR IGNORE INTO canonical_discoveries (walk_id,title_json,proof,earned_at) VALUES (?,?,?,?)', previous.bundle.theme.id, JSON.stringify(collection.title), 'manual_reported', next.updatedAt);
    }
    const result = await snapshotOf({ bundle: previous.bundle, session: next });
    await db.runAsync('INSERT INTO canonical_events (session_id,event_id,version,command_hash,kind,stop_id,choice_id,proposal_id,proposal_hash,consent,occurred_at,result_bundle_hash,result_session_json,result_discoveries_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      next.sessionId, eventId, next.version, commandHash, action.type, 'stopId' in action ? action.stopId : null, 'choiceId' in action ? action.choiceId : null,
      null, null, null, next.updatedAt, previous.bundle.sha256, JSON.stringify(next), JSON.stringify(result.discoveries));
    return result;
  };

  return {
    getCurrentSessionId(): Promise<string | null> { return serialize(async () => { await initialize(); return currentId(); }); },
    open(bundleOrSessionId: WalkBundleV1 | string): Promise<Snapshot> {
      return serialize(async () => {
        await initialize();
        const result = await transaction(async () => {
          const previousId = await currentId(), previous = previousId ? await readSession(previousId) : undefined;
          let value: Pick<Snapshot, 'bundle' | 'session'>;
          if (typeof bundleOrSessionId === 'string') {
            if (!IdSchema.safeParse(bundleOrSessionId).success) return error('INVALID_COMMAND');
            value = await readSession(bundleOrSessionId);
          } else {
            const bundle = await bundleFrom(bundleOrSessionId, 'INVALID_BUNDLE');
            const existing = await db.getFirstAsync<{ session_id: string }>('SELECT session_id FROM canonical_sessions WHERE bundle_hash = ?', bundle.sha256);
            if (existing) value = await readSession(existing.session_id);
            else {
              if (previous && !terminal(previous.session.phase)) return error('SESSION_CONFLICT');
              const sessionId = dependencies.nextSessionId();
              if (!IdSchema.safeParse(sessionId).success) return error('INVALID_COMMAND');
              const session = ProgressSchema.parse({ schemaVersion: 2, sessionId, bundleHash: bundle.sha256, bundleRevision: bundle.revision,
                phase: 'prepared', version: 0, currentStopIndex: 0, manualStopIds: [], completedStopIds: [], skippedStopIds: [], answers: {}, startedAt: null, updatedAt: clock() });
              await db.runAsync('INSERT OR IGNORE INTO canonical_bundles (bundle_hash,bundle_json) VALUES (?,?)', bundle.sha256, JSON.stringify(bundle));
              await db.runAsync('INSERT INTO canonical_sessions (session_id,bundle_hash,bundle_revision,phase,version,session_json) VALUES (?,?,?,?,?,?)',
                session.sessionId, bundle.sha256, bundle.revision, session.phase, session.version, JSON.stringify(session));
              value = { bundle, session };
            }
          }
          if (previous && previous.session.sessionId !== value.session.sessionId && !terminal(previous.session.phase)) return error('SESSION_CONFLICT');
          await db.runAsync('INSERT INTO canonical_selection (id,session_id) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET session_id = excluded.session_id', value.session.sessionId);
          if (typeof bundleOrSessionId === 'string' && value.session.phase === 'active') {
            const eventId = `system.restore:${value.session.version + 1}`, action = { type: 'restore_pause' } as const;
            const commandHash = Sha256Schema.parse(await dependencies.hash(canonicalJson({ eventId, expectedVersion: value.session.version, action })));
            return persist(value, transition(value.bundle, value.session, { type: 'pause' }, clock()), eventId, commandHash, action);
          }
          return snapshotOf(value);
        });
        selectedId = result.session.sessionId;
        return result;
      });
    },
    dispatch(input: CanonicalSessionCommand): Promise<Snapshot> {
      return serialize(async () => {
        const parsed = CommandSchema.safeParse(input);
        if (!parsed.success) return error('INVALID_COMMAND');
        const command = parsed.data;
        await initialize();
        return transaction(async () => {
          const id = await currentId();
          if (!id || !selectedId) return error('NO_SESSION');
          if (id !== selectedId) return error('SESSION_CONFLICT');
          const value = await readSession(id);
          const commandHash = Sha256Schema.parse(await dependencies.hash(canonicalJson(command)));
          const existing = await db.getFirstAsync<ReceiptRow>('SELECT * FROM canonical_events WHERE session_id = ? AND event_id = ?', id, command.eventId);
          if (existing) return existing.command_hash === commandHash ? receipt(existing) : error('EVENT_CONFLICT');
          if (command.expectedVersion !== value.session.version) return error('STALE_VERSION');
          const next = transition(value.bundle, value.session, command.action, clock());
          return persist(value, next, command.eventId, commandHash, command.action);
        });
      });
    },
    snapshot(): Promise<Snapshot> {
      return serialize(async () => {
        await initialize();
        return transaction(async () => {
          const id = await currentId();
          if (!id) return error('NO_SESSION');
          if (selectedId && selectedId !== id) return error('SESSION_CONFLICT');
          return snapshotOf(await readSession(id));
        });
      });
    },
  };
}
