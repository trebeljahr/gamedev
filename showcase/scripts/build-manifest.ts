/**
 * Walks the asset tree and emits src/lib/manifest.json.
 *
 * Per-model the manifest carries a *real* bounding box (computed via
 * @gltf-transform/core, cached by file mtime), so the /all view can place
 * each model on a base sized to its actual XZ footprint rather than
 * normalizing every model into a fixed unit cube.
 *
 * Source preference for kaykit packs is unchanged: the FBX→GLB conv3d
 * pipeline lost the texture atlas, so we prefer the original gltf+bin+png
 * tree on disk:
 *   1. models/<vendor>/<pack>/extracted/**\/Assets/gltf/*.gltf  (loose: gltf + bin + png)
 *   2. models/<vendor>/<pack>/extracted/**\/*.gltf.glb          (older kaykit, self-contained)
 *   3. fall back to glb-optimized/<vendor>/<pack>/**\/*.glb
 *
 * URLs:
 *   - source files: /raw/<rel-to-models>
 *   - optimized:    /glb/<rel-to-glb-optimized>
 */
import { existsSync } from "node:fs";
import { readdir, readFile, stat, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { NodeIO, getBounds } from "@gltf-transform/core";
import { KHRDracoMeshCompression } from "@gltf-transform/extensions";
import draco3d from "draco3d";
import {
  buildModelMetadata,
  buildPackMetadata,
  cleanAssetTitle,
  type ModelCategory,
} from "../src/lib/catalog-metadata";
import type { ArtInspection } from "../src/lib/media-inference";
import {
  dedupeExtractedMirrors,
  inferArtKind,
  isAnimatedArt,
  isLikelyPromoArt,
  selectDisplayArtSamples,
  stripBuiltSheetSuffix,
} from "../src/lib/media-inference";
import { flushInspectionCache, inspectArtImageCached } from "./inspect-art-image";
import { buildPackPreviewMetadata } from "../src/lib/preview-model";
import type { PackPreview } from "../src/lib/manifest";

const SHOWCASE_DIR = join(__dirname, "..");
const REPO_ROOT = join(SHOWCASE_DIR, "..");
// All asset payloads now live under <repo>/assets/, mirrored 1:1 to the
// R2 bucket. The on-disk folder names match the URL prefixes the
// showcase emits (assets/glb → /glb/…, assets/raw → /raw/…) so local
// dev (scripts/serve-assets.mjs) and prod (R2 custom domain) read the
// same URL shape.
const ASSETS_ROOT = process.env.ASSETS_DIR
  ? process.env.ASSETS_DIR
  : join(REPO_ROOT, "assets");
const GLB_ROOT = join(ASSETS_ROOT, "glb");
const MODELS_ROOT = join(ASSETS_ROOT, "raw");
const OUT = join(SHOWCASE_DIR, "public", "manifest.json");
const MEDIA_OUT = join(SHOWCASE_DIR, "src", "lib", "media-assets.json");
const BBOX_CACHE = join(SHOWCASE_DIR, ".manifest-bbox-cache.json");
const IMAGE_INSPECT_CACHE = join(SHOWCASE_DIR, ".cache", "image-inspect.json");

const SKIP_PACKS = new Set(["mixamo-library"]);
const NON_COMMERCIAL_ART_PACKS = new Set([
  "bdragon1727-fire-pixel-bullet-16x16",
  "bdragon1727-free-smoke-fx-pixel-2",
]);
const NON_COMMERCIAL_MODEL_PATTERNS: RegExp[] = [
  /(^|\/)gltf\/buster-drone\//i,
  /(^|\/)glb\/model-\d+[a-z]-/i,
];

// Vendors where we should prefer source files over the optimized GLBs.
const PREFER_SOURCE = new Set(["kaykit"]);

// Per-model size we serialize: [width X, height Y, depth Z] + min Y so we
// can ground the model on a base.
type Size = [number, number, number];

type Model = {
  name: string;
  file: string;
  downloads: ModelDownload[];
  title: string;
  category: ModelCategory;
  subcategory: string;
  style: string[];
  themes: string[];
  tags: string[];
  size: Size;
  minY: number;
};
type ModelDownload = {
  format: string;
  file: string;
  optimized?: boolean;
};
type Pack = {
  id: string;
  vendor: string;
  pack: string;
  title: string;
  categories: ModelCategory[];
  style: string[];
  themes: string[];
  tags: string[];
  source: string;
  license: string;
  preview?: PackPreview;
  count: number;
  models: Model[];
};
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
type ArtPackDir = {
  packFolder: string;
  dir: string;
};

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
  return cleanAssetTitle(s);
}

function urlFor(absPath: string, base: string, urlPrefix: string): string {
  return `${urlPrefix}/${relative(base, absPath).split("/").map(encodeURIComponent).join("/")}`;
}

function isJunkMediaPath(path: string): boolean {
  return /(^|\/)(__MACOSX|\.DS_Store)(\/|$)/i.test(path) || /(^|\/)\._/.test(path);
}

/**
 * Drop gif files when a sibling `<name>__strip-WxH.sheet.png` exists (produced
 * by build-gif-sheets.ts). The static strip is the displayable form; the gif
 * stays on disk as the source of truth.
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

async function addArtPackDirsFromRoot(
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

  await addArtPackDirsFromRoot(out, itchRoot, (name) => name);
  out.delete("kenney");
  await addArtPackDirsFromRoot(out, join(assetsRoot, "2D", "kenney"), (name) => `2D/kenney/${name}`);

  return [...out.values()].sort((a, b) => a.packFolder.localeCompare(b.packFolder));
}

function labelFromAssetPath(path: string): string {
  return humanize(
    stripBuiltSheetSuffix(path.split("/").pop()!)
      .replace(/\.[^.]+$/i, "")
      .replace(/^\d+__.+?__/, ""),
  );
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
  if (/(preview|sample|click|hit|impact|step|jump|attack|pickup|coin|spell|explosion)/.test(lower)) score += 10;
  if (/(readme|license)/.test(lower)) score -= 20;
  return score;
}

function isNonCommercialModelPath(path: string): boolean {
  const normalized = path.split("\\").join("/");
  return NON_COMMERCIAL_MODEL_PATTERNS.some((pattern) => pattern.test(normalized));
}

async function writeEmptyMediaManifestIfNeeded(): Promise<void> {
  if (existsSync(MEDIA_OUT)) return;
  await mkdir(dirname(MEDIA_OUT), { recursive: true });
  await writeFile(MEDIA_OUT, JSON.stringify({ artSamples: [], soundSamples: [] }, null, 2));
}

async function writeMediaManifest(): Promise<void> {
  const artRoot = join(ASSETS_ROOT, "2D");
  const soundRoot = join(ASSETS_ROOT, "sounds");
  const artSamples: ArtSample[] = [];
  const soundSamples: SoundSample[] = [];

  if (existsSync(artRoot) || existsSync(join(ASSETS_ROOT, "kenney", "2D"))) {
    const packDirs = await discoverArtPackDirs(ASSETS_ROOT);
    const totalPacks = packDirs.length;
    const packPadWidth = String(totalPacks).length;
    console.log(`[media] inspecting ${totalPacks} art pack(s)`);

    for (let packIndex = 0; packIndex < totalPacks; packIndex += 1) {
      const { packFolder, dir: packDir } = packDirs[packIndex];
      const packCounter = `${String(packIndex + 1).padStart(packPadWidth, " ")}/${totalPacks}`;
      const packStart = Date.now();
      const images = await walk(
        packDir,
        (path, name) => !isJunkMediaPath(path) && /\.(png|jpe?g|webp|gif)$/i.test(name),
      );
      const filteredImages = dropGifsWithSheetSiblings(images);
      const imagePairs = dedupeExtractedMirrors(
        filteredImages.map((abs) => ({ abs, path: relative(ASSETS_ROOT, abs).split("/").join("/") })),
      );
      const relImages = imagePairs.map((pair) => pair.path);
      process.stdout.write(
        `[media] ${packCounter} ▶ ${packFolder} (${imagePairs.length} image${imagePairs.length === 1 ? "" : "s"})\n`,
      );
      const inspections = new Map<string, ArtInspection>();
      let inspected = 0;
      for (const { abs, path: rel } of imagePairs) {
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
          console.warn(`[manifest] inspect failed for ${rel}: ${(err as Error).message}`);
        }
        inspected += 1;
        if (inspected % 200 === 0) {
          process.stdout.write(
            `[media] ${packCounter}   inspected ${inspected}/${imagePairs.length} in ${Date.now() - packStart}ms…\n`,
          );
        }
      }
      const selectionInput = relImages.map((path) => ({ path, inspection: inspections.get(path) }));
      let packSamples = 0;
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
        packSamples += 1;
      }
      process.stdout.write(
        `[media] ${packCounter} ✓ ${packFolder} · ${packSamples} samples · ${Date.now() - packStart}ms\n`,
      );
    }
    await flushInspectionCache(IMAGE_INSPECT_CACHE);
  }

  if (existsSync(soundRoot)) {
    const sounds = await walk(
      soundRoot,
      (path, name) => !isJunkMediaPath(path) && /\.(mp3|wav|ogg|m4a|flac|opus)$/i.test(name),
    );
    const byCollection = new Map<string, string[]>();
    for (const abs of sounds) {
      const rel = relative(ASSETS_ROOT, abs).split("/").join("/");
      if (rel.startsWith("sounds/music/")) continue;
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
  }

  if (!existsSync(artRoot) && !existsSync(soundRoot) && existsSync(MEDIA_OUT)) return;

  await mkdir(dirname(MEDIA_OUT), { recursive: true });
  await writeFile(MEDIA_OUT, JSON.stringify({ artSamples, soundSamples }, null, 2));
  console.log(
    `[media] ${artSamples.length} art samples · ${soundSamples.length} sound samples → ${relative(SHOWCASE_DIR, MEDIA_OUT)}`,
  );
}

function modelKey(file: string): string {
  // Strip .gltf, .gltf.glb, .glb for dedup/display
  return file.replace(/\.gltf\.glb$/i, "").replace(/\.gltf$/i, "").replace(/\.glb$/i, "");
}

// Cross-format match key: strip any known model extension, lowercase, and
// normalize `_`/space to `-` so a kaykit `arrow_bow.fbx` collapses to the
// same key as its sibling `arrow-bow.gltf`. Without this the FBX/OBJ
// downloads never attach to their gltf/glb counterpart and the catalog
// download menu stays GLB-only.
function matchKey(file: string): string {
  const name = file.split("/").pop()!;
  const stripped = name
    .replace(/\.gltf\.glb$/i, "")
    .replace(/\.(gltf|glb|fbx|obj)$/i, "");
  return stripped.toLowerCase().replace(/[\s_]+/g, "-");
}

/* -------- bbox extraction + cache ----------------------------------------
 * Cache shape: { [absPath]: { mtime, size, minY } }. Keyed by absolute path
 * so files in models/ and glb-optimized/ have distinct entries; invalidated
 * when the file's mtime no longer matches. */

// Bump when the bbox computation changes (clamp ratios, min dims, etc.) so
// existing caches are invalidated automatically without rm/mv.
// v4: register Draco decoder so `-transformed.glb` files (Draco-compressed,
// most Quaternius packs) compute real bboxes instead of falling back to
// [1,1,1] — was making pedestals undersized and models overlap.
// v5: drop the rigged horizontal clamp. Nothing animates until a model is
// selected, so every model renders at its bind pose and `size` must equal
// the real bind-pose bbox. The old y*0.5 clamp squashed the long axis of
// non-humanoid rigs — Quaternius tanks/dinosaurs got a tiny square footprint
// under a multi-metre model (overlap on /all, wrong maxDim on the landing
// grid). getBounds already returns exactly what three.js draws at bind pose.
// v6: sanitize out-of-range texture sampler refs before read (see
// sanitizeGlbSamplers). Two Quaternius woman-animated GLBs threw on io.read
// and cached a [1,1,1] fallback; bump invalidates those so they recompute.
const CACHE_VERSION = 6;

type CacheEntry = {
  v: number;
  mtime: number;
  size: Size;
  minY: number;
};
type Cache = Record<string, CacheEntry>;

async function loadCache(): Promise<Cache> {
  if (!existsSync(BBOX_CACHE)) return {};
  try {
    return JSON.parse(await readFile(BBOX_CACHE, "utf8")) as Cache;
  } catch {
    return {};
  }
}

async function saveCache(c: Cache): Promise<void> {
  await writeFile(BBOX_CACHE, JSON.stringify(c));
}

// Models flatter than this in any axis get bumped up so they still get a
// visible base plate (some kenney pieces have one axis effectively zero).
const MIN_DIM = 0.3;

const GLB_MAGIC = 0x46546c67;
const GLB_CHUNK_JSON = 0x4e4f534a;

// A couple Quaternius GLBs (woman-animated-dec-2017) carry a texture whose
// `sampler` index points past the end of the samplers array. gltf-transform's
// reader does `samplers[textureDef.sampler].magFilter` and throws "Cannot read
// properties of undefined (reading 'magFilter')", so io.read aborts before
// getBounds can run and the model falls back to a [1,1,1] bbox (wrong scale on
// /all + pack pages). bbox only needs geometry, so strip the dangling sampler
// references — the glTF reader skips textures with no sampler — and hand the
// repacked GLB to io.readBinary. Returns null when the file is not a GLB or has
// nothing to repair, so the caller re-throws the original read error.
function sanitizeGlbSamplers(bytes: Uint8Array): Uint8Array | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 12 || view.getUint32(0, true) !== GLB_MAGIC) return null;
  const chunks: { type: number; data: Uint8Array }[] = [];
  let off = 12;
  while (off + 8 <= bytes.length) {
    const len = view.getUint32(off, true);
    const type = view.getUint32(off + 4, true);
    chunks.push({ type, data: bytes.subarray(off + 8, off + 8 + len) });
    off += 8 + len;
  }
  const jsonChunk = chunks.find((c) => c.type === GLB_CHUNK_JSON);
  if (!jsonChunk) return null;
  const json = JSON.parse(Buffer.from(jsonChunk.data).toString("utf8"));
  const samplers: unknown[] = Array.isArray(json.samplers) ? json.samplers : [];
  let patched = false;
  for (const tex of json.textures ?? []) {
    if (typeof tex.sampler === "number" && samplers[tex.sampler] === undefined) {
      delete tex.sampler;
      patched = true;
    }
  }
  if (!patched) return null;

  let jsonBytes: Buffer = Buffer.from(JSON.stringify(json), "utf8");
  const pad = (4 - (jsonBytes.length % 4)) % 4;
  if (pad) jsonBytes = Buffer.concat([jsonBytes, Buffer.alloc(pad, 0x20)]);
  jsonChunk.data = jsonBytes;

  const total = 12 + chunks.reduce((n, c) => n + 8 + c.data.length, 0);
  const out = Buffer.alloc(total);
  out.writeUInt32LE(GLB_MAGIC, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  let p = 12;
  for (const c of chunks) {
    out.writeUInt32LE(c.data.length, p);
    out.writeUInt32LE(c.type, p + 4);
    Buffer.from(c.data).copy(out, p + 8);
    p += 8 + c.data.length;
  }
  return out;
}

async function readDocResilient(absPath: string, io: NodeIO) {
  try {
    return await io.read(absPath);
  } catch (err) {
    if (!absPath.toLowerCase().endsWith(".glb")) throw err;
    const repaired = sanitizeGlbSamplers(await readFile(absPath));
    if (!repaired) throw err;
    return io.readBinary(repaired);
  }
}

async function computeBbox(
  absPath: string,
  io: NodeIO,
): Promise<{ size: Size; minY: number }> {
  const doc = await readDocResilient(absPath, io);
  const root = doc.getRoot();
  const scene = root.getDefaultScene() || root.listScenes()[0];
  if (!scene) return { size: [1, 1, 1], minY: 0 };
  const b = getBounds(scene);
  const size: Size = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
  for (let i = 0; i < 3; i++) {
    if (!Number.isFinite(size[i]) || size[i] < MIN_DIM) size[i] = MIN_DIM;
  }
  return { size, minY: b.min[1] };
}

/* -------- model discovery ------------------------------------------------ */

async function findSourceModels(vendor: string, pack: string): Promise<string[]> {
  const packDir = join(MODELS_ROOT, vendor, pack);
  if (!existsSync(packDir)) return [];
  const all = await findSourceDownloadFiles(vendor, pack);
  const filtered = all.filter((p) => {
    const lower = p.toLowerCase();
    return !/\/animations?\//i.test(p) && (lower.endsWith(".gltf") || lower.endsWith(".glb"));
  });
  if (filtered.length === 0) return [];
  const rank = (path: string) => {
    const lower = path.toLowerCase();
    if (lower.endsWith(".gltf")) return 0;
    if (lower.endsWith(".gltf.glb")) return 1;
    return 2;
  };
  const byName = new Map<string, string>();
  for (const abs of filtered) {
    const key = modelKey(abs.split("/").pop()!).toLowerCase();
    const cur = byName.get(key);
    if (!cur || rank(abs) < rank(cur)) byName.set(key, abs);
  }
  return [...byName.values()];
}

async function findOptimizedModels(vendor: string, pack: string): Promise<string[]> {
  const packDir = join(GLB_ROOT, vendor, pack);
  if (!existsSync(packDir)) return [];
  return walk(packDir, (n) => n.toLowerCase().endsWith(".glb"));
}

// Surface only the four formats users actually ship with — Blender/Collada
// sources stay on disk but bloat the manifest (~3k extra entries) without
// matching what the catalog advertises.
const SOURCE_DOWNLOAD_EXTENSIONS = [".gltf", ".glb", ".fbx", ".obj"];

async function findSourceDownloadFiles(vendor: string, pack: string): Promise<string[]> {
  const packDir = join(MODELS_ROOT, vendor, pack);
  if (!existsSync(packDir)) return [];
  return walk(packDir, (_path, name) => {
    const lower = name.toLowerCase();
    return SOURCE_DOWNLOAD_EXTENSIONS.some((ext) => lower.endsWith(ext));
  });
}

function groupByModelKey(paths: string[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const path of paths) {
    const key = matchKey(path);
    const list = out.get(key) ?? [];
    list.push(path);
    out.set(key, list);
  }
  for (const list of out.values()) list.sort((a, b) => a.localeCompare(b));
  return out;
}

function formatForPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".gltf")) return "gltf";
  return lower.match(/\.([a-z0-9]+)$/)?.[1] ?? "file";
}

function buildModelDownloads(
  modelAbsPath: string,
  optimizedByKey: Map<string, string[]>,
  sourceByKey: Map<string, string[]>,
): ModelDownload[] {
  const key = matchKey(modelAbsPath);
  const downloads: ModelDownload[] = [];
  const seen = new Set<string>();
  const seenFormatVariants = new Set<string>();

  function add(absPath: string, base: string, urlPrefix: string, optimized: boolean) {
    const file = urlFor(absPath, base, urlPrefix);
    const format = formatForPath(absPath);
    const formatVariant = `${optimized ? "optimized" : "source"}:${format}`;
    if (seen.has(file)) return;
    if (seenFormatVariants.has(formatVariant)) return;
    seen.add(file);
    seenFormatVariants.add(formatVariant);
    downloads.push({
      format,
      file,
      optimized,
    });
  }

  for (const optimized of optimizedByKey.get(key) ?? []) add(optimized, GLB_ROOT, "/glb", true);
  for (const source of sourceByKey.get(key) ?? []) add(source, MODELS_ROOT, "/raw", false);
  if (downloads.length === 0) {
    const inGlbRoot = modelAbsPath.startsWith(GLB_ROOT);
    add(modelAbsPath, inGlbRoot ? GLB_ROOT : MODELS_ROOT, inGlbRoot ? "/glb" : "/raw", inGlbRoot);
  }

  return downloads.sort((a, b) => {
    if (a.optimized !== b.optimized) return a.optimized ? -1 : 1;
    return a.format.localeCompare(b.format);
  });
}

/* -------- main ----------------------------------------------------------- */

async function main() {
  await writeMediaManifest();
  await writeEmptyMediaManifestIfNeeded();

  if (!existsSync(GLB_ROOT)) {
    // Worktrees (and fresh checkouts) don't have the gitignored assets on
    // disk. If a previously-generated manifest is checked in (the CI
    // Docker build case — assets/ is gitignored so the build context
    // never has them) leave it alone, so the deployed bundle keeps the
    // pack list it was built with instead of getting clobbered to empty
    // by the prebuild hook. Only emit an empty manifest when nothing
    // has been generated yet — keeps `next dev` from exploding on a
    // truly fresh checkout.
    if (existsSync(OUT)) {
      console.warn(
        `[manifest] assets/glb/ not found at ${GLB_ROOT}; keeping existing ${relative(SHOWCASE_DIR, OUT)} ` +
          `(run \`pnpm assets:sync\` then \`pnpm manifest\` to refresh).`,
      );
      return;
    }
    console.warn(
      `[manifest] assets/glb/ not found at ${GLB_ROOT} and no existing manifest; emitting empty. ` +
        `Run \`pnpm assets:sync\` or download payloads to populate.`,
    );
    await mkdir(dirname(OUT), { recursive: true });
    await writeFile(OUT, JSON.stringify({ packs: [] }, null, 2));
    return;
  }

  // Register the Draco decoder so we can read `*-transformed.glb` files
  // emitted by the glb-optimize pipeline (most Quaternius packs use Draco
  // mesh compression). Without this, `io.read` throws "Missing required
  // extension, KHR_draco_mesh_compression" and every bbox falls back to
  // [1,1,1] — visible as pedestals one unit wide under multi-metre models,
  // which overlap into neighbouring cells on the pack/all overviews.
  const io = new NodeIO()
    .registerExtensions([KHRDracoMeshCompression])
    .registerDependencies({
      "draco3d.decoder": await draco3d.createDecoderModule(),
    });
  const cache = await loadCache();
  const nextCache: Cache = {};

  const vendors = (await readdir(GLB_ROOT, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const packs: Pack[] = [];
  const stats = { source: 0, optimized: 0, cacheHits: 0, computed: 0, failed: 0 };

  console.log(`[manifest] scanning ${vendors.length} vendor(s) under ${relative(SHOWCASE_DIR, GLB_ROOT)}`);
  for (const vendor of vendors) {
    if (SKIP_PACKS.has(vendor)) continue;
    const vendorDir = join(GLB_ROOT, vendor);
    const packDirs = (await readdir(vendorDir, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    process.stdout.write(`[manifest] ▶ vendor ${vendor} (${packDirs.length} pack${packDirs.length === 1 ? "" : "s"})\n`);

    for (const pack of packDirs) {
      const packStart = Date.now();
      const sourceDownloads = (await findSourceDownloadFiles(vendor, pack)).filter(
        (path) => !/\/animations?\//i.test(path) && !isNonCommercialModelPath(relative(ASSETS_ROOT, path)),
      );
      const optimizedDownloads = (await findOptimizedModels(vendor, pack)).filter(
        (path) => !isNonCommercialModelPath(relative(ASSETS_ROOT, path)),
      );
      const sourceByKey = groupByModelKey(sourceDownloads);
      const optimizedByKey = groupByModelKey(optimizedDownloads);
      let abs: string[] = [];
      let usedSource = false;
      let base = GLB_ROOT;
      let urlPrefix = "/glb";
      if (PREFER_SOURCE.has(vendor)) {
        abs = await findSourceModels(vendor, pack);
        if (abs.length > 0) {
          usedSource = true;
          base = MODELS_ROOT;
          urlPrefix = "/raw";
        }
      }
      if (abs.length === 0) {
        abs = optimizedDownloads;
      }
      abs = abs.filter((path) => !isNonCommercialModelPath(relative(ASSETS_ROOT, path)));
      if (abs.length === 0) continue;

      const models: Model[] = [];
      for (const a of abs) {
        const s = await stat(a);
        const mtime = s.mtimeMs;
        const cached = cache[a];
        let entry: CacheEntry;
        if (cached && cached.v === CACHE_VERSION && cached.mtime === mtime) {
          entry = cached;
          stats.cacheHits++;
        } else {
          try {
            const bb = await computeBbox(a, io);
            entry = {
              v: CACHE_VERSION,
              mtime,
              size: bb.size,
              minY: bb.minY,
            };
            stats.computed++;
          } catch (err) {
            stats.failed++;
            entry = {
              v: CACHE_VERSION,
              mtime,
              size: [1, 1, 1],
              minY: 0,
            };
            console.warn(`[manifest] bbox failed for ${relative(ASSETS_ROOT, a)}: ${(err as Error).message}`);
          }
        }
        nextCache[a] = entry;
        const name = modelKey(a.split("/").pop()!);
        const file = urlFor(a, base, urlPrefix);
        const metadata = buildModelMetadata({
          vendor,
          pack,
          packTitle: humanize(pack),
          name,
          file,
          size: entry.size,
        });
        models.push({
          name,
          file,
          downloads: buildModelDownloads(a, optimizedByKey, sourceByKey),
          ...metadata,
          size: entry.size,
          minY: entry.minY,
        });
      }
      models.sort((a, b) => a.title.localeCompare(b.title));

      if (usedSource) stats.source += models.length;
      else stats.optimized += models.length;

      process.stdout.write(
        `[manifest]   ✓ ${vendor}/${pack} · ${models.length} model${models.length === 1 ? "" : "s"} · ${Date.now() - packStart}ms\n`,
      );

      const packMetadata = buildPackMetadata({
        vendor,
        pack,
        count: models.length,
        models,
      });

      packs.push({
        id: `${vendor}/${pack}`,
        vendor,
        pack,
        ...packMetadata,
        preview: buildPackPreviewMetadata(models),
        count: models.length,
        models,
      });
    }
  }

  packs.sort((a, b) => a.id.localeCompare(b.id));

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify({ packs }, null, 2));
  await saveCache(nextCache);
  const total = packs.reduce((n, p) => n + p.count, 0);
  console.log(
    `[manifest] ${packs.length} packs · ${total} models ` +
      `(source: ${stats.source}, optimized: ${stats.optimized}, ` +
      `bbox: ${stats.cacheHits} cached / ${stats.computed} computed / ${stats.failed} failed) ` +
      `→ ${relative(SHOWCASE_DIR, OUT)}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
