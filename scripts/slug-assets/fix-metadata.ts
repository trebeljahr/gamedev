// Rewrite metadata.json folder / path_pattern values to match the
// slug-renamed asset tree. Skips path segments that contain glob syntax
// (`*`, `{`, `}`) so patterns like `cc0__*.glb` keep their literal stem.
//
//   pnpm tsx scripts/slug-assets/fix-metadata.ts [--dry]

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { slugifyDirname, slugifyFilename } from "./slug.ts";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const META_PATH = join(REPO_ROOT, "metadata.json");
const DRY = process.argv.includes("--dry");

function hasGlob(s: string): boolean {
  return /[*{}?]/.test(s);
}

// Roots that *are* indexed by the manifest pipeline. The planner renames
// files inside these (glb+gltf in 3D model roots, all images in 2D, all
// audio in sounds). For non-indexed roots, only directories are renamed.
const INDEXED_ROOTS = new Set(["glb", "raw", "2D", "sounds"]);

// Top-level dirs under assets/ are never renamed by the planner (walk
// starts at the root, only its children get processed). So when a path
// literally begins with one of these, the first segment stays verbatim.
const PRESERVED_ROOTS = new Set([
  "2D",
  "3D",
  "3D-optimized",
  "_mixamo-source",
  "_mocap-source",
  "glb",
  "glb-flat",
  "glb-optimized-v2",
  "misc-imports",
  "raw",
  "sounds",
  "textures",
  "vector-tilesets",
]);

function slugifyPath(path: string, hasFileLast: boolean): string {
  const segs = path.split("/");
  const root = segs[0] ?? "";
  const isRooted = segs.length > 1 && PRESERVED_ROOTS.has(root);
  const indexed = isRooted && INDEXED_ROOTS.has(root);
  return segs
    .map((seg, i) => {
      if (!seg) return seg;
      if (hasGlob(seg)) return seg;
      if (i === 0 && isRooted) return seg;
      const isLast = i === segs.length - 1 && hasFileLast;
      if (isLast) {
        // For rooted paths: only slugify file leaf if root is indexed.
        // For non-rooted paths (just a folder name like `ansimuz__foo`):
        // treat as a dir-style segment regardless.
        if (!isRooted) return slugifyDirname(seg);
        return indexed ? slugifyFilename(seg) : seg;
      }
      return slugifyDirname(seg);
    })
    .join("/");
}

function fixObject(obj: unknown, changes: string[]): void {
  if (Array.isArray(obj)) {
    for (const it of obj) fixObject(it, changes);
    return;
  }
  if (!obj || typeof obj !== "object") return;
  const o = obj as Record<string, unknown>;
  if (typeof o.folder === "string") {
    const next = slugifyPath(o.folder, false);
    if (next !== o.folder) {
      changes.push(`folder: ${o.folder} → ${next}`);
      o.folder = next;
    }
  }
  if (typeof o.path_pattern === "string") {
    // Heuristic: treat the last segment as a file pattern only if it has
    // a dot extension hint (e.g. `*.glb`). Otherwise it's a dir pattern.
    const last = o.path_pattern.split("/").pop() ?? "";
    const asFile = /\.[a-z0-9{}]+$/i.test(last);
    const next = slugifyPath(o.path_pattern, asFile);
    if (next !== o.path_pattern) {
      changes.push(`path_pattern: ${o.path_pattern} → ${next}`);
      o.path_pattern = next;
    }
  }
  for (const v of Object.values(o)) fixObject(v, changes);
}

const meta = JSON.parse(readFileSync(META_PATH, "utf8")) as unknown;
const changes: string[] = [];
fixObject(meta, changes);

console.log(`[fix-metadata] ${changes.length} fields changed`);
for (const c of changes) console.log("  -", c);

if (!DRY && changes.length > 0) {
  writeFileSync(META_PATH, JSON.stringify(meta, null, 2) + "\n");
  console.log(`[fix-metadata] wrote ${META_PATH}`);
}
