import { assetUrl } from "./manifest";
import { isLikelyMarketingPreviewPath } from "./media-inference";

export type ArtType = "ui-icons" | "spritesheets";
export type ArtSubject = "characters" | "environments" | "effects-items" | "other";
export type ArtMotion = "animated" | "static";

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

export type ArtPackSummary = Omit<ArtPack, "samples"> & {
  artType: ArtType;
  spriteSubject: ArtSubject;
  spriteMotion: ArtMotion;
  materialSampleCount: number;
  preview?: {
    path: string;
    src: string;
    label: string;
    kind: ArtSample["kind"];
    animated: boolean;
  };
};

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

/**
 * The media catalog is a 121 MB JSON file. It lives in `public/media-catalog.json`
 * so it's served as a static asset and never enters the JS bundle. We read it
 * once on the server at module init; client components that need a subset
 * receive serialized props from their server parent.
 *
 * Client-side this module still resolves (so helpers like `mediaPackHref` and
 * the exported type aliases remain client-safe), but every catalog-derived
 * array is empty. Any client component that touches catalog data directly is
 * a bug — it should receive a serialized subset from a server component.
 */
const EMPTY_CATALOG: MediaCatalog = {
  description: "",
  stats: {
    artPackCount: 0,
    artSampleCount: 0,
    soundCollectionCount: 0,
    soundSampleCount: 0,
    musicTrackCount: 0,
    audioAnalysisCount: 0,
    sourceMappingCount: 0,
    artLicenseSplit: {},
  },
  artPacks: [],
  soundCollections: [],
  musicTracks: [],
  sourceMappings: [],
  sources: {},
};

const isServer = typeof window === "undefined";
let _catalog: MediaCatalog = EMPTY_CATALOG;
if (isServer) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs") as typeof import("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("node:path") as typeof import("node:path");
  const raw = fs.readFileSync(path.join(process.cwd(), "public", "media-catalog.json"), "utf8");
  _catalog = JSON.parse(raw) as MediaCatalog;
}

export const catalog: MediaCatalog = _catalog;

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

function materialSamplesIn(samples: ArtSample[]): ArtSample[] {
  const filtered = samples.filter((sample) => !isLikelyMarketingPreviewPath(sample.path));
  return filtered.length > 0 ? filtered : samples;
}

function previewSampleIn(samples: ArtSample[]): ArtSample | undefined {
  return (
    samples.find((sample) => sample.kind === "icon" || sample.kind === "ui") ??
    samples.find((sample) => sample.kind === "character" || sample.kind === "sprite") ??
    samples.find((sample) => sample.kind === "tile" || sample.kind === "effect") ??
    samples[0]
  );
}

function artTypeIn(pack: ArtPack, samples: ArtSample[]): ArtType {
  const sampleKinds = new Set(samples.map((sample) => sample.kind));
  const uiOrIcons = pack.theme === "UI" || pack.theme === "Icons & Items";
  if (uiOrIcons || (sampleKinds.size > 0 && [...sampleKinds].every((kind) => kind === "ui" || kind === "icon"))) {
    return "ui-icons";
  }
  return "spritesheets";
}

const SUBJECT_CHARACTERS_RE =
  /(character|characters|enemy|enemies|animal|creature|hero|knight|warrior|mage|archer|monster|dino)/;
const SUBJECT_ENVIRONMENTS_RE =
  /(environment|environments|tile|tileset|terrain|forest|dungeon|platform|ground|wall|props|nature|town)/;
const SUBJECT_EFFECTS_RE = /(effect|fx|icon|item|inventory|weapon|coin|pickup|potion|spell|magic)/;

function spriteSubjectIn(pack: ArtPack, samples: ArtSample[]): ArtSubject {
  const parts = [pack.theme, pack.title, pack.folder, pack.tags.join(" ")];
  for (const sample of samples) {
    parts.push(sample.kind, sample.path);
  }
  const text = parts.join(" ").toLowerCase();
  if (SUBJECT_CHARACTERS_RE.test(text)) return "characters";
  if (SUBJECT_ENVIRONMENTS_RE.test(text)) return "environments";
  if (SUBJECT_EFFECTS_RE.test(text)) return "effects-items";
  return "other";
}

function spriteMotionIn(samples: ArtSample[]): ArtMotion {
  return samples.some((sample) => sample.animated) ? "animated" : "static";
}

// Used by other modules (e.g. ArtWorkbench client component once the full pack is fetched).
export function materialSamplesFor(pack: ArtPack): ArtSample[] {
  return materialSamplesIn(pack.samples);
}

/**
 * Slim, client-safe view of an ArtPack with the heavy `samples[]` stripped and
 * filter-relevant flags precomputed. `/media` ships this list to MediaExplorer
 * instead of the full 99 MB of art samples; ArtWorkbench fetches the full pack
 * (with samples) on demand via `/api/media/art/[folder]`.
 */
export const artPackSummaries: ArtPackSummary[] = artPacks.map((pack) => {
  const materialSamples = materialSamplesIn(pack.samples);
  const preview = previewSampleIn(materialSamples);
  return {
    folder: pack.folder,
    title: pack.title,
    author: pack.author,
    author_url: pack.author_url,
    url: pack.url,
    game_id: pack.game_id,
    license_class: pack.license_class,
    attribution: pack.attribution,
    theme: pack.theme,
    description: pack.description,
    category: pack.category,
    themes: pack.themes,
    useCases: pack.useCases,
    tags: pack.tags,
    searchText: pack.searchText,
    sampleCount: pack.sampleCount,
    artType: artTypeIn(pack, materialSamples),
    spriteSubject: spriteSubjectIn(pack, materialSamples),
    spriteMotion: spriteMotionIn(materialSamples),
    materialSampleCount: materialSamples.length,
    preview: preview
      ? {
          path: preview.path,
          src: preview.src,
          label: preview.label,
          kind: preview.kind,
          animated: preview.animated,
        }
      : undefined,
  };
});

export function findArtPack(folder: string): ArtPack | undefined {
  return artPacks.find((pack) => pack.folder === folder);
}

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
