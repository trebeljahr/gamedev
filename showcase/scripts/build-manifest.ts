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
const OUT = join(SHOWCASE_DIR, "src", "lib", "manifest.json");
const BBOX_CACHE = join(SHOWCASE_DIR, ".manifest-bbox-cache.json");

const SKIP_PACKS = new Set(["mixamo-library"]);

// Vendors where we should prefer source files over the optimized GLBs.
const PREFER_SOURCE = new Set(["kaykit"]);

// getBounds returns the bind-pose (static) bbox. For rigged/skinned meshes
// the bind pose puts arms out (T-pose) and sometimes up, so a 2m human
// comes back with a 5×4.8m bbox. The runtime idle pose is much narrower.
// When a Skin is present we clamp horizontal extents to RIGGED_HORIZ_RATIO ×
// the height — a typical person at idle is ~0.4 wide for a 2m height.
const RIGGED_HORIZ_RATIO = 0.5;

// Per-model size we serialize: [width X, height Y, depth Z] + min Y so we
// can ground the model on a base.
type Size = [number, number, number];

type Model = {
  name: string;
  file: string;
  label: string;
  size: Size;
  minY: number;
  cxz: [number, number];
};
type Pack = {
  id: string;
  vendor: string;
  pack: string;
  label: string;
  count: number;
  models: Model[];
};

async function walk(dir: string, predicate: (name: string) => boolean): Promise<string[]> {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop()!;
    for (const entry of await readdir(d, { withFileTypes: true })) {
      const p = join(d, entry.name);
      if (entry.isDirectory()) stack.push(p);
      else if (entry.isFile() && predicate(entry.name)) out.push(p);
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

function urlFor(absPath: string, base: string, urlPrefix: string): string {
  return `${urlPrefix}/${relative(base, absPath).split("/").map(encodeURIComponent).join("/")}`;
}

function modelKey(file: string): string {
  // Strip .gltf, .gltf.glb, .glb for dedup/display
  return file.replace(/\.gltf\.glb$/i, "").replace(/\.gltf$/i, "").replace(/\.glb$/i, "");
}

/* -------- bbox extraction + cache ----------------------------------------
 * Cache shape: { [absPath]: { mtime, size, minY } }. Keyed by absolute path
 * so files in models/ and glb-optimized/ have distinct entries; invalidated
 * when the file's mtime no longer matches. */

// Bump when the bbox computation changes (clamp ratios, min dims, etc.) so
// existing caches are invalidated automatically without rm/mv.
const CACHE_VERSION = 3;

type CacheEntry = {
  v: number;
  mtime: number;
  size: Size;
  minY: number;
  // Bbox centre in local model coords (X, Z). GLB origins aren't always at
  // the model's XZ centre; storing this lets the renderer position the
  // model so its bbox sits on the centre of its cell, with no overlap of
  // neighbouring cells.
  cxz: [number, number];
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

function clampRiggedHoriz(size: Size): Size {
  const [x, y, z] = size;
  const maxHoriz = y * RIGGED_HORIZ_RATIO;
  return [Math.min(x, maxHoriz), y, Math.min(z, maxHoriz)];
}

// Models flatter than this in any axis get bumped up so they still get a
// visible base plate (some kenney pieces have one axis effectively zero).
const MIN_DIM = 0.3;

async function computeBbox(
  absPath: string,
  io: NodeIO,
): Promise<{ size: Size; minY: number; cxz: [number, number] }> {
  const doc = await io.read(absPath);
  const root = doc.getRoot();
  const scene = root.getDefaultScene() || root.listScenes()[0];
  if (!scene) return { size: [1, 1, 1], minY: 0, cxz: [0, 0] };
  const b = getBounds(scene);
  const size: Size = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
  for (let i = 0; i < 3; i++) {
    if (!Number.isFinite(size[i]) || size[i] < MIN_DIM) size[i] = MIN_DIM;
  }
  const rigged = root.listSkins().length > 0;
  // For rigged models we clamped the bind-pose width down to roughly idle-
  // pose proportions; pretend the centre is at the rig root so the visible
  // character lands in the middle of its cell.
  const cxz: [number, number] = rigged
    ? [0, 0]
    : [(b.min[0] + b.max[0]) / 2, (b.min[2] + b.max[2]) / 2];
  return { size: rigged ? clampRiggedHoriz(size) : size, minY: b.min[1], cxz };
}

/* -------- model discovery ------------------------------------------------ */

async function findSourceModels(vendor: string, pack: string): Promise<string[]> {
  const packDir = join(MODELS_ROOT, vendor, pack);
  if (!existsSync(packDir)) return [];
  const all = await walk(packDir, (n) => {
    const lower = n.toLowerCase();
    return lower.endsWith(".gltf") || lower.endsWith(".glb");
  });
  const filtered = all.filter((p) => !/\/animations?\//i.test(p));
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

/* -------- main ----------------------------------------------------------- */

async function main() {
  if (!existsSync(GLB_ROOT)) {
    // Worktrees (and fresh checkouts) don't have the gitignored assets on
    // disk. Emit an empty manifest so `next dev` / `next build` don't
    // explode — the showcase just renders zero packs.
    console.warn(
      `[manifest] assets/glb/ not found at ${GLB_ROOT}; emitting empty manifest. ` +
        `Run \`pnpm assets:sync\` or download payloads to populate.`,
    );
    await mkdir(dirname(OUT), { recursive: true });
    await writeFile(OUT, JSON.stringify({ packs: [] }, null, 2));
    return;
  }

  const io = new NodeIO();
  const cache = await loadCache();
  const nextCache: Cache = {};

  const vendors = (await readdir(GLB_ROOT, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const packs: Pack[] = [];
  const stats = { source: 0, optimized: 0, cacheHits: 0, computed: 0, failed: 0 };

  for (const vendor of vendors) {
    if (SKIP_PACKS.has(vendor)) continue;
    const vendorDir = join(GLB_ROOT, vendor);
    const packDirs = (await readdir(vendorDir, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();

    for (const pack of packDirs) {
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
        abs = await findOptimizedModels(vendor, pack);
      }
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
              cxz: bb.cxz,
            };
            stats.computed++;
          } catch (err) {
            stats.failed++;
            entry = {
              v: CACHE_VERSION,
              mtime,
              size: [1, 1, 1],
              minY: 0,
              cxz: [0, 0],
            };
            console.warn(`[manifest] bbox failed for ${relative(ASSETS_ROOT, a)}: ${(err as Error).message}`);
          }
        }
        nextCache[a] = entry;
        const name = modelKey(a.split("/").pop()!);
        models.push({
          name,
          file: urlFor(a, base, urlPrefix),
          label: humanize(name),
          size: entry.size,
          minY: entry.minY,
          cxz: entry.cxz,
        });
      }
      models.sort((a, b) => a.label.localeCompare(b.label));

      if (usedSource) stats.source += models.length;
      else stats.optimized += models.length;

      packs.push({
        id: `${vendor}/${pack}`,
        vendor,
        pack,
        label: humanize(pack),
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
