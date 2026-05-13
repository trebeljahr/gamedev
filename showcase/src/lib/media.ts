import metadata from "../../../metadata.json";
import mediaAssets from "./media-assets.json";
import { assetUrl } from "./manifest";
import {
  buildArtPackMetadata,
  buildMusicTrackMetadata,
  buildSoundCollectionMetadata,
} from "./catalog-metadata";

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
  description: string;
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
  source: string;
  path: string;
  src: string;
  license: string;
  tags: string[];
  searchText: string;
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
  tags: string[];
  searchText: string;
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
};

export type SoundSample = {
  collectionId: string;
  path: string;
  src: string;
  label: string;
  kind: "movement" | "combat" | "ui" | "ambient" | "effect";
};

type MediaAssets = {
  artSamples: ArtSample[];
  soundSamples: SoundSample[];
};

type RawArtPack = Omit<ArtPack, "theme" | "description" | "tags" | "searchText" | "samples">;

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

function normalizeCreator(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "-");
}

function artThemeFor(pack: RawArtPack): ArtTheme {
  const text = `${pack.folder} ${pack.title}`.toLowerCase();
  if (/(icon|item|coin|chest|pickup|potion|weapon|inventory|fable)/.test(text)) {
    return "Icons & Items";
  }
  if (/(effect|fx|fire|smoke|bullet|spell|magic|explosion|slash)/.test(text)) return "Effects";
  if (/(tile|tileset|forest|dungeon|mine|plains|land|nature|tree|tower|platformer|objects|town)/.test(text)) {
    return "Environments";
  }
  if (/(ui|hud|button|menu)/.test(text)) return "UI";
  if (/(space|void|sci-fi|sci fi|mech|robo|ship|fleet|alien|shooter)/.test(text)) {
    return "Vehicles & Sci-Fi";
  }
  if (/(animal|bird|cat|frog|dino|jellyfish|shark|turtle|crab|wolf|critters|creature)/.test(text)) {
    return "Animals";
  }
  if (/(enemy|monster|demon|undead|skeleton|worm|executioner|obelisk)/.test(text)) return "Enemies";
  if (/(character|hero|knight|warrior|mage|witch|archer|samurai|huntress|king|bandit)/.test(text)) {
    return "Characters";
  }
  return "General";
}

const typedMediaAssets = mediaAssets as MediaAssets;

const artSamplesByPack = typedMediaAssets.artSamples.reduce((map, sample) => {
  const list = map.get(sample.packFolder) ?? [];
  list.push({ ...sample, src: assetUrl(sample.src) });
  map.set(sample.packFolder, list);
  return map;
}, new Map<string, ArtSample[]>());

const soundSamplesByCollection = typedMediaAssets.soundSamples.reduce((map, sample) => {
  const list = map.get(sample.collectionId) ?? [];
  list.push({ ...sample, src: assetUrl(sample.src) });
  map.set(sample.collectionId, list);
  return map;
}, new Map<string, SoundSample[]>());

export const musicTracks: MusicTrack[] = mappings
  .filter((entry) => entry.path_pattern.startsWith("sounds/music/"))
  .map((entry) => {
    const track = {
      title: entry.track_title ?? labelFromPath(entry.path_pattern),
      source: "Kevin MacLeod",
      path: entry.path_pattern,
      src: assetUrl(`/${entry.path_pattern}`),
      license: "CC-BY 4.0",
      url: entry.url,
    };
    return {
      ...track,
      ...buildMusicTrackMetadata(track),
    };
  });

export const soundCollections: SoundCollection[] = mappings
  .filter(
    (entry) =>
      entry.path_pattern.startsWith("sounds/") &&
      !entry.path_pattern.startsWith("sounds/music/"),
  )
  .map((entry) => {
    const collection = {
      id: entry.path_pattern,
      title: entry.pack_url ? labelFromPath(entry.path_pattern) : labelFromPath(entry.source),
      source: entry.source === "freesound" ? "Freesound" : "Pixabay",
      path: entry.path_pattern,
      license: entry.license ?? (entry.source === "pixabay" ? "Pixabay License" : "Varies"),
      notes:
        entry.notes ??
        (entry.author ? `Pack by ${entry.author}. Check the source before shipping.` : ""),
      url: entry.pack_url,
      samples: soundSamplesByCollection.get(entry.path_pattern) ?? [],
    };
    return {
      ...collection,
      ...buildSoundCollectionMetadata(collection),
    };
  });

export const artPacks: ArtPack[] = (metadata["2d_packs"].packs as RawArtPack[]).map(
  (pack) => {
    const normalizedPack = {
      ...pack,
      author: pack.author.trim(),
      theme: artThemeFor(pack),
    };
    return {
      ...normalizedPack,
      ...buildArtPackMetadata(normalizedPack),
      samples: artSamplesByPack.get(pack.folder) ?? [],
    };
  },
);

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
  artPackCount: metadata["2d_packs"].pack_count,
  artLicenseSplit: metadata["2d_packs"].license_split,
  soundCollectionCount: soundCollections.length,
  musicTrackCount: musicTracks.length,
};
