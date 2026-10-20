import * as SQLite from 'expo-sqlite';
import { createCanonicalWalkSession } from './session';
import { nativeHash } from './bundledAssets';

let opening: ReturnType<typeof open> | undefined;
let sequence = 0;
async function open() {
  const db = await SQLite.openDatabaseAsync('astanaai-walks.db');
  return createCanonicalWalkSession(db, { hash: nativeHash, now: () => new Date().toISOString(),
    nextSessionId: () => `canonical-${Date.now().toString(36)}-${++sequence}` });
}
export function getCanonicalSession() {
  opening ??= open().catch(error => { opening = undefined; throw error; });
  return opening;
}
