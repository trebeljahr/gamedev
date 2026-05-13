import metadata from "../../../metadata.json";
import { assetUrl } from "./manifest";

type MetadataMapping = {
  path_pattern: string;
  source: string;
  notes?: string;
  author?: string;
  pack_url?: string;
  license?: string;
  track_title?: string;
  url?: string;
};

export type SoundCollection = {
  id: string;
  title: string;
  source: string;
  path: string;
  license: string;
  notes: string;
  url?: string;
};

export type MusicTrack = {
  title: string;
  source: string;
  path: string;
  src: string;
  license: string;
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
};

const mappings = metadata.mappings as MetadataMapping[];

function labelFromPath(path: string): string {
  const last = path
    .replace(/^sounds\//, "")
    .replace(/\/\*\*$/, "")
    .split("/")
    .pop();
  return (last ?? path)
    .replace(/^\d+__.+?__/, "")
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export const musicTracks: MusicTrack[] = mappings
  .filter((entry) => entry.path_pattern.startsWith("sounds/music/"))
  .map((entry) => ({
    title: entry.track_title ?? labelFromPath(entry.path_pattern),
    source: "Kevin MacLeod",
    path: entry.path_pattern,
    src: assetUrl(`/${entry.path_pattern}`),
    license: "CC-BY 4.0",
    url: entry.url,
  }));

export const soundCollections: SoundCollection[] = mappings
  .filter(
    (entry) =>
      entry.path_pattern.startsWith("sounds/") &&
      !entry.path_pattern.startsWith("sounds/music/"),
  )
  .map((entry) => ({
    id: entry.path_pattern,
    title: entry.pack_url ? labelFromPath(entry.path_pattern) : labelFromPath(entry.source),
    source: entry.source === "freesound" ? "Freesound" : "Pixabay",
    path: entry.path_pattern,
    license: entry.license ?? (entry.source === "pixabay" ? "Pixabay License" : "Varies"),
    notes:
      entry.notes ??
      (entry.author ? `Pack by ${entry.author}. Check the source before shipping.` : ""),
    url: entry.pack_url,
  }));

export const artPacks = metadata["2d_packs"].packs as ArtPack[];

export const mediaStats = {
  artPackCount: metadata["2d_packs"].pack_count,
  artLicenseSplit: metadata["2d_packs"].license_split,
  soundCollectionCount: soundCollections.length,
  musicTrackCount: musicTracks.length,
};
