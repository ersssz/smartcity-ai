import data from './places.generated.json';
import type { DiscoveryPlace } from './types';

export type DiscoveryLocation = DiscoveryPlace & {
  coordinate: [number, number]; hasIndoorOption: boolean; indoor: false; hoursVerified: false;
};
const photos: Record<string, number> = {
  bayterek: require('../../assets/discovery/bayterek.jpg'),
  'seifullin-museum': require('../../assets/discovery/seifullin-museum.jpg'),
  'gorky-theatre': require('../../assets/discovery/gorky-theatre.jpg'),
  'khan-shatyr': require('../../assets/discovery/khan-shatyr.jpg'),
  'yesil-river': require('../../assets/discovery/yesil-river.jpg'),
};
const note = {
  ru: 'Пока предлагаем знакомство снаружи. Перед входом проверьте часы и условия посещения. Точка на карте обозначает место, а не проверенный вход.',
  kk: 'Әзірше сыртынан танысуды ұсынамыз. Ішке кірер алдында жұмыс уақытын және келу шарттарын тексеріңіз. Картадағы нүкте тек орынды көрсетеді.',
  en: 'Begin with an outside visit. Check opening hours and admission before entering. The map point identifies the place, not a verified entrance.',
};
export const discoveryPlaces: readonly DiscoveryLocation[] = data.map(place => ({
  id: place.id, title: place.title, category: place.category as DiscoveryPlace['category'], summary: place.summary, why: place.why,
  coordinate: [place.coordinate.lon, place.coordinate.lat], hasIndoorOption: place.hasIndoorOption, indoor: false, hoursVerified: false,
  photo: { source: photos[place.photo.id]!, alt: place.photo.alt, sourceUrl: place.photo.sourceUrl,
    attribution: `${place.photo.attribution} · ${place.photo.changes}`, licenseLabel: place.photo.licenseId,
    licenseUrl: place.photo.licenseUrl.replace(/^http:/, 'https:') },
  factsSources: place.factsSources, walkAvailable: place.id === 'bayterek',
  walkActionLabel: place.id === 'bayterek' ? { ru: 'Прогулка с историями', kk: 'Хикаялары бар серуен', en: 'Walk with stories' } : undefined,
  walkNote: place.id === 'bayterek' ? { ru: 'Три остановки у Байтерека с записанными историями. Маршрут возвращается к старту; дорога до старта не включена.',
    kk: 'Бәйтерек маңындағы үш аялдама және дайын хикаялар. Бағыт бастапқы орынға оралады; оған дейінгі жол кірмейді.',
    en: 'Three stops around Baiterek with prepared narration. The walk returns to its start; travel to the start is not included.' } : note,
}));
