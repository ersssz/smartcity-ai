type CityDatabase = {
  execAsync(sql: string): Promise<void>;
  getFirstAsync<T>(sql: string, ...params: (string | number | null)[]): Promise<T | null>;
  runAsync(sql: string, ...params: (string | number | null)[]): Promise<unknown>;
};

/** A separate, non-sensitive preference store. Never touches a walk or GPS state. */
export function createCityPreferences(db: CityDatabase) {
  let initialized: Promise<void> | undefined;
  const initialize = () => initialized ??= db.execAsync('CREATE TABLE IF NOT EXISTS city_intro (id INTEGER PRIMARY KEY CHECK(id = 1), version INTEGER NOT NULL CHECK(version >= 1))')
    .catch(error => { initialized = undefined; throw error; });
  return {
    async hasSeen(): Promise<boolean> {
      await initialize();
      const row = await db.getFirstAsync<{ version: number }>('SELECT version FROM city_intro WHERE id = 1');
      if (!row) return false;
      if (!Number.isSafeInteger(row.version) || row.version < 1) throw new Error('Invalid city preference');
      return true;
    },
    async finish(): Promise<void> {
      await initialize();
      await db.runAsync('INSERT INTO city_intro (id, version) VALUES (1, 1) ON CONFLICT(id) DO UPDATE SET version = MAX(version, excluded.version)');
    },
  };
}
