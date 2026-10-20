/** Root-owned version-one local schema. Only public bundle geometry and manual progress. */
export const WALK_SCHEMA_SQL = `
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS walk_current (
    id INTEGER PRIMARY KEY CHECK(id = 1), bundle_json TEXT NOT NULL, session_json TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS walk_history (
    session_id TEXT PRIMARY KEY, bundle_json TEXT NOT NULL, session_json TEXT NOT NULL, saved_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS walk_discoveries (
    walk_id TEXT PRIMARY KEY, title_json TEXT NOT NULL, proof TEXT NOT NULL CHECK(proof = 'manual'), earned_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS walk_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;
