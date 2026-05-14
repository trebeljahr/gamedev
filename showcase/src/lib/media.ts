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
  audio?: AudioAnalysis;
  license: string;
  tags: string[];
  searchText: string;
  packId?: string;
  packTitle?: string;
  notes?: string;
  url?: string;
};

export type MediaPackSoundSample = SoundSample & {
  collectionTitle: string;
  collectionPath: string;
  source: string;
  license: string;
  url?: string;
  organization: SoundCollection["organization"];
  organizationLabel: string;
};

export type MediaPack = {
  id: string;
  slug: string;
  kind: "sound" | "music";
  title: string;
  description: string;
  source: string;
  path: string;
  license: string;
  notes?: string;
  url?: string;
  category: string;
  themes: string[];
  useCases: string[];
  tags: string[];
  searchText: string;
  itemCount: number;
  soundSamples: MediaPackSoundSample[];
  musicTracks: MusicTrack[];
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
  audio?: AudioAnalysis;
  label: string;
  kind: "movement" | "combat" | "ui" | "ambient" | "effect";
  description: string;
  category: string;
  themes: string[];
  useCases: string[];
  tags: string[];
  searchText: string;
};

export type AudioAnalysis = {
  path: string;
  contentHash: string;
  byteLength: number;
  duration: number;
  sampleRate: number | null;
  channels: number | null;
  analysisSampleRate: number;
  bucketCount: number;
  loudness: number[];
  peak: number;
  rms: number;
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
    audioAnalysisCount?: number;
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

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function slugBase(value: string): string {
  return (
    value
      .replace(/^sounds\//, "")
      .replace(/\/\*\*$/i, "")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 72) || "pack"
  );
}

export function mediaPackSlug(kind: MediaPack["kind"], id: string): string {
  return `${slugBase(id)}-${hashString(`${kind}:${id}`).toString(36)}`;
}

export function mediaPackHref(kind: MediaPack["kind"], id: string): string {
  return `/media/packs/${mediaPackSlug(kind, id)}`;
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

const soundMediaPacks: MediaPack[] = soundCollections
  .filter((collection) => collection.samples.length > 0)
  .map((collection) => ({
    id: collection.id,
    slug: mediaPackSlug("sound", collection.id),
    kind: "sound" as const,
    title: collection.title,
    description: collection.description,
    source: collection.source,
    path: collection.path,
    license: collection.license,
    notes: collection.notes,
    url: collection.url,
    category: collection.category,
    themes: collection.themes,
    useCases: collection.useCases,
    tags: collection.tags,
    searchText: collection.searchText,
    itemCount: collection.samples.length,
    soundSamples: collection.samples.map((sample) => ({
      ...sample,
      collectionTitle: collection.title,
      collectionPath: collection.path,
      source: collection.source,
      license: collection.license,
      url: collection.url,
      organization: collection.organization,
      organizationLabel: collection.organizationLabel,
    })),
    musicTracks: [],
  }));

function musicPackIdForTrack(track: MusicTrack): string {
  return track.packId ?? track.path.split("/").slice(0, -1).join("/");
}

const musicMediaPacks = (() => {
  const packs = new Map<string, MediaPack>();
  for (const track of musicTracks) {
    const id = musicPackIdForTrack(track);
    const title = track.packTitle ?? id.split("/").pop()?.replace(/[-_]+/g, " ") ?? "Music";
    const current =
      packs.get(id) ??
      ({
        id,
        slug: mediaPackSlug("music", id),
        kind: "music" as const,
        title,
        description: "",
        source: track.source,
        path: id,
        license: track.license,
        notes: track.notes,
        url: track.url,
        category: "music",
        themes: [],
        useCases: [],
        tags: [],
        searchText: "",
        itemCount: 0,
        soundSamples: [],
        musicTracks: [],
      } satisfies MediaPack);

    current.musicTracks.push(track);
    current.themes = unique([...current.themes, ...track.themes]).sort();
    current.useCases = unique([...current.useCases, ...track.useCases]).sort();
    current.tags = unique([...current.tags, ...track.tags]).sort();
    current.source = unique([...current.source.split(", "), track.source]).join(", ");
    current.license = unique([...current.license.split(", "), track.license]).join(", ");
    current.itemCount = current.musicTracks.length;
    current.description = `${current.title} is a music pack with ${current.itemCount.toLocaleString("en-US")} tracks. Source: ${current.source}. License: ${current.license}.`;
    current.searchText = unique([
      current.title,
      current.path,
      current.source,
      current.license,
      current.description,
      ...current.musicTracks.map((item) => item.searchText),
      ...current.themes,
      ...current.useCases,
      ...current.tags,
    ]).join(" ").toLowerCase();
    packs.set(id, current);
  }
  return [...packs.values()];
})();

export const mediaPacks: MediaPack[] = [...soundMediaPacks, ...musicMediaPacks].sort(
  (a, b) => a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id),
);

export function findMediaPack(slug: string): MediaPack | undefined {
  return mediaPacks.find((pack) => pack.slug === slug);
}

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
  audioAnalysisCount: catalog.stats.audioAnalysisCount ?? 0,
  sourceMappingCount: catalog.stats.sourceMappingCount,
};
