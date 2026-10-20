import { z } from 'zod';
import bundled from './guide.json';
import { DISTRICT_IDS, type CityGuide, type CityLocale } from './model';

const point = z.tuple([z.number().finite().min(-180).max(180), z.number().finite().min(-90).max(90)]);
const bounds = z.tuple([z.number(), z.number(), z.number(), z.number()]);
const text = z.object({ ru: z.string().min(1), kk: z.string().min(1), en: z.string().min(1) });
const id = z.enum(DISTRICT_IDS);
const source = z.object({ id: z.string(), title: z.string(), url: z.string().url(), checkedAt: z.string() });
const geometry = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Polygon'), coordinates: point.array().min(4).array().min(1) }),
  z.object({ type: z.literal('MultiPolygon'), coordinates: point.array().min(4).array().min(1).array().min(1) }),
]);
const riverGeometry = z.discriminatedUnion('type', [
  z.object({ type: z.literal('LineString'), coordinates: point.array().min(2) }),
  z.object({ type: z.literal('MultiLineString'), coordinates: point.array().min(2).array().min(1) }),
]);
const data = z.object({
  schemaVersion: z.literal(1),
  content: z.object({
    river: z.object({ name: text, description: text, sourceIds: z.string().array() }),
    sources: source.array(),
    districts: z.object({ id, name: text, tagline: text, description: text, experience: text, sourceIds: z.string().array() }).array().length(6),
  }),
  boundaries: z.object({ type: z.literal('FeatureCollection'), features: z.object({ type: z.literal('Feature'), properties: z.object({ id, nameRu: z.string(), sourceRelationId: z.number().int() }), geometry }).array().length(6) }),
  river: z.object({ type: z.literal('FeatureCollection'), features: z.object({ type: z.literal('Feature'), properties: z.record(z.unknown()).nullable(), geometry: riverGeometry }).array().min(1) }),
  metadata: z.object({ bounds, riverBounds: bounds, overviewBounds: bounds, districts: z.object({ id, center: point, labelCenter: point, bounds }).array().length(6), bankLabelPoints: z.object({ left: point, right: point }) }),
  riverLabelPoint: point,
}).parse(bundled);
const COLORS = { almaty: '#F3BD85', baikonyr: '#B8D9AB', esil: '#C4B6DC', nura: '#ECAFC3', saryarka: '#F1D77C', sarayshyq: '#D7AFCF' };
const COPY = {
  ru: { river: 'Два берега — один город', note: 'Обзорная схема по OpenStreetMap, получена 20.10.2026. Левый и правый берег — географические ориентиры, районы — административные части. Контуры не определяют юридическую принадлежность адреса. Показан городской фрагмент Есиля; в исходных данных есть небольшие разрывы. Переводы KK/EN ещё проходят редактуру.' },
  kk: { river: 'Екі жағалау — бір қала', note: 'OpenStreetMap негізіндегі шолу сызбасы, 20.10.2026 алынған. Сол және оң жағалау — географиялық бағдарлар, аудандар — әкімшілік бөліктер. Контурлар мекенжайдың заңды тиесілілігін анықтамайды. Есілдің қалалық бөлігі көрсетілген; бастапқы деректерде шағын үзілістер бар. KK/EN аудармалары әлі редакциялануда.' },
  en: { river: 'Two banks. One city.', note: 'An overview based on OpenStreetMap, retrieved 20 Oct 2026. Banks are geographical references; districts are administrative divisions. Outlines do not determine an address’s legal district. The urban Yesil segment has small gaps in source data. KK/EN translations await human review.' },
};

/** One read-only guide; no network, navigation promises, personal location or walk commands. */
export function getCityGuide(locale: CityLocale): CityGuide {
  const sources = (ids: string[]) => ids.map(sourceId => {
    const found = data.content.sources.find(item => item.id === sourceId);
    if (!found) throw new Error('Missing city content source');
    return found;
  });
  return {
    bounds: data.metadata.bounds, boundaries: data.boundaries, river: data.river,
    riverBounds: data.metadata.riverBounds,
    overviewBounds: data.metadata.overviewBounds,
    bankLabelPoints: data.metadata.bankLabelPoints, riverLabelPoint: data.riverLabelPoint,
    riverTitle: COPY[locale].river, riverDescription: data.content.river.description[locale],
    riverSources: sources(data.content.river.sourceIds), geometryNote: COPY[locale].note,
    attribution: '© OpenStreetMap contributors · ODbL 1.0',
    districts: data.content.districts.map(district => {
      const area = data.metadata.districts.find(item => item.id === district.id);
      if (!area) throw new Error('Missing city district geometry');
      return { id: district.id, name: district.name[locale], tagline: district.tagline[locale], description: district.description[locale], experience: district.experience[locale],
        color: COLORS[district.id], center: area.labelCenter, bounds: area.bounds, sources: sources(district.sourceIds) };
    }),
  };
}
