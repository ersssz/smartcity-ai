import * as SQLite from 'expo-sqlite';
import { createCityPreferences } from './preferences';

let opening: Promise<ReturnType<typeof createCityPreferences>> | undefined;
export function getCityPreferences() {
  return opening ??= SQLite.openDatabaseAsync('astanaai-city-guide.db').then(createCityPreferences)
    .catch(error => { opening = undefined; throw error; });
}
