import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import type { ArtInspection } from "../src/lib/media-inference";
import {
  inferArtKind,
  isAnimatedArt,
  isLikelyPromoArt,
  selectDisplayArtSamples,
} from "../src/lib/media-inference";
import { flushInspectionCache, inspectArtImageCached } from "./inspect-art-image";

const SHOWCASE_DIR = join(__dirname, "..");
const REPO_ROOT = join(SHOWCASE_DIR, "..");
const ASSETS_ROOT = process.env.ASSETS_DIR
  ? process.env.ASSETS_DIR
  : join(REPO_ROOT, "assets");
const OUT = join(SHOWCASE_DIR, "src", "lib", "media-assets.json");
const IMAGE_INSPECT_CACHE = join(SHOWCASE_DIR, ".cache", "image-inspect.json");

const NON_COMMERCIAL_ART_PACKS = new Set([
  "bdragon1727-fire-pixel-bullet-16x16",
  "bdragon1727-free-smoke-fx-pixel-2",
]);

type ArtSample = {
  packFolder: string;
  path: string;
  src: string;
  label: string;
  kind: "character" | "sprite" | "icon" | "tile" | "effect" | "ui" | "image";
  animated: boolean;
  inspection?: ArtInspection;
  promo?: boolean;
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

type ArtPackDir = {
  packFolder: string;
  dir: string;
};

const AUDIO_EXT_PATTERN = /\.(mp3|wav|ogg|m4a|flac|opus)$/i;
const KEVIN_MACLEOD_TRACKS = new Set([
  "Ancient Winds.mp3",
  "Bittersweet.mp3",
  "Black Vortex.mp3",
  "Clash Defiant.mp3",
  "Comfortable Mystery 2.mp3",
  "Corruption.mp3",
  "Magic Forest.mp3",
  "Midnight Tale.mp3",
  "Peppers Theme.mp3",
  "Stay the Course.mp3",
]);

async function walk(dir: string, predicate: (path: string, name: string) => boolean): Promise<string[]> {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop()!;
    for (const entry of await readdir(d, { withFileTypes: true })) {
      const p = join(d, entry.name);
      if (entry.isDirectory()) stack.push(p);
      else if (entry.isFile() && predicate(p, entry.name)) out.push(p);
    }
  }
  return out;
}

function humanize(s: string): string {
  return s
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\s+/g, " ")
    .trim();
}

function isJunkPath(path: string): boolean {
  return /(^|\/)(__MACOSX|\.DS_Store)(\/|$)/i.test(path) || /(^|\/)\._/.test(path);
}

/**
 * If a gif has been pre-processed into a sibling sprite sheet
 * (`<name>__strip-WxH.sheet.png` produced by build-gif-sheets.ts), drop the
 * original gif so downstream code uses the static sheet instead — canvas can't
 * decode subsequent gif frames, but it can animate a strip just fine.
 */
function dropGifsWithSheetSiblings(images: string[]): string[] {
  const sheetBases = new Set<string>();
  for (const abs of images) {
    const match = abs.match(/^(.*?)__strip-\d+x\d+\.sheet\.png$/i);
    if (match) sheetBases.add(match[1]);
  }
  if (sheetBases.size === 0) return images;
  return images.filter((abs) => {
    if (!/\.gif$/i.test(abs)) return true;
    const base = abs.replace(/\.gif$/i, "");
    return !sheetBases.has(base);
  });
}

async function addPackDirsFromRoot(
  out: Map<string, ArtPackDir>,
  dir: string,
  packFolderForName: (name: string) => string,
): Promise<void> {
  if (!existsSync(dir)) return;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const packFolder = packFolderForName(entry.name);
    if (NON_COMMERCIAL_ART_PACKS.has(packFolder)) continue;
    out.set(packFolder, { packFolder, dir: join(dir, entry.name) });
  }
}

async function discoverArtPackDirs(assetsRoot: string): Promise<ArtPackDir[]> {
  const out = new Map<string, ArtPackDir>();
  const itchRoot = join(assetsRoot, "2D");

  await addPackDirsFromRoot(out, itchRoot, (name) => name);
  out.delete("kenney");
  await addPackDirsFromRoot(out, join(assetsRoot, "2D", "kenney"), (name) => `2D/kenney/${name}`);

  return [...out.values()].sort((a, b) => a.packFolder.localeCompare(b.packFolder));
}

function labelFromAssetPath(path: string): string {
  return humanize(
    path
      .split("/")
      .pop()!
      .replace(/\.[^.]+$/i, "")
      .replace(/^\d+__.+?__/, ""),
  );
}

function musicPackId(path: string): string {
  const parts = path.split("/");
  if (parts.length >= 4 && !AUDIO_EXT_PATTERN.test(parts[2])) return `${parts[0]}/${parts[1]}/${parts[2]}`;
  return "sounds/music";
}

function musicPackTitle(packId: string): string {
  if (packId === "sounds/music") return "Loose Music";
  return humanize(packId.split("/").pop() ?? packId);
}

function musicBaseTitle(path: string): string {
  const raw = path
    .split("/")
    .pop()!
    .replace(/\.[^.]+$/i, "")
    .replace(/^\d+[\s._-]+/, "")
    .replace(/\s*\((?:loop|full|preview)\)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return humanize(raw);
}

function isMusicLoop(path: string): boolean {
  return /\/loops?\//i.test(path) || /\bloop\b/i.test(path.split("/").pop() ?? "");
}

function musicTitle(path: string): string {
  const title = musicBaseTitle(path);
  return isMusicLoop(path) && !/\bloop\b/i.test(title) ? `${title} Loop` : title;
}

function musicDedupeKey(path: string): string {
  const title = musicBaseTitle(path)
    .replace(/\bloop\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return `${musicPackId(path)}:${isMusicLoop(path) ? "loop" : "track"}:${title}`;
}

function scoreMusicFile(path: string): number {
  const lower = path.toLowerCase();
  let score = 0;
  if (lower.endsWith(".mp3")) score += 100;
  else if (lower.endsWith(".ogg")) score += 90;
  else if (lower.endsWith(".m4a") || lower.endsWith(".opus")) score += 80;
  else if (lower.endsWith(".wav")) score += 70;
  else if (lower.endsWith(".flac")) score += 60;
  if (/\/tracks?\//.test(lower)) score += 20;
  if (/\/loops?\//.test(lower)) score += 20;
  if (/\/extracted-partial\//.test(lower)) score -= 50;
  if (/(preview|demo)/.test(lower)) score -= 10;
  return score;
}

function inferMusicSource(path: string, alkaKrabPackIds: Set<string>): Pick<MusicTrackAsset, "source" | "license" | "notes"> {
  const basename = path.split("/").pop() ?? path;
  if (KEVIN_MACLEOD_TRACKS.has(basename)) {
    return {
      source: "Kevin MacLeod",
      license: "CC-BY 4.0",
      notes: "Known incompetech track. Attribution required when used.",
    };
  }
  if (alkaKrabPackIds.has(musicPackId(path))) {
    return {
      source: "AlkaKrab",
      license: "Royalty-free custom terms",
      notes: "Bundled AlkaKrab / Alanas Buividas license PDF. Verify terms before shipping.",
    };
  }
  if (/^freesound_community-/i.test(basename) || /-\d{4,7}\.(mp3|wav|ogg|m4a|flac|opus)$/i.test(basename)) {
    return {
      source: "Pixabay",
      license: "Pixabay License",
      notes: "Filename pattern matches Pixabay-hosted music. Confirm source page before shipping.",
    };
  }
  if (/^\d+__[^/]+__/i.test(basename)) {
    return {
      source: "Freesound",
      license: "Varies per sound",
      notes: "Freesound license varies by upload. Confirm source page before shipping.",
    };
  }
  return {
    source: "Local music library",
    license: "Check source metadata",
    notes: "Generated from the local music folder. Confirm bundled or source license before shipping.",
  };
}

async function discoverAlkaKrabMusicPacks(musicRoot: string): Promise<Set<string>> {
  const files = await walk(
    musicRoot,
    (path, name) => !isJunkPath(path) && /\.(pdf|txt|md)$/i.test(name) && /(?:alkakrab|license)/i.test(name),
  );
  const packIds = new Set<string>();
  for (const abs of files) {
    const rel = relative(ASSETS_ROOT, abs).split("/").join("/");
    const basename = rel.split("/").pop() ?? "";
    let isAlkaKrab = /alkakrab/i.test(basename);
    if (!isAlkaKrab && /\.pdf$/i.test(basename)) {
      try {
        const bytes = await readFile(abs);
        isAlkaKrab = /alkakrab|alkakrab04|alanas buividas/i.test(bytes.subarray(0, 16384).toString("latin1"));
      } catch {
        isAlkaKrab = false;
      }
    }
    if (isAlkaKrab) packIds.add(musicPackId(rel));
  }
  return packIds;
}

function inferSoundKind(path: string): SoundSample["kind"] {
  const lower = path.toLowerCase();
  if (/(footstep|step|walk|run|jump|movement|grass|gravel)/.test(lower)) return "movement";
  if (/(hit|impact|slash|attack|weapon|arrow|explosion|laser|shoot|hurt|damage)/.test(lower)) return "combat";
  if (/(ui|click|button|select|menu|confirm|coin|pickup|notification)/.test(lower)) return "ui";
  if (/(ambient|wind|rain|forest|water|loop|room|drone)/.test(lower)) return "ambient";
  return "effect";
}

function scoreSoundSample(path: string): number {
  const lower = path.toLowerCase();
  let score = 0;
  if (/\.(wav|ogg|mp3)$/i.test(path)) score += 8;
  if (/(preview|sample|click|hit|impact|step|jump|attack|pickup|coin|spell|explosion|ambience|ambient)/.test(lower)) score += 10;
  if (/(readme|license)/.test(lower)) score -= 20;
  return score;
}

async function main() {
  const artRoot = join(ASSETS_ROOT, "2D");
  const soundRoot = join(ASSETS_ROOT, "sounds");
  const artSamples: ArtSample[] = [];
  const soundSamples: SoundSample[] = [];
  const musicTracks: MusicTrackAsset[] = [];

  if (existsSync(artRoot) || existsSync(join(ASSETS_ROOT, "kenney", "2D"))) {
    const packDirs = await discoverArtPackDirs(ASSETS_ROOT);

    for (const { packFolder, dir: packDir } of packDirs) {
      const images = await walk(
        packDir,
        (path, name) => !isJunkPath(path) && /\.(png|jpe?g|webp|gif)$/i.test(name),
      );
      const filteredImages = dropGifsWithSheetSiblings(images);
      const relImages = filteredImages.map((abs) => relative(ASSETS_ROOT, abs).split("/").join("/"));
      const inspections = new Map<string, ArtInspection>();
      for (const abs of filteredImages) {
        const rel = relative(ASSETS_ROOT, abs).split("/").join("/");
        try {
          const inspection = await inspectArtImageCached(IMAGE_INSPECT_CACHE, abs, rel);
          inspections.set(rel, {
            width: inspection.width,
            height: inspection.height,
            bgKind: inspection.bgKind,
            bgColor: inspection.bgColor,
            alphaCoverage: inspection.alphaCoverage,
            transparentCoverage: inspection.transparentCoverage,
            contentRowRuns: inspection.contentRowRuns,
            contentColRuns: inspection.contentColRuns,
            promoBackground: inspection.promoBackground,
            spriteSheetGrid: inspection.spriteSheetGrid,
            uniformGrid: inspection.uniformGrid,
            cellMedianWidth: inspection.cellMedianWidth,
            cellMedianHeight: inspection.cellMedianHeight,
          });
        } catch (err) {
          console.warn(`[media-assets] inspect failed for ${rel}: ${(err as Error).message}`);
        }
      }
      const selectionInput = relImages.map((path) => ({ path, inspection: inspections.get(path) }));
      for (const rel of selectDisplayArtSamples(selectionInput)) {
        const inspection = inspections.get(rel);
        const kind = inferArtKind(rel);
        const promo = isLikelyPromoArt(rel, inspection);
        artSamples.push({
          packFolder,
          path: rel,
          src: `/${rel.split("/").map(encodeURIComponent).join("/")}`,
          label: labelFromAssetPath(rel),
          kind,
          animated: isAnimatedArt(rel, inspection),
          inspection,
          promo,
        });
      }
    }
    await flushInspectionCache(IMAGE_INSPECT_CACHE);
  }

  if (existsSync(soundRoot)) {
    const sounds = await walk(
      soundRoot,
      (path, name) => !isJunkPath(path) && AUDIO_EXT_PATTERN.test(name),
    );
    const byCollection = new Map<string, string[]>();
    const musicCandidates = new Map<string, string>();
    const alkaKrabPackIds = await discoverAlkaKrabMusicPacks(join(soundRoot, "music"));

    for (const abs of sounds) {
      const rel = relative(ASSETS_ROOT, abs).split("/").join("/");
      if (rel.startsWith("sounds/music/")) {
        const key = musicDedupeKey(rel);
        const current = musicCandidates.get(key);
        if (!current || scoreMusicFile(rel) > scoreMusicFile(current) || (scoreMusicFile(rel) === scoreMusicFile(current) && rel.localeCompare(current) < 0)) {
          musicCandidates.set(key, rel);
        }
        continue;
      }
      const parts = rel.split("/");
      const collectionId = parts.length >= 4 ? `${parts[0]}/${parts[1]}/${parts[2]}/**` : `${parts.slice(0, -1).join("/")}/**`;
      const list = byCollection.get(collectionId) ?? [];
      list.push(abs);
      byCollection.set(collectionId, list);
    }

    for (const [collectionId, files] of [...byCollection.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      for (const abs of files
        .sort((a, b) => scoreSoundSample(b) - scoreSoundSample(a) || a.localeCompare(b))
        .slice(0, 6)) {
        const rel = relative(ASSETS_ROOT, abs).split("/").join("/");
        soundSamples.push({
          collectionId,
          path: rel,
          src: `/${rel.split("/").map(encodeURIComponent).join("/")}`,
          label: labelFromAssetPath(rel),
          kind: inferSoundKind(rel),
        });
      }
    }

    for (const rel of [...musicCandidates.values()].sort((a, b) => a.localeCompare(b))) {
      const packId = musicPackId(rel);
      const inferred = inferMusicSource(rel, alkaKrabPackIds);
      musicTracks.push({
        path: rel,
        src: `/${rel.split("/").map(encodeURIComponent).join("/")}`,
        title: musicTitle(rel),
        packId,
        packTitle: musicPackTitle(packId),
        ...inferred,
      });
    }
  }

  if (!existsSync(artRoot) && !existsSync(soundRoot) && existsSync(OUT)) {
    console.warn(`[media-assets] no assets found at ${ASSETS_ROOT}; keeping existing ${relative(SHOWCASE_DIR, OUT)}`);
    return;
  }

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify({ artSamples, soundSamples, musicTracks }, null, 2)}\n`);
  console.log(`[media-assets] ${artSamples.length} art samples · ${soundSamples.length} sound samples · ${musicTracks.length} music tracks`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
