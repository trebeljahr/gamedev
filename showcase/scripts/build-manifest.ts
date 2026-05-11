/**
 * Walks the asset tree and emits src/lib/manifest.json.
 *
 * For KAYKIT packs the FBX→GLB conversion (conv3d) lost the external texture
 * atlases, so optimized .glb files render with broken 1×1 textures. We
 * prefer the original source files when they're present:
 *   1. models/<vendor>/<pack>/extracted/**\/Assets/gltf/*.gltf  (loose: gltf + bin + png)
 *   2. models/<vendor>/<pack>/extracted/**\/*.gltf.glb          (older kaykit, self-contained)
 *   3. fall back to glb-optimized/<vendor>/<pack>/**\/*.glb
 *
 * URLs:
 *   - source files: /raw/<rel-to-models>
 *   - optimized:    /glb/<rel-to-glb-optimized>
 */
import { existsSync } from "node:fs";
import { readdir, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

const SHOWCASE_DIR = join(__dirname, "..");
const ASSETS_ROOT = join(SHOWCASE_DIR, "..");
const GLB_ROOT = join(ASSETS_ROOT, "glb-optimized");
const MODELS_ROOT = join(ASSETS_ROOT, "models");
const OUT = join(SHOWCASE_DIR, "src", "lib", "manifest.json");

const SKIP_PACKS = new Set(["mixamo-library"]);

// Vendors where we should prefer source files over the optimized GLBs.
// conv3d's FBX→GLB conversion drops external texture atlases for these.
const PREFER_SOURCE = new Set(["kaykit"]);

type Model = { name: string; file: string; label: string };
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

async function findSourceModels(vendor: string, pack: string): Promise<Model[]> {
  const packDir = join(MODELS_ROOT, vendor, pack);
  if (!existsSync(packDir)) return [];

  // Walk the entire source pack and grab .gltf / .gltf.glb / .glb.
  // Skip animation subdirs (they're rig-only files, not standalone models).
  const all = await walk(packDir, (n) => {
    const lower = n.toLowerCase();
    return lower.endsWith(".gltf") || lower.endsWith(".glb");
  });
  const filtered = all.filter((p) => !/\/animations?\//i.test(p));
  if (filtered.length === 0) return [];

  // Dedupe by basename, preferring .gltf (loose, has external map) >
  // .gltf.glb > .glb. This lets us pick the kaykit-authored "Barbarian.glb"
  // from Characters/gltf/ over the FBX-converted optimized one.
  const rank = (path: string) => {
    const lower = path.toLowerCase();
    if (lower.endsWith(".gltf")) return 0;
    if (lower.endsWith(".gltf.glb")) return 1;
    return 2; // .glb
  };
  const byName = new Map<string, string>();
  for (const abs of filtered) {
    const key = modelKey(abs.split("/").pop()!).toLowerCase();
    const cur = byName.get(key);
    if (!cur || rank(abs) < rank(cur)) byName.set(key, abs);
  }

  return [...byName.values()]
    .map((abs) => {
      const name = modelKey(abs.split("/").pop()!);
      return {
        name,
        file: urlFor(abs, MODELS_ROOT, "/raw"),
        label: humanize(name),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

async function findOptimizedModels(vendor: string, pack: string): Promise<Model[]> {
  const packDir = join(GLB_ROOT, vendor, pack);
  if (!existsSync(packDir)) return [];
  const glbs = await walk(packDir, (n) => n.toLowerCase().endsWith(".glb"));
  return glbs
    .map((abs) => {
      const name = modelKey(abs.split("/").pop()!);
      return { name, file: urlFor(abs, GLB_ROOT, "/glb"), label: humanize(name) };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

async function main() {
  if (!existsSync(GLB_ROOT)) {
    console.error(`[manifest] glb-optimized/ not found at ${GLB_ROOT}`);
    process.exit(1);
  }

  const vendors = (await readdir(GLB_ROOT, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const packs: Pack[] = [];
  const stats = { source: 0, optimized: 0 };

  for (const vendor of vendors) {
    if (SKIP_PACKS.has(vendor)) continue;
    const vendorDir = join(GLB_ROOT, vendor);
    const packDirs = (await readdir(vendorDir, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();

    for (const pack of packDirs) {
      let models: Model[] = [];
      let usedSource = false;
      if (PREFER_SOURCE.has(vendor)) {
        models = await findSourceModels(vendor, pack);
        usedSource = models.length > 0;
      }
      if (models.length === 0) {
        models = await findOptimizedModels(vendor, pack);
      }
      if (models.length === 0) continue;
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
  const total = packs.reduce((n, p) => n + p.count, 0);
  console.log(
    `[manifest] ${packs.length} packs · ${total} models (source: ${stats.source}, optimized: ${stats.optimized}) → ${relative(SHOWCASE_DIR, OUT)}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
