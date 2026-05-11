/**
 * Walks the asset tree and emits src/lib/manifest.json.
 *
 * Output shape:
 *   {
 *     packs: [
 *       { id, vendor, pack, label, count, models: [{ name, file, label }] }
 *     ]
 *   }
 *
 * `file` is the URL path (under /glb/...) the browser fetches. The actual
 * bytes live outside the showcase app — see public/glb symlink.
 */
import { readdir, stat, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const SHOWCASE_DIR = join(__dirname, "..");
const ASSETS_ROOT = join(SHOWCASE_DIR, "..");
const GLB_ROOT = join(ASSETS_ROOT, "glb-optimized");
const OUT = join(SHOWCASE_DIR, "src", "lib", "manifest.json");

// vendors with opaque-hash filenames — browseable but low-signal as a grid
const SKIP_PACKS = new Set(["mixamo-library"]);

type Model = { name: string; file: string; label: string };
type Pack = {
  id: string;
  vendor: string;
  pack: string;
  label: string;
  count: number;
  models: Model[];
};

async function walk(dir: string, out: string[] = []): Promise<string[]> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) await walk(p, out);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".glb")) out.push(p);
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

  for (const vendor of vendors) {
    if (SKIP_PACKS.has(vendor)) continue;
    const vendorDir = join(GLB_ROOT, vendor);
    const packDirs = (await readdir(vendorDir, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();

    for (const pack of packDirs) {
      const packDir = join(vendorDir, pack);
      const glbs = await walk(packDir);
      if (glbs.length === 0) continue;

      const models: Model[] = glbs
        .map((abs) => {
          const rel = relative(GLB_ROOT, abs);
          const name = abs.split("/").pop()!.replace(/\.glb$/i, "");
          return {
            name,
            file: `/glb/${rel.split("/").map(encodeURIComponent).join("/")}`,
            label: humanize(name),
          };
        })
        .sort((a, b) => a.label.localeCompare(b.label));

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
  console.log(`[manifest] ${packs.length} packs · ${total} models → ${relative(SHOWCASE_DIR, OUT)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
