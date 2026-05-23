import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { buildArtItemIndex } from "../src/lib/art-items";
import type { ArtPack } from "../src/lib/media";

/**
 * Builds public/media-catalog/art-items.json — the slim per-asset search index
 * the 2D view fetches client-side. Reads the already-generated per-pack files
 * so it can run on its own without re-deriving the whole media catalog. The
 * same emission also runs inside build-media-catalog.ts for full refreshes.
 */
const showcaseDir = join(__dirname, "..");
const packsDir = join(showcaseDir, "public", "media-catalog", "packs");
const outPath = join(showcaseDir, "public", "media-catalog", "art-items.json");

async function main(): Promise<void> {
  const startedAt = Date.now();
  const entries = await readdir(packsDir);
  const packFiles = entries.filter((name) => name.endsWith(".json")).sort();

  const packs: ArtPack[] = [];
  for (const name of packFiles) {
    const raw = await readFile(join(packsDir, name), "utf8");
    packs.push(JSON.parse(raw) as ArtPack);
  }

  const index = buildArtItemIndex(packs);
  const payload = {
    description:
      "Per-asset search index for the 2D catalog. Each item is one sprite/image; animation frame runs are collapsed into a single item. Normalized + short-keyed wire format — expand with expandArtItemIndex; srcs are raw and resolved through assetUrl at render time.",
    stats: { packCount: index.packs.length, itemCount: index.items.length },
    packs: index.packs,
    items: index.items,
  };

  await writeFile(outPath, `${JSON.stringify(payload)}\n`);
  const elapsed = Date.now() - startedAt;
  console.log(
    `[art-items] wrote ${index.items.length} items from ${index.packs.length} packs → ${relative(showcaseDir, outPath)} in ${elapsed}ms`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
