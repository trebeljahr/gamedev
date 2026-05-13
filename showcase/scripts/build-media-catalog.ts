import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  buildArtPackMetadata,
  buildArtSampleMetadata,
  buildMusicTrackMetadata,
  buildSoundCollectionMetadata,
  buildSoundSampleMetadata,
  buildSourceMappingMetadata,
} from "../src/lib/catalog-metadata";

type MetadataMapping = {
  path_pattern: string;
  source: string;
  notes?: string;
  author?: string;
  pack_url?: string;
  license?: string;
  track_title?: string;
  url?: string;
  likely_creator?: string;
};

type RawArtPack = {
  folder: string;
  title: string;
  author: string;
  author_url?: string;
  url?: string;
  game_id?: number | null;
  license_class: string;
  attribution: string;
};

type ArtSample = {
  packFolder: string;
  path: string;
  src: string;
  label: string;
  kind: "character" | "sprite" | "icon" | "tile" | "effect" | "ui" | "image";
  animated: boolean;
};

type SoundSample = {
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

type Metadata = {
  sources: Record<string, unknown>;
  mappings: MetadataMapping[];
  "2d_packs": {
    pack_count: number;
    license_split: Record<string, number>;
    packs: RawArtPack[];
  };
};

const repoRoot = join(__dirname, "..", "..");
const metadataPath = join(repoRoot, "metadata.json");
const mediaAssetsPath = join(__dirname, "..", "src", "lib", "media-assets.json");
const outPath = join(__dirname, "..", "src", "lib", "media-catalog.json");

const NON_COMMERCIAL_ART_PACKS = new Set([
  "bdragon1727__fire-pixel-bullet-16x16",
  "bdragon1727__free-smoke-fx-pixel-2",
]);

const NON_COMMERCIAL_PATH_PATTERNS = new Set([
  "3D/gltf/buster_drone/**",
  "3D/glb/model_{number}{letter}_-_*.glb",
]);

function isNonCommercialText(value: string | undefined): boolean {
  if (!value) return false;
  return /cc[- ]?by[- ]?nc|by-nc|free for non-commercial/i.test(value);
}

function isNonCommercialMapping(entry: MetadataMapping): boolean {
  if (NON_COMMERCIAL_PATH_PATTERNS.has(entry.path_pattern)) return true;
  return isNonCommercialText(entry.license) || isNonCommercialText(entry.notes);
}

function isNonCommercialPack(pack: RawArtPack): boolean {
  return NON_COMMERCIAL_ART_PACKS.has(pack.folder) || isNonCommercialText(pack.license_class);
}

function artLicenseKey(licenseClass: string): string {
  if (/cc0|creative commons zero/i.test(licenseClass)) return "cc0";
  return "custom_no_redist";
}

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

function artThemeFor(pack: RawArtPack) {
  const text = `${pack.folder} ${pack.title}`.toLowerCase();
  if (/(icon|item|coin|chest|pickup|potion|weapon|inventory|fable)/.test(text)) return "Icons & Items";
  if (/(effect|fx|fire|smoke|bullet|spell|magic|explosion|slash)/.test(text)) return "Effects";
  if (/(tile|tileset|forest|dungeon|mine|plains|land|nature|tree|tower|platformer|objects|town)/.test(text)) {
    return "Environments";
  }
  if (/(ui|hud|button|menu)/.test(text)) return "UI";
  if (/(space|void|sci-fi|sci fi|mech|robo|ship|fleet|alien|shooter)/.test(text)) return "Vehicles & Sci-Fi";
  if (/(animal|bird|cat|frog|dino|jellyfish|shark|turtle|crab|wolf|critters|creature)/.test(text)) return "Animals";
  if (/(enemy|monster|demon|undead|skeleton|worm|executioner|obelisk)/.test(text)) return "Enemies";
  if (/(character|hero|knight|warrior|mage|witch|archer|samurai|huntress|king|bandit)/.test(text)) return "Characters";
  return "General";
}

function normalizeSource(source: string): string {
  if (source === "freesound") return "Freesound";
  if (source === "pixabay") return "Pixabay";
  if (source === "kevin-macleod") return "Kevin MacLeod";
  return labelFromPath(source);
}

async function main() {
  const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as Metadata;
  const mediaAssets = JSON.parse(await readFile(mediaAssetsPath, "utf8")) as MediaAssets;

  const artSamplesByPack = mediaAssets.artSamples.reduce((map, sample) => {
    const list = map.get(sample.packFolder) ?? [];
    list.push(sample);
    map.set(sample.packFolder, list);
    return map;
  }, new Map<string, ArtSample[]>());

  const soundSamplesByCollection = mediaAssets.soundSamples.reduce((map, sample) => {
    const list = map.get(sample.collectionId) ?? [];
    list.push(sample);
    map.set(sample.collectionId, list);
    return map;
  }, new Map<string, SoundSample[]>());

  const allowedArtPacks = metadata["2d_packs"].packs.filter((pack) => !isNonCommercialPack(pack));
  const allowedArtPackFolders = new Set(allowedArtPacks.map((pack) => pack.folder));

  const artPacks = allowedArtPacks.map((pack) => {
    const normalizedPack = {
      ...pack,
      author: pack.author.trim(),
      theme: artThemeFor(pack),
    };
    const packMetadata = buildArtPackMetadata(normalizedPack);
    const samples = (artSamplesByPack.get(pack.folder) ?? []).map((sample) => ({
      ...sample,
      ...buildArtSampleMetadata({
        packTitle: normalizedPack.title,
        label: sample.label,
        path: sample.path,
        kind: sample.kind,
        animated: sample.animated,
      }),
    }));
    return {
      ...normalizedPack,
      ...packMetadata,
      sampleCount: samples.length,
      samples,
    };
  });

  const allowedMappings = metadata.mappings.filter((entry) => !isNonCommercialMapping(entry));

  const musicTracks = allowedMappings
    .filter((entry) => entry.path_pattern.startsWith("sounds/music/"))
    .map((entry) => {
      const track = {
        title: entry.track_title ?? labelFromPath(entry.path_pattern),
        source: "Kevin MacLeod",
        path: entry.path_pattern,
        src: `/${entry.path_pattern.split("/").map(encodeURIComponent).join("/")}`,
        license: "CC-BY 4.0",
        url: entry.url,
      };
      return {
        ...track,
        ...buildMusicTrackMetadata(track),
      };
    });

  const soundCollectionsFromMappings = allowedMappings
    .filter((entry) => entry.path_pattern.startsWith("sounds/") && !entry.path_pattern.startsWith("sounds/music/"))
    .map((entry) => {
      const collection = {
        id: entry.path_pattern,
        title: entry.pack_url ? labelFromPath(entry.path_pattern) : labelFromPath(entry.source),
        source: normalizeSource(entry.source),
        path: entry.path_pattern,
        license: entry.license ?? (entry.source === "pixabay" ? "Pixabay License" : "Varies"),
        notes: entry.notes ?? (entry.author ? `Pack by ${entry.author}. Check the source before shipping.` : ""),
        url: entry.pack_url,
      };
      const collectionMetadata = buildSoundCollectionMetadata(collection);
      const samples = (soundSamplesByCollection.get(entry.path_pattern) ?? []).map((sample) => ({
        ...sample,
        ...buildSoundSampleMetadata({
          collectionTitle: collection.title,
          label: sample.label,
          path: sample.path,
          kind: sample.kind,
        }),
      }));
      return {
        ...collection,
        ...collectionMetadata,
        sampleCount: samples.length,
        samples,
      };
    });

  const soundCollectionsById = new Map(soundCollectionsFromMappings.map((collection) => [collection.id, collection]));
  for (const [collectionId, rawSamples] of [...soundSamplesByCollection.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (soundCollectionsById.has(collectionId)) continue;
    const collection = {
      id: collectionId,
      title: labelFromPath(collectionId),
      source: "Local media library",
      path: collectionId,
      license: "Check source mapping",
      notes: "Generated from the local sounds folder. Match individual files against sourceMappings before shipping.",
      url: undefined,
    };
    const collectionMetadata = buildSoundCollectionMetadata(collection);
    const samples = rawSamples.map((sample) => ({
      ...sample,
      ...buildSoundSampleMetadata({
        collectionTitle: collection.title,
        label: sample.label,
        path: sample.path,
        kind: sample.kind,
      }),
    }));
    soundCollectionsById.set(collectionId, {
      ...collection,
      ...collectionMetadata,
      sampleCount: samples.length,
      samples,
    });
  }

  const soundCollections = [...soundCollectionsById.values()].sort((a, b) => a.id.localeCompare(b.id));

  const sourceMappings = allowedMappings.map((entry) => ({
    id: entry.path_pattern,
    pathPattern: entry.path_pattern,
    source: entry.source,
    author: entry.author,
    url: entry.url ?? entry.pack_url,
    license: entry.license,
    notes: entry.notes,
    likelyCreator: entry.likely_creator,
    ...buildSourceMappingMetadata(entry),
  }));

  const catalog = {
    description:
      "Search-ready metadata for non-3D-library assets. Generated from metadata.json plus media-assets.json; agents can use this to choose 2D art, sound effects, music, textures, and source path groups without opening or listening to files.",
    stats: {
      artPackCount: artPacks.length,
      artSampleCount: mediaAssets.artSamples.filter((sample) => allowedArtPackFolders.has(sample.packFolder)).length,
      soundCollectionCount: soundCollections.length,
      soundSampleCount: mediaAssets.soundSamples.length,
      musicTrackCount: musicTracks.length,
      sourceMappingCount: sourceMappings.length,
      artLicenseSplit: allowedArtPacks.reduce<Record<string, number>>((counts, pack) => {
        const key = artLicenseKey(pack.license_class);
        counts[key] = (counts[key] ?? 0) + 1;
        return counts;
      }, {}),
    },
    artPacks,
    soundCollections,
    musicTracks,
    sourceMappings,
    sources: metadata.sources,
  };

  await writeFile(outPath, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(
    `[media-catalog] ${artPacks.length} art packs · ${soundCollections.length} sound groups · ${musicTracks.length} music tracks · ${sourceMappings.length} path mappings`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
