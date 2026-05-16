import { assetUrl } from "./manifest";
import type { ArtInspection } from "./media-inference";
import { isLikelyMarketingPreviewPath, isLikelyPromoArt } from "./media-inference";

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
  inspection?: ArtInspection;
  promo?: boolean;
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

type SlimMediaCatalog = {
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
  artPacks: ArtPackSummary[];
  soundCollections: SoundCollection[];
  musicTracks: MusicTrack[];
  sourceMappings: SourceMapping[];
  sources: Record<string, unknown>;
};

/**
 * The catalog now lives in two layers:
 *   - `public/media-catalog.json` (~2.5 MB): slim index. Holds pack
 *     summaries, sounds, music, source mappings. Loaded once at module init.
 *   - `public/media-catalog/packs/<folder>.json` (~0.3-5 MB each): full pack
 *     with its samples[]. Loaded on demand via `findArtPack(folder)`.
 *
 * Client-side this module still resolves (so helpers like `mediaPackHref` and
 * the exported type aliases remain client-safe), but every catalog-derived
 * array is empty. Any client component that touches catalog data directly is
 * a bug — it should receive a serialized subset from a server component.
 */
const EMPTY_CATALOG: SlimMediaCatalog = {
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
let _catalog: SlimMediaCatalog = EMPTY_CATALOG;
if (isServer) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs") as typeof import("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("node:path") as typeof import("node:path");
  const raw = fs.readFileSync(path.join(process.cwd(), "public", "media-catalog.json"), "utf8");
  _catalog = JSON.parse(raw) as SlimMediaCatalog;
}

export const catalog: SlimMediaCatalog = _catalog;

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

export const artPackSummaries: ArtPackSummary[] = catalog.artPacks.map((summary) => ({
  ...summary,
  preview: summary.preview ? { ...summary.preview, src: assetUrl(summary.preview.src) } : undefined,
}));

/**
 * Mirrors the filter used by build-media-catalog.ts when computing
 * per-pack summaries. Kept here for ArtWorkbench, which receives a full
 * pack via /api/media/art/[folder] and needs the same shape on the
 * client.
 */
export function materialSamplesFor(pack: ArtPack): ArtSample[] {
  const filtered = pack.samples.filter(
    (sample) =>
      !sample.promo &&
      !sample.inspection?.promoBackground &&
      !isLikelyPromoArt(sample.path, sample.inspection),
  );
  if (filtered.length > 0) return filtered;
  const lighter = pack.samples.filter((sample) => !isLikelyMarketingPreviewPath(sample.path));
  return lighter.length > 0 ? lighter : pack.samples;
}

function packFileSlug(folder: string): string {
  return folder.replace(/\//g, "__");
}

const artPackCache = new Map<string, ArtPack | null>();

/**
 * Lazy-load a single art pack from its per-pack JSON file. Server-only; the
 * client should fetch `/api/media/art/[folder]` instead. Memoized in-process
 * so repeat reads for the same folder are free.
 *
 * Returns samples with the raw `/asset/path.png` src as written to disk —
 * callers that need them resolved through ASSETS_BASE_URL should wrap with
 * `assetUrl`. The /api/media/art route does this before returning to the
 * client; landing pages with their own base URL consume the raw form.
 */
export function findArtPack(folder: string): ArtPack | undefined {
  if (!isServer) return undefined;
  if (artPackCache.has(folder)) return artPackCache.get(folder) ?? undefined;

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs") as typeof import("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("node:path") as typeof import("node:path");
  const file = path.join(process.cwd(), "public", "media-catalog", "packs", `${packFileSlug(folder)}.json`);
  let pack: ArtPack | null = null;
  try {
    const raw = fs.readFileSync(file, "utf8");
    pack = JSON.parse(raw) as ArtPack;
  } catch {
    pack = null;
  }
  artPackCache.set(folder, pack);
  return pack ?? undefined;
}

/** Rewrites `samples[].src` through `assetUrl`. Used by API route handlers. */
export function withResolvedSampleUrls(pack: ArtPack): ArtPack {
  return {
    ...pack,
    samples: pack.samples.map((sample) => ({ ...sample, src: assetUrl(sample.src) })),
  };
}

export const sourceMappings: SourceMapping[] = catalog.sourceMappings;
export const mediaSources = catalog.sources;

export const artCreators = Array.from(new Set(catalog.artPacks.map((pack) => pack.author)))
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
