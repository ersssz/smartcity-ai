import * as SQLite from 'expo-sqlite';
import { createWalkRepository } from './repository';

let opening: ReturnType<typeof openRepository> | undefined;
let sequence = 0;
async function openRepository() {
  const database = await SQLite.openDatabaseAsync('astanaai-walks.db');
  return createWalkRepository(database, {
    now: () => new Date().toISOString(),
    // Local progress identity, not a credential or a public capability.
    nextSessionId: () => `walk-${Date.now().toString(36)}-${++sequence}`,
  });
}
export function getWalkRepository() {
  opening ??= openRepository().catch(error => { opening = undefined; throw error; });
  return opening;
}
