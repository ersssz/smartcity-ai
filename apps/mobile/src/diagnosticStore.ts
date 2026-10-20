import * as SQLite from 'expo-sqlite';

export type DiagnosticPhase = 'stopped' | 'active' | 'paused';
export type DiagnosticProgress = {
  phase: DiagnosticPhase;
  manualSteps: number;
  gpsSamples: number;
  lastAccuracy: number | null;
  lastFixAt: number | null;
  issue: string | null;
};

let database: Promise<SQLite.SQLiteDatabase> | undefined;

async function openDatabase() {
  const db = await SQLite.openDatabaseAsync('astanaai-t01.db');
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS diagnostic_progress (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      phase TEXT NOT NULL CHECK(phase IN ('stopped', 'active', 'paused')),
      manualSteps INTEGER NOT NULL DEFAULT 0,
      gpsSamples INTEGER NOT NULL DEFAULT 0,
      lastAccuracy REAL,
      lastFixAt REAL,
      issue TEXT
    );
    INSERT OR IGNORE INTO diagnostic_progress(id, phase) VALUES (1, 'stopped');
    PRAGMA user_version = 1;
  `);
  return db;
}

function getDatabase() {
  database ??= openDatabase().catch((error: unknown) => {
    database = undefined;
    throw error;
  });
  return database;
}

/** Diagnostic-only storage. No precise position or GPS track is written. */
export async function readProgress(): Promise<DiagnosticProgress> {
  const row = await (await getDatabase()).getFirstAsync<DiagnosticProgress>(
    'SELECT phase, manualSteps, gpsSamples, lastAccuracy, lastFixAt, issue FROM diagnostic_progress WHERE id = 1',
  );
  if (!row) throw new Error('SQLite: диагностическая запись отсутствует');
  return row;
}

export async function setPhase(phase: DiagnosticPhase, issue: string | null = null) {
  await (await getDatabase()).runAsync(
    'UPDATE diagnostic_progress SET phase = ?, issue = ? WHERE id = 1', phase, issue,
  );
}

export async function addManualStep() {
  await (await getDatabase()).runAsync(
    'UPDATE diagnostic_progress SET manualSteps = manualSteps + 1 WHERE id = 1',
  );
}

export async function recordGpsSample(accuracy: number | null, timestamp: number) {
  if (!Number.isFinite(timestamp) || timestamp > Date.now() + 60_000) return;
  await (await getDatabase()).runAsync(
    `UPDATE diagnostic_progress SET gpsSamples = gpsSamples + 1,
     lastAccuracy = ?, lastFixAt = ?
     WHERE id = 1 AND phase = 'active' AND (lastFixAt IS NULL OR lastFixAt < ?)`,
    accuracy !== null && Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : null,
    timestamp, timestamp,
  );
}

export async function recordIssue(issue: string) {
  await (await getDatabase()).runAsync(
    'UPDATE diagnostic_progress SET issue = ? WHERE id = 1', issue,
  );
}
