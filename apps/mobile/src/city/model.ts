export type CityLocale = 'ru' | 'kk' | 'en';
export const DISTRICT_IDS = ['almaty', 'baikonyr', 'esil', 'nura', 'saryarka', 'sarayshyq'] as const;
export type DistrictId = typeof DISTRICT_IDS[number];
export type CityBounds = [number, number, number, number];
export type CitySource = { id: string; title: string; url: string; checkedAt: string };
export type CityDistrict = {
  id: DistrictId;
  name: string;
  tagline: string;
  description: string;
  experience: string;
  color: string;
  center: [number, number];
  bounds: CityBounds;
  sources: CitySource[];
};

/** Browsing the city changes no walk progress and requests no device location. */
export type CityGuide = {
  districts: CityDistrict[];
  boundaries: GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, { id: string; nameRu: string; sourceRelationId: number }>;
  river: GeoJSON.FeatureCollection<GeoJSON.LineString | GeoJSON.MultiLineString>;
  bounds: CityBounds;
  bankLabelPoints?: { left: [number, number]; right: [number, number] };
  riverBounds?: CityBounds;
  overviewBounds?: CityBounds;
  riverLabelPoint?: [number, number];
  riverTitle: string;
  riverDescription: string;
  riverSources: CitySource[];
  geometryNote: string;
  attribution: string;
};
