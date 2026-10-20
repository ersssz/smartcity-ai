import { createSession, getDiscovery, transition, validateSession } from './engine';
import { WALK_SCHEMA_SQL } from './migration';
import { EditorialWalkSchema, LocaleSchema, SessionSchema, TextSchema, type EditorialWalk, type Locale, type LocalizedText, type WalkAction, type WalkSession } from './model';

export interface WalkDatabase {
  execAsync(sql: string): Promise<void>;
  getFirstAsync<T>(sql: string, ...params: (string | number | null)[]): Promise<T | null>;
  getAllAsync<T>(sql: string, ...params: (string | number | null)[]): Promise<T[]>;
  runAsync(sql: string, ...params: (string | number | null)[]): Promise<unknown>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}
export type WalkStorageErrorCode = 'CORRUPT_PROGRESS' | 'WRITE_FAILED' | 'NOT_LOADED' | 'INVALID_LOCALE';
export class WalkStorageError extends Error {
  constructor(readonly code: WalkStorageErrorCode) {
    super(code);
    this.name = 'WalkStorageError';
  }
}
export type Snapshot = {
  walk: EditorialWalk;
  session: WalkSession;
  discoveries: { walkId: string; title: LocalizedText; proof: 'manual'; earnedAt: string }[];
};
type Current = Pick<Snapshot, 'walk' | 'session'>;
type CurrentRow = { bundle_json: string; session_json: string };

/** SQLite and a serialized command queue form the only durable progress seam. */
export function createWalkRepository(db: WalkDatabase, dependencies: { now: () => string; nextSessionId: () => string }) {
  let pending: Promise<void> = Promise.resolve();
  let initialized = false;
  let current: Current | undefined;
  const serialize = <T>(task: () => Promise<T>): Promise<T> => {
    const result = pending.then(task);
    pending = result.then(() => {}, () => {});
    return result;
  };
  const initialize = async () => {
    if (initialized) return;
    await db.execAsync(WALK_SCHEMA_SQL);
    initialized = true;
  };
  const parseCurrent = (row: CurrentRow): Current => {
    try {
      const walk = EditorialWalkSchema.parse(JSON.parse(row.bundle_json));
      return { walk, session: validateSession(walk, JSON.parse(row.session_json)) };
    } catch {
      throw new WalkStorageError('CORRUPT_PROGRESS');
    }
  };
  const writeCurrent = async (next: Current) => {
    await db.runAsync('INSERT INTO walk_current (id, bundle_json, session_json) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET bundle_json = excluded.bundle_json, session_json = excluded.session_json',
      JSON.stringify(next.walk), JSON.stringify(next.session));
  };
  const commit = async (task: () => Promise<void>) => {
    try { await db.withTransactionAsync(task); }
    catch (error) {
      if (error instanceof WalkStorageError) throw error;
      throw new WalkStorageError('WRITE_FAILED');
    }
  };
  const snapshot = async (next: Current): Promise<Snapshot> => {
    const rows = await db.getAllAsync<{ walk_id: string; title_json: string; proof: string; earned_at: string }>(
      'SELECT walk_id, title_json, proof, earned_at FROM walk_discoveries ORDER BY earned_at, walk_id');
    try {
      const discoveries = rows.map(row => {
        if (!row.walk_id || row.proof !== 'manual') throw new Error('Invalid discovery');
        return { walkId: row.walk_id, title: TextSchema.parse(JSON.parse(row.title_json)), proof: 'manual' as const,
          earnedAt: SessionSchema.shape.updatedAt.parse(row.earned_at) };
      });
      return JSON.parse(JSON.stringify({ ...next, discoveries })) as Snapshot;
    } catch { throw new WalkStorageError('CORRUPT_PROGRESS'); }
  };

  return {
    load(catalog: EditorialWalk): Promise<Snapshot> {
      return serialize(async () => {
        const validatedCatalog = EditorialWalkSchema.parse(catalog);
        await initialize();
        if (current) return snapshot(current);
        const row = await db.getFirstAsync<CurrentRow>('SELECT bundle_json, session_json FROM walk_current WHERE id = 1');
        let next = row ? parseCurrent(row) : {
          walk: validatedCatalog,
          session: createSession(validatedCatalog, dependencies.nextSessionId(), dependencies.now()),
        };
        if (next.session.phase === 'active') next = { ...next, session: transition(next.walk, next.session, { type: 'pause' }, dependencies.now()) };
        let result!: Snapshot;
        await commit(async () => { await writeCurrent(next); result = await snapshot(next); });
        current = next;
        return result;
      });
    },
    act(action: WalkAction): Promise<Snapshot> {
      return serialize(async () => {
        if (!current) throw new WalkStorageError('NOT_LOADED');
        const next = { walk: current.walk, session: transition(current.walk, current.session, action, dependencies.now()) };
        let result!: Snapshot;
        await commit(async () => {
          await writeCurrent(next);
          if (getDiscovery(next.walk, next.session).earned) {
            await db.runAsync('INSERT OR IGNORE INTO walk_discoveries (walk_id, title_json, proof, earned_at) VALUES (?, ?, ?, ?)',
              next.walk.id, JSON.stringify(next.walk.collectionTitle), 'manual', dependencies.now());
          }
          result = await snapshot(next);
        });
        current = next;
        return result;
      });
    },
    restart(catalog: EditorialWalk): Promise<Snapshot> {
      return serialize(async () => {
        const validatedCatalog = EditorialWalkSchema.parse(catalog);
        await initialize();
        const row = await db.getFirstAsync<CurrentRow>('SELECT bundle_json, session_json FROM walk_current WHERE id = 1');
        let archiveId: string | undefined;
        if (row) {
          try { archiveId = parseCurrent(row).session.sessionId; }
          catch { archiveId = dependencies.nextSessionId(); }
        }
        const next = { walk: validatedCatalog, session: createSession(validatedCatalog, dependencies.nextSessionId(), dependencies.now()) };
        let result!: Snapshot;
        await commit(async () => {
          if (row && archiveId) {
            await db.runAsync('INSERT INTO walk_history (session_id, bundle_json, session_json, saved_at) VALUES (?, ?, ?, ?)',
              archiveId, row.bundle_json, row.session_json, dependencies.now());
          }
          await writeCurrent(next);
          result = await snapshot(next);
        });
        current = next;
        return result;
      });
    },
    setLocale(locale: Locale): Promise<void> {
      return serialize(async () => {
        const validated = LocaleSchema.safeParse(locale);
        if (!validated.success) throw new WalkStorageError('INVALID_LOCALE');
        await initialize();
        await commit(async () => {
          await db.runAsync("INSERT INTO walk_settings (key, value) VALUES ('locale', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", validated.data);
        });
      });
    },
    getLocale(): Promise<Locale> {
      return serialize(async () => {
        await initialize();
        const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM walk_settings WHERE key = 'locale'");
        if (!row) return 'ru';
        const parsed = LocaleSchema.safeParse(row.value);
        if (!parsed.success) throw new WalkStorageError('CORRUPT_PROGRESS');
        return parsed.data;
      });
    },
  };
}
