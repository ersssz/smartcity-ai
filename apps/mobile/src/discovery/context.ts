import type { DiscoveryLocale } from './types';

export type WeatherChoiceId = 'auto' | 'sunshine' | 'rain' | 'cold' | 'windy';
export type ContextPlace = Readonly<{ id: string; category: 'history' | 'architecture' | 'river'; indoor?: boolean; hasIndoorOption?: boolean; hoursVerified?: boolean }>;
export type WeatherSample = Readonly<{ timeMs: number; temperatureC: number; apparentC: number; precipitationMm: number; windKmh: number; code: number; isDay: boolean }>;
export type WeatherRead = Readonly<{ status: 'unknown' | 'available' | 'stale' | 'unavailable'; sample?: WeatherSample; reason?: string }>;
export const WEATHER_MAX_AGE_MS = 90 * 60_000;
export const WEATHER_CACHE_MS = 30 * 60_000;
export const WEATHER_TIMEOUT_MS = 8_000;
export const ASTANA_WEATHER_URL = 'https://api.open-meteo.com/v1/forecast?latitude=51.1694&longitude=71.4491&current=temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,is_day&temperature_unit=celsius&wind_speed_unit=kmh&precipitation_unit=mm&timeformat=unixtime&timezone=UTC&forecast_days=1';
export const WEATHER_ATTRIBUTION = Object.freeze({ label: 'Weather data by Open-Meteo · CC BY 4.0', url: 'https://open-meteo.com/' });

const WMO = new Set([0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99]);
const record = (value: unknown): Record<string, unknown> | null => value != null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const between = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
export function weatherFresh(sample: WeatherSample, nowMs: number): boolean {
  return Number.isFinite(nowMs) && nowMs - sample.timeMs <= WEATHER_MAX_AGE_MS && sample.timeMs - nowMs <= 10 * 60_000;
}
export function parseCurrentWeather(value: unknown, nowMs: number): WeatherSample | null {
  const data = record(value); const current = record(data?.current); const units = record(data?.current_units);
  if (!data || !current || !units || data.utc_offset_seconds !== 0 || !['GMT', 'UTC', 'Etc/UTC'].includes(String(data.timezone)) ||
    !between(data.latitude, 50.6694, 51.6694) || !between(data.longitude, 70.9491, 71.9491)) return null;
  const expected: Record<string, string> = { time: 'unixtime', interval: 'seconds', temperature_2m: '°C', apparent_temperature: '°C', precipitation: 'mm', weather_code: 'wmo code', wind_speed_10m: 'km/h', is_day: '' };
  if (Object.entries(expected).some(([key, unit]) => units[key] !== unit) ||
    !between(current.time, 1, 8_640_000_000_000) || !Number.isInteger(current.time) ||
    !between(current.interval, 60, 3600) || !Number.isInteger(current.interval) ||
    !between(current.temperature_2m, -80, 60) || !between(current.apparent_temperature, -100, 70) ||
    !between(current.precipitation, 0, 300) || !between(current.wind_speed_10m, 0, 300) ||
    typeof current.weather_code !== 'number' || !WMO.has(current.weather_code) || ![0, 1].includes(current.is_day as number)) return null;
  const sample: WeatherSample = Object.freeze({ timeMs: current.time * 1000, temperatureC: current.temperature_2m,
    apparentC: current.apparent_temperature, precipitationMm: current.precipitation, windKmh: current.wind_speed_10m,
    code: current.weather_code, isDay: current.is_day === 1 });
  return weatherFresh(sample, nowMs) ? sample : null;
}

export type ContextLocale = DiscoveryLocale;
const text = (locale: DiscoveryLocale, ru: string, kk: string, en: string): string => ({ ru, kk, en })[locale];
const DAY_MS = 86_400_000;
const ASTANA_OFFSET_MS = 5 * 60 * 60_000;
export type HolidayContext = Readonly<{ id: string; title: string; date: string; daysUntil: number; theme: 'history' | 'capital'; calendarYear: 2026 }>;
const HOLIDAYS_2026: readonly [string, number, readonly number[], string, string, string][] = [
  ['new-year', 1, [1, 2], 'Новый год', 'Жаңа жыл', 'New Year'],
  ['orthodox-christmas', 1, [7], 'Православное Рождество', 'Православие Рождествосы', 'Orthodox Christmas'],
  ['women', 3, [8], 'Международный женский день', 'Халықаралық әйелдер күні', 'International Women’s Day'],
  ['constitution', 3, [15], 'День Конституции', 'Конституция күні', 'Constitution Day'],
  ['nauryz', 3, [21, 22, 23], 'Наурыз мейрамы', 'Наурыз мейрамы', 'Nauryz'],
  ['unity', 5, [1], 'Праздник единства народа Казахстана', 'Қазақстан халқының бірлігі күні', 'Kazakhstan People’s Unity Day'],
  ['defender', 5, [7], 'День защитника Отечества', 'Отан қорғаушы күні', 'Defender of the Fatherland Day'],
  ['victory', 5, [9], 'День Победы', 'Жеңіс күні', 'Victory Day'],
  ['kurban-2026', 5, [27], 'Курбан-айт', 'Құрбан айт', 'Kurban Ait'],
  ['capital', 7, [6], 'День столицы', 'Астана күні', 'Capital Day'],
  ['republic', 10, [25], 'День Республики', 'Республика күні', 'Republic Day'],
  ['independence', 12, [16], 'День Независимости', 'Тәуелсіздік күні', 'Independence Day'],
];
/** Official event dates only, not transferred days off; coverage is deliberately limited to 2026. */
export function holidayContext(nowMs: number, locale: DiscoveryLocale): HolidayContext | null {
  if (!Number.isFinite(nowMs)) return null;
  const local = new Date(nowMs + ASTANA_OFFSET_MS);
  if (local.getUTCFullYear() !== 2026) return null;
  const today = Date.UTC(2026, local.getUTCMonth(), local.getUTCDate());
  const candidates = HOLIDAYS_2026.flatMap(([id, month, days, ru, kk, en]) => days.map((day) => {
    const date = Date.UTC(2026, month - 1, day); const distance = (date - today) / DAY_MS;
    return { id, title: text(locale, ru, kk, en), date: new Date(date).toISOString().slice(0, 10), daysUntil: distance,
      theme: id === 'capital' ? 'capital' as const : 'history' as const, calendarYear: 2026 as const };
  })).filter((candidate) => candidate.daysUntil >= 0 && candidate.daysUntil <= 7).sort((a, b) => a.daysUntil - b.daysUntil);
  return candidates[0] ?? null;
}
export type WeatherCondition = 'unknown' | 'sunshine' | 'rain' | 'snow' | 'cold' | 'windy' | 'heat' | 'mild';
export function weatherCondition(read: WeatherRead, choice: WeatherChoiceId, nowMs: number): WeatherCondition {
  if (choice !== 'auto') return choice;
  if (read.status !== 'available' || !read.sample || !weatherFresh(read.sample, nowMs)) return 'unknown';
  const s = read.sample;
  if ([71, 73, 75, 77, 85, 86].includes(s.code)) return 'snow';
  if (s.precipitationMm > 0.1 || [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(s.code)) return 'rain';
  if (s.apparentC <= 5 || s.temperatureC <= 0) return 'cold';
  if (s.windKmh >= 25) return 'windy';
  if (s.temperatureC >= 32 || s.apparentC >= 35) return 'heat';
  if (s.isDay && [0, 1].includes(s.code)) return 'sunshine';
  return 'mild';
}
export function weatherChoiceLabel(choice: WeatherChoiceId, locale: DiscoveryLocale): string {
  switch (choice) {
    case 'auto': return text(locale, 'Сейчас', 'Қазір', 'Current');
    case 'sunshine': return text(locale, 'Солнце', 'Күн ашық', 'Sunshine');
    case 'rain': return text(locale, 'Дождь', 'Жаңбыр', 'Rain');
    case 'cold': return text(locale, 'Холодно', 'Суық', 'Cold');
    case 'windy': return text(locale, 'Ветер', 'Жел', 'Wind');
  }
}
function conditionLabel(condition: WeatherCondition, locale: DiscoveryLocale): string {
  if (condition === 'snow') return text(locale, 'снег', 'қар', 'snow');
  if (condition === 'heat') return text(locale, 'жарко', 'ыстық', 'hot');
  if (condition === 'mild') return text(locale, 'без выраженных осадков', 'айқын жауын-шашынсыз', 'no significant precipitation');
  if (condition === 'unknown') return text(locale, 'условия неизвестны', 'жағдай белгісіз', 'conditions unknown');
  return weatherChoiceLabel(condition, locale).toLocaleLowerCase();
}
export type DiscoveryContextView = Readonly<{ summary: string; detail: string; attribution?: { label: string; url: string };
  reasonByPlace: Readonly<Record<string, string>>; rankedPlaceIds: readonly string[]; weatherAdapted: boolean; holiday: HolidayContext | null }>;
export function discoveryContextView(locale: DiscoveryLocale, places: readonly ContextPlace[], read: WeatherRead,
  choice: WeatherChoiceId, nowMs: number): DiscoveryContextView {
  const condition = weatherCondition(read, choice, nowMs);
  const actual = choice === 'auto' && condition !== 'unknown' ? read.sample : undefined;
  const manual = choice !== 'auto';
  const adverse = ['rain', 'snow', 'cold', 'windy', 'heat'].includes(condition);
  const summary = manual ? text(locale, 'Вы выбрали: ', 'Сіз таңдадыңыз: ', 'You chose: ') + conditionLabel(condition, locale)
    : actual ? text(locale, 'Сейчас в Астане: ', 'Астанада қазір: ', 'Astana now: ') + `${Math.round(actual.temperatureC)} °C · ${conditionLabel(condition, locale)}`
    : text(locale, 'Погода пока неизвестна', 'Ауа райы әзірге белгісіз', 'Current weather unavailable');
  let detail = manual ? text(locale, 'Условия выбраны вами, это не данные погоды.', 'Бұл — өзіңіз таңдаған жағдай, ауа райы деректері емес.', 'These are your chosen conditions, not measured weather.')
    : actual ? text(locale, `Ощущается ${Math.round(actual.apparentC)} °C · ветер ${Math.round(actual.windKmh)} км/ч. Модель для центра города; не прогноз на всю прогулку.`,
      `${Math.round(actual.apparentC)} °C сезіледі · жел ${Math.round(actual.windKmh)} км/сағ. Қала орталығының моделі; бүкіл серуенге болжам емес.`,
      `Feels like ${Math.round(actual.apparentC)} °C · wind ${Math.round(actual.windKmh)} km/h. City-centre model, not a forecast for the whole walk.`)
    : text(locale, 'Выберите условия вручную или обновите. Без актуальных данных места не подбираются по погоде.',
      'Жағдайды өзіңіз таңдаңыз немесе жаңартыңыз. Өзекті дерексіз орындар ауа райына қарай іріктелмейді.',
      'Choose conditions yourself or refresh. Without current data, places are not ranked for weather.');
  if (read.status === 'stale' && !manual) detail = text(locale, 'Данные устарели. ', 'Деректер ескірді. ', 'Weather data are stale. ') + detail;
  if (actual) {
    const local = new Date(actual.timeMs + ASTANA_OFFSET_MS); const pad = (n: number) => String(n).padStart(2, '0');
    const stamp = `${pad(local.getUTCDate())}.${pad(local.getUTCMonth() + 1)}.${local.getUTCFullYear()} ${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;
    detail = text(locale, `Модель на ${stamp} (Астана, UTC+5). `, `${stamp} уақытындағы модель (Астана, UTC+5). `,
      `Model time ${stamp} (Astana, UTC+5). `) + detail;
  }
  const holiday = holidayContext(nowMs, locale);
  if (holiday) {
    const when = holiday.daysUntil === 0 ? text(locale, 'Сегодня', 'Бүгін', 'Today') : text(locale, 'Скоро', 'Жақында', 'Upcoming');
    detail += ` ${when}: ${holiday.title} (${holiday.date.slice(8)}.${holiday.date.slice(5, 7)}). ` +
      text(locale, 'Тематические даты 2026: повод открыть историю города. Мероприятия и часы работы отдельно не подтверждены.',
        '2026 жылғы тақырыптық даталар: қала тарихын танып-білуге себеп. Іс-шаралар мен жұмыс уақыты бөлек расталмаған.',
        'Selected dates for 2026 offer a reason to explore city history. Events and opening hours have not been confirmed.');
  } else if (new Date(nowMs + ASTANA_OFFSET_MS).getUTCFullYear() !== 2026) {
    detail += text(locale, ' Календарь праздников на этот год ещё не обновлён.', ' Биылғы мерекелер күнтізбесі әлі жаңартылмаған.', ' The holiday calendar has not been updated for this year.');
  }
  const reasonByPlace: Record<string, string> = {};
  const ranks = places.map((place, index) => {
    let score = 0; const reasons: string[] = [];
    if (adverse) {
      if (place.indoor) {
        score += place.hoursVerified ? 20 : -25;
        reasons.push(text(locale, 'Внутри здания: перед выходом проверьте часы работы и доступность входа.',
          'Ғимарат іші: шығар алдында жұмыс уақыты мен кіру мүмкіндігін тексеріңіз.',
          'Indoors: check opening hours and entry access before leaving.'));
      } else {
        score -= place.category === 'river' ? 30 : 10;
        reasons.push(place.category === 'river' ? text(locale, 'Набережная под открытым небом: в такую погоду лучше короткий выход.',
          'Жағалау ашық аспан астында: мұндай ауа райында қысқа шығуды таңдаңыз.', 'The riverside is exposed: keep an outdoor visit short in these conditions.')
          : text(locale, 'Короткий осмотр снаружи. Вход внутрь и тёплое укрытие не подтверждены.',
            'Сыртынан қысқаша қарау. Ішке кіру мен жылы орын расталмаған.', 'A short exterior visit. Indoor access and warm shelter are not confirmed.'));
        if (place.hasIndoorOption) reasons.push(text(locale, 'В здании есть помещения, но возможность зайти и часы работы нужно проверить.',
          'Ғимарат ішінде орындар бар, бірақ кіру мүмкіндігі мен жұмыс уақытын тексеру қажет.',
          'The building has indoor spaces, but entry access and hours need checking.'));
      }
    } else if (condition === 'sunshine' && !place.indoor) {
      score += place.category === 'river' ? 15 : 5;
      reasons.push(text(locale, 'Для прогулки под открытым небом; погода ещё может измениться.',
        'Ашық аспан астындағы серуен үшін; ауа райы өзгеруі мүмкін.', 'For an outdoor walk; conditions can still change.'));
    }
    if (holiday && place.category === (holiday.theme === 'capital' ? 'architecture' : 'history')) {
      score += 8;
      reasons.push(text(locale, 'Календарная дата — повод узнать историю этого места.', 'Күнтізбедегі дата — осы орынның тарихын білуге себеп.', 'The calendar date offers a reason to discover this place’s history.'));
    }
    if (place.indoor && !adverse) reasons.push(text(locale, 'Перед посещением проверьте часы работы и вход.', 'Бармас бұрын жұмыс уақыты мен кіруді тексеріңіз.', 'Check opening hours and entry before visiting.'));
    reasonByPlace[place.id] = reasons.join(' ');
    return { id: place.id, index, score };
  });
  return { summary, detail, attribution: actual ? WEATHER_ATTRIBUTION : undefined, reasonByPlace,
    rankedPlaceIds: ranks.sort((a, b) => b.score - a.score || a.index - b.index).map((place) => place.id),
    weatherAdapted: condition !== 'unknown', holiday };
}
type WeatherFetch = (url: string, options: RequestInit) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;
type WeatherClientOptions = { fetcher?: WeatherFetch; now?: () => number; schedule?: (task: () => void, delayMs: number) => () => void };
export class DiscoveryWeatherClient {
  private sample?: WeatherSample;
  private lastAttempt?: number;
  private lastFailure?: string;
  private inFlight?: { controller: AbortController; promise: Promise<WeatherRead>; waiters: Set<symbol> };
  constructor(private readonly options: WeatherClientOptions = {}) {}
  private now(): number { return (this.options.now ?? Date.now)(); }
  read(): WeatherRead {
    if (this.sample) return { status: weatherFresh(this.sample, this.now()) ? 'available' : 'stale', sample: this.sample, reason: this.lastFailure };
    return { status: this.lastFailure ? 'unavailable' : 'unknown', reason: this.lastFailure };
  }
  load(signal?: AbortSignal): Promise<WeatherRead> {
    if (signal?.aborted) return Promise.resolve(this.read());
    if (this.inFlight) return this.join(this.inFlight, signal);
    const now = this.now();
    // A failure/abort consumes the same 30-minute budget. Refresh cannot become an automatic retry loop.
    if (this.lastAttempt !== undefined && now - this.lastAttempt < WEATHER_CACHE_MS) return Promise.resolve(this.read());
    this.lastAttempt = now;
    const request = { controller: new AbortController(), promise: Promise.resolve(this.read()), waiters: new Set<symbol>() };
    this.inFlight = request;
    request.promise = this.request(request);
    return this.join(request, signal);
  }
  private join(request: NonNullable<DiscoveryWeatherClient['inFlight']>, signal?: AbortSignal): Promise<WeatherRead> {
    const token = Symbol(); request.waiters.add(token);
    return new Promise((resolve) => {
      let settled = false;
      const finish = (state: WeatherRead) => {
        if (settled) return; settled = true; request.waiters.delete(token); signal?.removeEventListener('abort', abort); resolve(state);
      };
      const abort = () => { finish(this.read()); if (request.waiters.size === 0) request.controller.abort(); };
      signal?.addEventListener('abort', abort, { once: true });
      request.promise.then(finish, () => finish(this.read()));
    });
  }
  private async request(request: NonNullable<DiscoveryWeatherClient['inFlight']>): Promise<WeatherRead> {
    let timedOut = false;
    const schedule = this.options.schedule ?? ((task: () => void, delay: number) => { const id = setTimeout(task, delay); return () => clearTimeout(id); });
    const cancelTimeout = schedule(() => { timedOut = true; request.controller.abort(); }, WEATHER_TIMEOUT_MS);
    let removeAbort = () => {};
    const aborted = new Promise<never>((_, reject) => {
      const fail = () => reject(new Error('WEATHER_ABORTED'));
      request.controller.signal.addEventListener('abort', fail, { once: true });
      removeAbort = () => request.controller.signal.removeEventListener('abort', fail);
    });
    try {
      const fetcher = this.options.fetcher ?? fetch;
      const response = await Promise.race([fetcher(ASTANA_WEATHER_URL, { signal: request.controller.signal,
        credentials: 'omit', redirect: 'error', cache: 'no-store', headers: { Accept: 'application/json' } }).then(async (reply) => {
          if (!reply.ok) throw new Error('WEATHER_UNAVAILABLE'); return reply.json();
        }), aborted]);
      if (request.controller.signal.aborted) throw new Error('WEATHER_ABORTED');
      const sample = parseCurrentWeather(response, this.now());
      if (!sample) throw new Error('WEATHER_INVALID_OR_STALE');
      this.sample = sample; this.lastFailure = undefined;
    } catch {
      this.lastFailure = timedOut ? 'WEATHER_TIMEOUT' : request.controller.signal.aborted ? 'WEATHER_ABORTED' : 'WEATHER_UNAVAILABLE';
    } finally {
      cancelTimeout(); removeAbort(); if (this.inFlight === request) this.inFlight = undefined;
    }
    return this.read();
  }
}
