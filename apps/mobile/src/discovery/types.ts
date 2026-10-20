import type { ReactNode } from 'react';
import type { ImageSourcePropType } from 'react-native';

export type DiscoveryLocale = 'ru' | 'kk' | 'en';
export type DiscoveryText = Readonly<Record<DiscoveryLocale, string>>;
export type DiscoveryCategory = 'history' | 'architecture' | 'river';
export type DiscoveryFilter = 'all' | DiscoveryCategory;
export type DiscoveryInsets = { top?: number; bottom?: number };
export type DiscoveryPhoto = {
  source: ImageSourcePropType;
  alt: DiscoveryText;
  attribution: string;
  sourceUrl: string;
  licenseLabel?: string;
  licenseUrl?: string;
};
export type DiscoveryPlace = {
  id: string;
  title: DiscoveryText;
  category: DiscoveryCategory;
  summary: DiscoveryText;
  why: DiscoveryText;
  photo?: DiscoveryPhoto;
  factsSources?: readonly { label: string; url: string }[];
  /** True only when Root can offer an actual prepared guided walk for this place. */
  walkAvailable?: boolean;
  walkActionLabel?: DiscoveryText;
  walkNote?: DiscoveryText;
};
export type DiscoveryContext = {
  summary: string;
  detail?: string;
  busy?: boolean;
  onRefresh?: () => void;
  choices?: readonly { id: string; label: string; selected: boolean; onPress: () => void }[];
  attribution?: { label: string; url: string };
};
export type DiscoveryMapProps = {
  selectedPlaceId?: string;
  onSelectPlace: (id: string) => void;
  bottomPadding: number;
};
export type DiscoveryHomeProps = {
  locale: DiscoveryLocale;
  places: readonly DiscoveryPlace[];
  selectedPlaceId?: string;
  busy?: boolean;
  error?: string | null;
  renderMap: (props: DiscoveryMapProps) => ReactNode;
  onSelectPlace: (id: string) => void;
  onOpenPlace?: (id: string) => void;
  onBuildWalk: (id: string) => void;
  onAboutCity?: () => void;
  onLocaleChange?: (locale: DiscoveryLocale) => void;
  insets?: DiscoveryInsets;
  context?: DiscoveryContext;
  reasonByPlace?: Readonly<Record<string, string>>;
};
export type PlaceDetailProps = {
  locale: DiscoveryLocale;
  place: DiscoveryPlace;
  busy?: boolean;
  onBack: () => void;
  onShowOnMap: (id: string) => void;
  onBuildWalk: (id: string) => void;
  onOpenSource?: (url: string) => void;
  insets?: DiscoveryInsets;
  reason?: string;
};
