import { PublicationError, fail, operationId, record, token } from './model.mjs';

const MAX_REQUEST_BYTES = 40 * 1024;
const PREFIX = '/v1/public-profiles';
const HEADERS = {
  'Cache-Control': 'no-store', 'Pragma': 'no-cache', 'Expires': '0',
  'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};
const reply = (body, status = 200, type = 'application/json; charset=utf-8', head = false, extra = {}) => new Response(
  head ? null : type.startsWith('application/json') ? JSON.stringify(body) : body,
  { status, headers: { ...HEADERS, 'Content-Type': type, ...extra } },
);
const escape = text => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const COPY = {
  ru: { title: 'Открытия Астаны', discoveries: 'Выбранные открытия', badges: 'Достижения', quests: 'Завершённые истории', gps_nearby: 'Прибытие рядом подтверждено приложением', manual_reported: 'Ручная отметка', quest_completed: 'Задание завершено', empty: 'Ничего не выбрано' },
  kk: { title: 'Астана жаңалықтары', discoveries: 'Таңдалған жаңалықтар', badges: 'Жетістіктер', quests: 'Аяқталған хикаялар', gps_nearby: 'Жақын жерге келгені қолданбада расталды', manual_reported: 'Қолмен белгіленген', quest_completed: 'Тапсырма орындалды', empty: 'Ештеңе таңдалмаған' },
  en: { title: 'Astana discoveries', discoveries: 'Selected discoveries', badges: 'Achievements', quests: 'Completed stories', gps_nearby: 'Nearby arrival confirmed by the app', manual_reported: 'Manual mark', quest_completed: 'Quest completed', empty: 'Nothing selected' },
};

function render(snapshot) {
  const t = COPY[snapshot.locale];
  const group = (label, items) => `<section><h2>${escape(label)}</h2>${items.length ? `<ul>${items.map(item => `<li><strong>${escape(item.title)}</strong>${item.proof ? `<span>${escape(t[item.proof])}</span>` : ''}</li>`).join('')}</ul>` : `<p>${escape(t.empty)}</p>`}</section>`;
  return `<!doctype html><html lang="${snapshot.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escape(t.title)}</title><style>body{font:1rem/1.6 system-ui,sans-serif;color:#173f3b;background:#f8f6ef;max-width:44rem;margin:auto;padding:2rem}h1{font-size:2rem}section{margin-block:2rem}ul{padding:0;list-style:none}li{padding:1rem;margin-block:.6rem;border:1px solid #cbd5ca;border-radius:1rem}span{display:block;color:#52685d;font-size:.9rem}</style></head><body><main><p>AstanaAI</p><h1>${escape(snapshot.pseudonym)}</h1>${group(t.discoveries, snapshot.discoveries)}${group(t.badges, snapshot.badges)}${group(t.quests, snapshot.quests)}</main></body></html>`;
}

async function body(request) {
  if ((request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase() !== 'application/json') fail('JSON_REQUIRED', 415);
  const declared = request.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || !Number.isSafeInteger(Number(declared)))) fail('INVALID_INPUT');
  if (declared !== null && Number(declared) > MAX_REQUEST_BYTES) fail('PAYLOAD_TOO_LARGE', 413);
  if (!request.body) fail('INVALID_JSON');
  const reader = request.body.getReader(); const chunks = []; let bytes = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > MAX_REQUEST_BYTES) { void reader.cancel().catch(() => {}); fail('PAYLOAD_TOO_LARGE', 413); }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  const combined = new Uint8Array(bytes); let offset = 0;
  for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(combined)); }
  catch { fail('INVALID_JSON'); }
}
function credentials(request) {
  const match = /^Bearer ([A-Za-z0-9_-]+)$/.exec(request.headers.get('authorization') ?? '');
  if (!match) fail('NOT_AUTHORIZED', 403);
  try { token(match[1]); } catch { fail('NOT_AUTHORIZED', 403); }
  return { adminCapability: match[1], operationId: operationId(request.headers.get('idempotency-key')) };
}

/** No logger, analytics hook or provider/network call is part of this handler. */
export function createPublicCollectionHandler(collection) {
  return async request => {
    try {
      collection.admitRequest();
      const url = new URL(request.url);
      if (url.search || url.hash) fail('INVALID_INPUT');
      const path = url.pathname;
      if (path === `${PREFIX}/preview`) {
        if (request.method !== 'POST') return reply({ error: 'METHOD_NOT_ALLOWED' }, 405, undefined, request.method === 'HEAD', { Allow: 'POST' });
        return reply(collection.preview(await body(request)));
      }
      if (path === PREFIX) {
        if (request.method !== 'POST') return reply({ error: 'METHOD_NOT_ALLOWED' }, 405, undefined, request.method === 'HEAD', { Allow: 'POST' });
        const auth = credentials(request); const input = await body(request);
        record(input, ['readToken', 'snapshot', 'confirmedPreviewHash', 'confirmed', 'acknowledgedLossOfDevice']);
        return reply(collection.publish({ ...input, ...auth }), 201);
      }
      const route = /^\/v1\/public-profiles\/([A-Za-z0-9_-]+)(\/rotate)?$/.exec(path);
      if (!route) return reply({ error: 'NOT_FOUND' }, 404, undefined, request.method === 'HEAD');
      const key = route[1]; const rotate = !!route[2];
      if (!rotate && (request.method === 'GET' || request.method === 'HEAD')) {
        const snapshot = collection.read(key);
        const html = (request.headers.get('accept') ?? '').split(',').some(value => value.split(';')[0].trim() === 'text/html');
        return html ? reply(render(snapshot), 200, 'text/html; charset=utf-8', request.method === 'HEAD') : reply(snapshot, 200, undefined, request.method === 'HEAD');
      }
      if ((rotate && request.method !== 'POST') || (!rotate && !['PUT', 'DELETE'].includes(request.method))) {
        return reply({ error: 'METHOD_NOT_ALLOWED' }, 405, undefined, request.method === 'HEAD', { Allow: rotate ? 'POST' : 'GET, HEAD, PUT, DELETE' });
      }
      const auth = credentials(request); const input = await body(request);
      if (rotate) {
        record(input, ['expectedRevision', 'newReadToken']);
        return reply(collection.rotate({ ...input, ...auth, profileId: key }));
      }
      if (request.method === 'DELETE') {
        record(input, ['expectedRevision']);
        return reply(collection.revoke({ ...input, ...auth, profileId: key }));
      }
      record(input, ['expectedRevision', 'snapshot', 'confirmedPreviewHash', 'confirmed']);
      return reply(collection.update({ ...input, ...auth, profileId: key }));
    } catch (error) {
      return error instanceof PublicationError ? reply({ error: error.code }, error.status, undefined, request.method === 'HEAD', error.retryAfterSeconds ? { 'Retry-After': String(error.retryAfterSeconds) } : {}) : reply({ error: 'STORAGE_UNAVAILABLE' }, 503, undefined, request.method === 'HEAD');
    }
  };
}
