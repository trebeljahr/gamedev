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

type SoundOrganization = "user-collection" | "creator-pack" | "source-pattern";

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

type MusicTrackAsset = {
  path: string;
  src: string;
  title: string;
  packId: string;
  packTitle: string;
  source: string;
  license: string;
  notes: string;
};

type AudioAnalysisItem = {
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

type AudioAnalysisCatalog = {
  items?: Record<string, AudioAnalysisItem>;
};

type MediaAssets = {
  artSamples: ArtSample[];
  soundSamples: SoundSample[];
  musicTracks?: MusicTrackAsset[];
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
const audioAnalysisPath = join(__dirname, "..", "public", "audio-analysis.json");
const outPath = join(__dirname, "..", "public", "media-catalog.json");

const NON_COMMERCIAL_ART_PACKS = new Set([
  "bdragon1727-fire-pixel-bullet-16x16",
  "bdragon1727-free-smoke-fx-pixel-2",
]);

const NON_COMMERCIAL_PATH_PATTERNS = new Set([
  "3D/gltf/buster-drone/**",
  "3D/glb/model-{number}{letter}-*.glb",
]);

async function readOptionalJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

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

function tokenTextValue(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([a-z])(\d)/gi, "$1 $2")
    .replace(/(\d)([a-z])/gi, "$1 $2")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function hasToken(text: string, pattern: string): boolean {
  return new RegExp(`(^|\\s)(${pattern})(\\s|$)`, "i").test(tokenTextValue(text));
}

function isKenney2DArtPackFolder(folder: string): boolean {
  return /^2D\/kenney\/[^/]+$/i.test(folder);
}

function buildKenneyArtPack(folder: string): RawArtPack {
  return {
    folder,
    title: labelFromPath(folder),
    author: "Kenney",
    author_url: "https://kenney.nl/",
    url: "https://kenney.nl/assets/category:2D",
    game_id: null,
    license_class: "CC0 1.0 (Creative Commons Zero)",
    attribution: "Optional",
  };
}

function generatedKenneyArtPacks(mediaAssets: MediaAssets, existingFolders: Set<string>): RawArtPack[] {
  const folders = new Set<string>();
  for (const sample of mediaAssets.artSamples) {
    if (isKenney2DArtPackFolder(sample.packFolder)) folders.add(sample.packFolder);
  }
  return [...folders]
    .filter((folder) => !existingFolders.has(folder))
    .sort()
    .map(buildKenneyArtPack);
}

function generatedKenneySoundMappings(mediaAssets: MediaAssets, existingPatterns: Set<string>): MetadataMapping[] {
  const collectionIds = new Set<string>();
  for (const sample of mediaAssets.soundSamples) {
    if (/^sounds\/kenney\/[^/]+\/\*\*$/i.test(sample.collectionId)) collectionIds.add(sample.collectionId);
  }
  return [...collectionIds]
    .filter((collectionId) => !existingPatterns.has(collectionId))
    .sort()
    .map((collectionId) => ({
      path_pattern: collectionId,
      source: "kenney",
      author: "Kenney",
      pack_url: "https://kenney.nl/assets?q=audio",
      license: "CC0 1.0",
      notes: "Generated from copied Kenney audio folders under assets/sounds/kenney.",
    }));
}

function artThemeFor(pack: RawArtPack) {
  const text = tokenTextValue(`${pack.folder.replace(/^2D\/kenney\//i, "")} ${pack.title}`);
  if (hasToken(text, "icon|icons|item|items|coin|coins|chest|pickup|pickups|potion|potions|weapon|weapons|inventory|fable")) return "Icons & Items";
  if (hasToken(text, "effect|effects|fx|fire|smoke|bullet|bullets|spell|spells|magic|explosion|explosions|slash|slashes|particle|particles")) return "Effects";
  if (hasToken(text, "tile|tiles|tileset|tilesets|terrain|forest|dungeon|mine|mines|plains|land|nature|tree|trees|tower|towers|platformer|objects|props|town|city|road|roads|isometric|platform")) {
    return "Environments";
  }
  if (hasToken(text, "ui|hud|button|buttons|menu|menus|interface|interfaces|cursor|cursors|crosshair|crosshairs")) return "UI";
  if (hasToken(text, "space|void|sci|sci fi|mech|mechs|robo|robot|robots|ship|ships|fleet|fleets|alien|aliens|shooter|shooters|vehicle|vehicles|racing")) return "Vehicles & Sci-Fi";
  if (hasToken(text, "animal|animals|bird|birds|cat|cats|frog|frogs|dino|dinos|dinosaur|dinosaurs|jellyfish|shark|sharks|turtle|turtles|crab|crabs|wolf|wolves|critters|creature|creatures")) return "Animals";
  if (hasToken(text, "enemy|enemies|monster|monsters|demon|demons|undead|skeleton|skeletons|worm|worms|executioner|obelisk")) return "Enemies";
  if (hasToken(text, "character|characters|hero|heroes|knight|knights|warrior|warriors|mage|mages|witch|witches|archer|archers|samurai|huntress|king|kings|bandit|bandits")) return "Characters";
  return "General";
}

function normalizeSource(source: string): string {
  if (source === "freesound") return "Freesound";
  if (source === "pixabay") return "Pixabay";
  if (source === "kevin-macleod") return "Kevin MacLeod";
  if (/^alkakrab$/i.test(source)) return "AlkaKrab";
  return labelFromPath(source);
}

const SOUND_ORGANIZATION_LABELS: Record<SoundOrganization, string> = {
  "user-collection": "User collections",
  "creator-pack": "Creator packs",
  "source-pattern": "Source patterns",
};

function isSourcePattern(pathPattern: string): boolean {
  return pathPattern.includes("{") || /\*\.[a-z0-9,{}]+$/i.test(pathPattern);
}

function soundOrganizationForMapping(entry: MetadataMapping): SoundOrganization {
  if (isSourcePattern(entry.path_pattern)) return "source-pattern";
  return "creator-pack";
}

function sourcePatternTitle(entry: MetadataMapping): string {
  if (entry.path_pattern.includes("freesound_community")) return "Pixabay Freesound Community pattern";
  if (entry.path_pattern.includes("{name}-{id}")) return "Pixabay ID file pattern";
  if (entry.path_pattern.includes("{numeric-id}")) return "Freesound ID file pattern";
  return `${normalizeSource(entry.source)} file pattern`;
}

function userCollectionNotes(collectionId: string): string {
  const title = labelFromPath(collectionId);
  return `${title} is a user-curated, mixed-source sound-effects folder. Individual files may come from Freesound, Pixabay, or other mapped sources; match files against source mappings before shipping.`;
}

async function main() {
  const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as Metadata;
  const mediaAssets = JSON.parse(await readFile(mediaAssetsPath, "utf8")) as MediaAssets;
  const audioAnalysis = await readOptionalJson<AudioAnalysisCatalog>(audioAnalysisPath, { items: {} });
  const audioByPath = audioAnalysis.items ?? {};

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

  const existingArtPackFolders = new Set(metadata["2d_packs"].packs.map((pack) => pack.folder));
  const generatedKenneyPacks = generatedKenneyArtPacks(mediaAssets, existingArtPackFolders);
  const allowedArtPacks = [...metadata["2d_packs"].packs, ...generatedKenneyPacks].filter((pack) => !isNonCommercialPack(pack));
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

  const existingMappingPatterns = new Set(metadata.mappings.map((entry) => entry.path_pattern));
  const generatedMappings: MetadataMapping[] = [
    ...(generatedKenneyPacks.length > 0
      ? [
          {
            path_pattern: "2D/kenney/**",
            source: "kenney",
            author: "Kenney",
            pack_url: "https://kenney.nl/assets/category:2D",
            license: "CC0 1.0",
            notes: "Generated from copied Kenney 2D pack folders under assets/2D/kenney.",
          },
        ]
      : []),
    ...generatedKenneySoundMappings(mediaAssets, existingMappingPatterns),
  ];
  const allowedMappings = [...metadata.mappings, ...generatedMappings].filter((entry) => !isNonCommercialMapping(entry));

  const musicMappings = allowedMappings.filter((entry) => entry.path_pattern.startsWith("sounds/music/"));
  const musicMappingByPath = new Map(musicMappings.map((entry) => [entry.path_pattern, entry]));
  const musicTracksByPath = new Map<string, ReturnType<typeof buildMusicTrackMetadata> & {
    title: string;
    source: string;
    path: string;
    src: string;
    license: string;
    packId?: string;
    packTitle?: string;
    notes?: string;
    url?: string;
    audio?: AudioAnalysisItem;
  }>();

  for (const entry of musicMappings) {
    const track = {
      title: entry.track_title ?? labelFromPath(entry.path_pattern),
      source: normalizeSource(entry.source),
      path: entry.path_pattern,
      src: `/${entry.path_pattern.split("/").map(encodeURIComponent).join("/")}`,
      license: entry.license ?? (entry.source === "kevin-macleod" ? "CC-BY 4.0" : "Check source metadata"),
      notes: entry.notes,
      url: entry.url,
      audio: audioByPath[entry.path_pattern],
    };
    musicTracksByPath.set(track.path, {
      ...track,
      ...buildMusicTrackMetadata(track),
    });
  }

  for (const asset of mediaAssets.musicTracks ?? []) {
    const mapping = musicMappingByPath.get(asset.path);
    const track = {
      title: mapping?.track_title ?? asset.title,
      source: mapping ? normalizeSource(mapping.source) : asset.source,
      path: asset.path,
      src: asset.src,
      license: mapping?.license ?? asset.license,
      packId: asset.packId,
      packTitle: asset.packTitle,
      notes: mapping?.notes ?? asset.notes,
      url: mapping?.url,
      audio: audioByPath[asset.path],
    };
    musicTracksByPath.set(track.path, {
      ...track,
      ...buildMusicTrackMetadata(track),
    });
  }

  const musicTracks = [...musicTracksByPath.values()].sort((a, b) => {
    const sourceCompare = a.source.localeCompare(b.source);
    if (sourceCompare !== 0) return sourceCompare;
    const packCompare = (a.packTitle ?? "").localeCompare(b.packTitle ?? "");
    if (packCompare !== 0) return packCompare;
    return a.title.localeCompare(b.title);
  });

  const generatedMusicMappings = (mediaAssets.musicTracks ?? [])
    .filter((track) => !musicMappingByPath.has(track.path))
    .map((track) => {
      const entry: MetadataMapping = {
        path_pattern: track.path,
        source: track.source,
        license: track.license,
        notes: `${track.notes} Pack: ${track.packTitle}.`,
      };
      return entry;
    });

  for (const entry of generatedMusicMappings) {
    allowedMappings.push(entry);
  }

  const mappedSoundCollections = allowedMappings
    .filter((entry) => entry.path_pattern.startsWith("sounds/") && !entry.path_pattern.startsWith("sounds/music/"))
    .map((entry) => {
      const organization = soundOrganizationForMapping(entry);
      const collection = {
        id: entry.path_pattern,
        title:
          organization === "source-pattern"
            ? sourcePatternTitle(entry)
            : entry.pack_url
              ? labelFromPath(entry.path_pattern)
              : labelFromPath(entry.source),
        organization,
        organizationLabel: SOUND_ORGANIZATION_LABELS[organization],
        source: normalizeSource(entry.source),
        path: entry.path_pattern,
        license: entry.license ?? (entry.source === "pixabay" ? "Pixabay License" : "Varies"),
        notes:
          entry.notes ??
          (entry.author
            ? `Creator pack by ${entry.author}. Check the source before shipping.`
            : organization === "source-pattern"
              ? "Pattern used to identify source files; not an artist pack."
              : ""),
        url: entry.pack_url,
      };
      const collectionMetadata = buildSoundCollectionMetadata(collection);
      const samples = (soundSamplesByCollection.get(entry.path_pattern) ?? []).map((sample) => ({
        ...sample,
        audio: audioByPath[sample.path],
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

  const soundCollectionsFromMappings = mappedSoundCollections.filter((collection) => {
    if (collection.samples.length === 0) return false;
    if (collection.category !== "music") return true;

    musicTracks.push(
      ...collection.samples.map((sample) => {
        const track = {
          title: sample.label,
          source: collection.source,
          path: sample.path,
          src: sample.src,
          license: collection.license,
          url: collection.url,
          audio: audioByPath[sample.path],
        };
        return {
          ...track,
          ...buildMusicTrackMetadata(track),
        };
      }),
    );
    return false;
  });

  const soundCollectionsById = new Map(soundCollectionsFromMappings.map((collection) => [collection.id, collection]));
  const mappedSoundCollectionIds = new Set(mappedSoundCollections.map((collection) => collection.id));
  for (const [collectionId, rawSamples] of [...soundSamplesByCollection.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (soundCollectionsById.has(collectionId) || mappedSoundCollectionIds.has(collectionId)) continue;
    const collection = {
      id: collectionId,
      title: labelFromPath(collectionId),
      organization: "user-collection" as const,
      organizationLabel: SOUND_ORGANIZATION_LABELS["user-collection"],
      source: "Mixed sources",
      path: collectionId,
      license: "Check source mapping",
      notes: userCollectionNotes(collectionId),
      url: undefined,
    };
    const collectionMetadata = buildSoundCollectionMetadata(collection);
    const samples = rawSamples.map((sample) => ({
      ...sample,
      audio: audioByPath[sample.path],
      ...buildSoundSampleMetadata({
        collectionTitle: collection.title,
        label: sample.label,
        path: sample.path,
        kind: sample.kind,
      }),
    }));
    if (collectionMetadata.category === "music") {
      musicTracks.push(
        ...samples.map((sample) => {
          const track = {
            title: sample.label,
            source: collection.source,
            path: sample.path,
            src: sample.src,
            license: collection.license,
            url: collection.url,
            audio: audioByPath[sample.path],
          };
          return {
            ...track,
            ...buildMusicTrackMetadata(track),
          };
        }),
      );
      continue;
    }
    soundCollectionsById.set(collectionId, {
      ...collection,
      ...collectionMetadata,
      sampleCount: samples.length,
      samples,
    });
  }

  const soundOrganizationOrder: SoundOrganization[] = ["user-collection", "creator-pack", "source-pattern"];
  const soundCollections = [...soundCollectionsById.values()].sort((a, b) => {
    const organizationDelta =
      soundOrganizationOrder.indexOf(a.organization) - soundOrganizationOrder.indexOf(b.organization);
    if (organizationDelta !== 0) return organizationDelta;
    return a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
  });
  musicTracks.sort((a, b) => a.path.localeCompare(b.path));

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
      soundSampleCount: soundCollections.reduce((count, collection) => count + collection.samples.length, 0),
      musicTrackCount: musicTracks.length,
      audioAnalysisCount: Object.keys(audioByPath).length,
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
