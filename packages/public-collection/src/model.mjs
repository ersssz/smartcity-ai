import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const DAY_MS = 86_400_000;
export const TTL_MS = 30 * DAY_MS;
export const MAX_PAYLOAD_BYTES = 32 * 1024;

export class PublicationError extends Error {
  constructor(code, status = 400) { super(code); this.name = 'PublicationError'; this.code = code; this.status = status; }
}
export const fail = (code, status) => { throw new PublicationError(code, status); };
export const digest = text => createHash('sha256').update(text).digest('hex');
export const json = value => JSON.stringify(value);
export const sameDigest = (left, right) => typeof left === 'string' && typeof right === 'string' && /^[a-f0-9]{64}$/.test(left) && /^[a-f0-9]{64}$/.test(right)
  && timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));

export function record(value, keys, required = keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('INVALID_INPUT');
  const found = Object.keys(value);
  if (found.some(key => !keys.includes(key)) || required.some(key => !Object.hasOwn(value, key))) fail('INVALID_INPUT');
  return value;
}
function text(value, maximum, pattern) {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > maximum
      || /[\u0000-\u001F\u007F]/u.test(value) || (pattern && !pattern.test(value))) fail('INVALID_INPUT');
  return value.normalize('NFC');
}
export function token(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)
      || Buffer.from(value, 'base64url').length !== 32 || Buffer.from(value, 'base64url').toString('base64url') !== value) fail('INVALID_CAPABILITY');
  return value;
}
export function operationId(value) { return text(value, 100, /^[A-Za-z0-9_-]{16,100}$/); }
export function profileId(value) { return text(value, 34, /^p_[a-f0-9]{32}$/); }
export function revision(value) { if (!Number.isSafeInteger(value) || value < 1) fail('INVALID_INPUT'); return value; }
export function nowValue(value) { if (!Number.isSafeInteger(value) || value < 0 || value > 8_640_000_000_000_000 - TTL_MS) fail('CLOCK_UNAVAILABLE', 503); return value; }

export function validateSnapshot(value) {
  record(value, ['locale', 'pseudonym', 'discoveries', 'badges', 'quests']);
  if (!['ru', 'kk', 'en'].includes(value.locale)) fail('INVALID_INPUT');
  const list = (items, proofRequired) => {
    if (!Array.isArray(items) || items.length > 128) fail('INVALID_INPUT');
    const ids = new Set();
    return items.map(item => {
      record(item, proofRequired ? ['id', 'title', 'proof'] : ['id', 'title']);
      const id = text(item.id, 100, /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/);
      if (ids.has(id)) fail('INVALID_INPUT');
      ids.add(id);
      const result = { id, title: text(item.title, 160) };
      if (proofRequired) {
        if (!['gps_nearby', 'manual_reported', 'quest_completed'].includes(item.proof)) fail('INVALID_INPUT');
        result.proof = item.proof;
      }
      return result;
    });
  };
  const snapshot = {
    locale: value.locale, pseudonym: text(value.pseudonym, 48),
    discoveries: list(value.discoveries, true), badges: list(value.badges, true), quests: list(value.quests, false),
  };
  if (Buffer.byteLength(json(snapshot), 'utf8') > MAX_PAYLOAD_BYTES) fail('PAYLOAD_TOO_LARGE', 413);
  return snapshot;
}

const WARNINGS = {
  ru: ['Ссылка доступна каждому, кому её передали. Выбранные места раскрывают круг ваших открытий.', 'При потере телефона или секрета управление не восстанавливается. Публикация истечёт через 30 дней без явного продления.'],
  kk: ['Сілтеме берілген кез келген адамға қолжетімді. Таңдалған орындар ашқан жерлеріңізді көрсетеді.', 'Телефон немесе құпия кілт жоғалса, басқару қалпына келмейді. Жарияланым ұзартылмаса, 30 күннен кейін аяқталады.'],
  en: ['Anyone with the link can read this collection. Selected places reveal the scope of your discoveries.', 'Control cannot be recovered after losing the phone or secret. Publication expires after 30 days without an explicit renewal.'],
};

/** A trusted deployment catalog is copied once; request data can never extend it. */
export function createCollectionPreview(catalog) {
  let groups;
  try {
    record(catalog, ['discoveries', 'badges', 'quests']);
    groups = Object.fromEntries(['discoveries', 'badges', 'quests'].map(group => {
      const items = catalog[group];
      if (!Array.isArray(items) || items.length > 4096) fail('INVALID_INPUT');
      const entries = new Map();
      for (const item of items) {
        record(item, group === 'quests' ? ['id', 'titles'] : ['id', 'titles', 'allowedProofs']);
        const id = text(item.id, 100, /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/);
        if (entries.has(id)) fail('INVALID_INPUT');
        record(item.titles, ['ru', 'kk', 'en']);
        const titles = Object.freeze(Object.fromEntries(['ru', 'kk', 'en'].map(locale => [locale, text(item.titles[locale], 160)])));
        let proofs;
        if (group !== 'quests') {
          if (!Array.isArray(item.allowedProofs) || !item.allowedProofs.length || item.allowedProofs.length > 3
              || new Set(item.allowedProofs).size !== item.allowedProofs.length
              || item.allowedProofs.some(proof => !['gps_nearby', 'manual_reported', 'quest_completed'].includes(proof))) fail('INVALID_INPUT');
          proofs = Object.freeze([...item.allowedProofs]);
        }
        entries.set(id, Object.freeze({ titles, proofs }));
      }
      return [group, entries];
    }));
  } catch { fail('CATALOG_UNAVAILABLE', 503); }
  return input => {
    const snapshot = validateSnapshot(input);
    for (const group of ['discoveries', 'badges', 'quests']) {
      for (const item of snapshot[group]) {
        const trusted = groups[group].get(item.id);
        if (!trusted || item.title !== trusted.titles[snapshot.locale]
            || (group !== 'quests' && !trusted.proofs.includes(item.proof))) fail('PUBLIC_SELECTION_NOT_ALLOWED');
      }
    }
    return { snapshot, hash: digest(json(snapshot)), warnings: [...WARNINGS[snapshot.locale]] };
  };
}
export function previewCollection(input, catalog) {
  return createCollectionPreview(catalog)(input);
}
export function createPublicationCapabilities() {
  return { readToken: randomBytes(32).toString('base64url'), adminCapability: randomBytes(32).toString('base64url') };
}
