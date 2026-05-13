import mediaCatalog from "./media-catalog.json";
import { assetUrl } from "./manifest";

export type SoundCollection = {
  id: string;
  title: string;
  description: string;
  organization: "user-collection" | "creator-pack" | "source-pattern";
  organizationLabel: string;
  category: string;
  themes: string[];
  useCases: string[];
  source: string;
  path: string;
  license: string;
  notes: string;
  tags: string[];
  searchText: string;
  samples: SoundSample[];
  url?: string;
};

export type MusicTrack = {
  title: string;
  description: string;
  category: string;
  themes: string[];
  useCases: string[];
  source: string;
  path: string;
  src: string;
  license: string;
  tags: string[];
  searchText: string;
  packId?: string;
  packTitle?: string;
  notes?: string;
  url?: string;
};

export type ArtPack = {
  folder: string;
  title: string;
  author: string;
  author_url?: string;
  url?: string;
  game_id?: number | null;
  license_class: string;
  attribution: string;
  theme: ArtTheme;
  description: string;
  category: string;
  themes: string[];
  useCases: string[];
  tags: string[];
  searchText: string;
  sampleCount: number;
  samples: ArtSample[];
};

export type ArtTheme =
  | "Characters"
  | "Enemies"
  | "Effects"
  | "Icons & Items"
  | "Environments"
  | "UI"
  | "Vehicles & Sci-Fi"
  | "Animals"
  | "General";

export type ArtSample = {
  packFolder: string;
  path: string;
  src: string;
  label: string;
  kind: "character" | "sprite" | "icon" | "tile" | "effect" | "ui" | "image";
  animated: boolean;
  description: string;
  category: string;
  themes: string[];
  useCases: string[];
  tags: string[];
  searchText: string;
};

export type SoundSample = {
  collectionId: string;
  path: string;
  src: string;
  label: string;
  kind: "movement" | "combat" | "ui" | "ambient" | "effect";
  description: string;
  category: string;
  themes: string[];
  useCases: string[];
  tags: string[];
  searchText: string;
};

export type SourceMapping = {
  id: string;
  pathPattern: string;
  title: string;
  medium: string;
  source: string;
  author?: string;
  url?: string;
  license?: string;
  notes?: string;
  likelyCreator?: string;
  description: string;
  category: string;
  themes: string[];
  useCases: string[];
  tags: string[];
  searchText: string;
};

type MediaCatalog = {
  description: string;
  stats: {
    artPackCount: number;
    artSampleCount: number;
    soundCollectionCount: number;
    soundSampleCount: number;
    musicTrackCount: number;
    sourceMappingCount: number;
    artLicenseSplit: Record<string, number>;
  };
  artPacks: ArtPack[];
  soundCollections: SoundCollection[];
  musicTracks: MusicTrack[];
  sourceMappings: SourceMapping[];
  sources: Record<string, unknown>;
};

function normalizeCreator(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "-");
}

export const catalog = mediaCatalog as MediaCatalog;

export const musicTracks: MusicTrack[] = catalog.musicTracks.map((track) => ({
  ...track,
  src: assetUrl(track.src),
}));

export const soundCollections: SoundCollection[] = catalog.soundCollections.map((collection) => ({
  ...collection,
  samples: collection.samples.map((sample) => ({ ...sample, src: assetUrl(sample.src) })),
}));

export const artPacks: ArtPack[] = catalog.artPacks.map((pack) => ({
  ...pack,
  samples: pack.samples.map((sample) => ({ ...sample, src: assetUrl(sample.src) })),
}));

export const sourceMappings: SourceMapping[] = catalog.sourceMappings;
export const mediaSources = catalog.sources;

export const artCreators = Array.from(new Set(artPacks.map((pack) => pack.author)))
  .sort((a, b) => normalizeCreator(a).localeCompare(normalizeCreator(b)));

export const artThemes: ArtTheme[] = [
  "Characters",
  "Enemies",
  "Effects",
  "Icons & Items",
  "Environments",
  "UI",
  "Vehicles & Sci-Fi",
  "Animals",
  "General",
];

export const mediaStats = {
  artPackCount: catalog.stats.artPackCount,
  artSampleCount: catalog.stats.artSampleCount,
  artLicenseSplit: catalog.stats.artLicenseSplit,
  soundCollectionCount: soundCollections.length,
  soundSampleCount: catalog.stats.soundSampleCount,
  musicTrackCount: musicTracks.length,
  sourceMappingCount: catalog.stats.sourceMappingCount,
};
