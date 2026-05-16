// Dry-run plan generator for the asset slug-rename pipeline.
//
//   ASSETS_DIR=/path/to/assets pnpm tsx scripts/slug-assets/plan.ts
//
// Walks the four manifest-indexed trees (glb/, raw/, 2D/, sounds/) under
// $ASSETS_DIR. For every dir and every "rename-eligible" file, computes a
// URL-safe slug. Collisions among siblings get a -2 / -3 suffix in
// sorted-by-original order so the result is deterministic.
//
// Rename eligibility:
//   - Dirs: always.
//   - Files under 2D/ and sounds/: any (no cross-file refs).
//   - Files under glb/ and raw/: only .glb and .gltf (self-contained or
//     reference siblings by URI string; sibling .bin/.png stay put so the
//     refs continue to resolve). .fbx/.obj/.mtl/.blend/.dae/.bin/.png stay
//     under their old names; their parent folder rename is what cleans
//     their URL.
//   - Junk (.DS_Store, ._*) is left alone — sync excludes them anyway.
//
// Output:
//   plan.json   { renames: [{ kind, oldPath, newPath, ... }], collisions, stats }
//   r2-moves.tsv  oldKey<TAB>newKey  (one row per rename, parent-first so
//                                     R2 doesn't end up with orphans)
//
// Both paths are relative to $ASSETS_DIR so they double as R2 keys.

import { existsSync, readdirSync, statSync } from "node:fs";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { isAlreadySlug, slugifyDirname, slugifyFilename } from "./slug.ts";

const ASSETS_DIR = process.env.ASSETS_DIR ?? "/Users/rico/projects/gamedev/assets";
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "out");

// "Indexed" trees: the manifest pipeline walks these, so URLs surface their
// names. File renaming is allowed for safe extensions per root.
const INDEXED_ROOTS = new Set(["glb", "raw", "2D", "sounds"]);

// For everything else under assets/ we still slug the directory tree so the
// layout stays consistent, but we leave files alone: legacy dirs may have
// .obj/.mtl/.fbx/.gltf+.bin pairs whose internal refs we can't safely
// rewrite. None of these dirs are URL-surfaced today anyway.

const ART_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".bmp", ".tiff"]);
const SOUND_EXTS = new Set([".mp3", ".wav", ".ogg", ".m4a", ".flac", ".opus", ".aiff"]);
const SAFE_3D_EXTS = new Set([".glb", ".gltf"]);
const JUNK_NAMES = new Set([".DS_Store", "Thumbs.db", "__MACOSX"]);

type RenameKind = "dir" | "file";
type Rename = {
  kind: RenameKind;
  root: string;
  oldRel: string;
  newRel: string;
  oldName: string;
  newName: string;
};

function isJunk(name: string): boolean {
  // Treat any hidden entry (.git, .cache, .next, .DS_Store, ._foo) as
  // untouchable — losing the leading dot would re-classify the dir and
  // sometimes break the tool that owns it.
  return JUNK_NAMES.has(name) || name.startsWith(".");
}

function fileExt(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot).toLowerCase();
}

function isRenameEligible(root: string, name: string): boolean {
  if (isJunk(name)) return false;
  if (!INDEXED_ROOTS.has(root)) return false;
  const ext = fileExt(name);
  if (root === "2D") return ART_EXTS.has(ext);
  if (root === "sounds") return SOUND_EXTS.has(ext);
  return SAFE_3D_EXTS.has(ext);
}

// Disambiguate target names within a sibling set. Deterministic by sorting
// originals before assigning the suffix, so reruns produce the same plan.
function resolveCollisions(
  entries: Array<{ name: string; isDir: boolean; target: string }>,
): Map<string, string> {
  const buckets = new Map<string, Array<{ name: string; isDir: boolean }>>();
  for (const e of entries) {
    const list = buckets.get(e.target) ?? [];
    list.push({ name: e.name, isDir: e.isDir });
    buckets.set(e.target, list);
  }
  const out = new Map<string, string>();
  for (const [target, members] of buckets) {
    if (members.length === 1) {
      out.set(members[0].name, target);
      continue;
    }
    members.sort((a, b) => a.name.localeCompare(b.name));
    members.forEach((m, i) => {
      if (i === 0) {
        out.set(m.name, target);
        return;
      }
      // For files we need to insert -N before the extension.
      if (m.isDir) {
        out.set(m.name, `${target}-${i + 1}`);
      } else {
        const dot = target.lastIndexOf(".");
        const suffixed = dot <= 0
          ? `${target}-${i + 1}`
          : `${target.slice(0, dot)}-${i + 1}${target.slice(dot)}`;
        out.set(m.name, suffixed);
      }
    });
  }
  return out;
}

function walk(absRoot: string, root: string, renames: Rename[], collisions: string[]) {
  // BFS so we record parent renames before children; the applier sorts to
  // bottom-up before mv-ing so child paths still exist when we rename them.
  const queue: string[] = [absRoot];
  while (queue.length) {
    const dir = queue.shift()!;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    // Build the rename targets for this dir's children, with collision check.
    const planEntries: Array<{ name: string; isDir: boolean; target: string }> = [];
    for (const e of entries) {
      if (isJunk(e.name)) continue;
      if (e.isDirectory()) {
        planEntries.push({ name: e.name, isDir: true, target: slugifyDirname(e.name) });
      } else if (e.isFile() && isRenameEligible(root, e.name)) {
        planEntries.push({ name: e.name, isDir: false, target: slugifyFilename(e.name) });
      }
    }
    const resolved = resolveCollisions(planEntries);

    // Detect cases where an existing sibling already has the slugged name
    // and a different sibling is trying to claim it.
    const existing = new Set(entries.map((e) => e.name));
    for (const [oldName, newName] of resolved) {
      if (oldName !== newName && existing.has(newName)) {
        collisions.push(`${relative(ASSETS_DIR, join(dir, oldName))} → ${newName} (already exists in same dir)`);
      }
    }

    for (const e of entries) {
      const abs = join(dir, e.name);
      if (isJunk(e.name)) continue;
      if (e.isDirectory()) {
        queue.push(abs);
      }
      const target = resolved.get(e.name);
      if (!target || target === e.name) continue;
      renames.push({
        kind: e.isDirectory() ? "dir" : "file",
        root,
        oldRel: relative(ASSETS_DIR, abs),
        newRel: relative(ASSETS_DIR, join(dir, target)),
        oldName: e.name,
        newName: target,
      });
    }
  }
}

function main() {
  if (!existsSync(ASSETS_DIR)) {
    console.error(`ASSETS_DIR not found: ${ASSETS_DIR}`);
    process.exit(1);
  }
  const renames: Rename[] = [];
  const collisions: string[] = [];

  const topLevel = readdirSync(ASSETS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !isJunk(e.name))
    .map((e) => e.name)
    .sort();

  for (const root of topLevel) {
    walk(join(ASSETS_DIR, root), root, renames, collisions);
  }

  // Sort: by depth descending so children come before parents when we
  // apply. (The applier re-sorts to be sure; we still emit a stable order.)
  renames.sort((a, b) => {
    const da = a.oldRel.split("/").length;
    const db = b.oldRel.split("/").length;
    if (da !== db) return db - da;
    return a.oldRel.localeCompare(b.oldRel);
  });

  const stats = {
    total: renames.length,
    dirs: renames.filter((r) => r.kind === "dir").length,
    files: renames.filter((r) => r.kind === "file").length,
    byRoot: [...new Set(renames.map((r) => r.root))].sort().reduce<Record<string, number>>((acc, r) => {
      acc[r] = renames.filter((x) => x.root === r).length;
      return acc;
    }, {}),
    collisions: collisions.length,
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, "plan.json"), JSON.stringify({ stats, collisions, renames }, null, 2));
  // R2 moves: parent-first (depth ascending) so prefixes get renamed before
  // their grandchildren get tried under the wrong name.
  const r2Moves = [...renames]
    .sort((a, b) => {
      const da = a.oldRel.split("/").length;
      const db = b.oldRel.split("/").length;
      if (da !== db) return da - db;
      return a.oldRel.localeCompare(b.oldRel);
    })
    .map((r) => `${r.oldRel}\t${r.newRel}`)
    .join("\n");
  writeFileSync(join(OUT_DIR, "r2-moves.tsv"), r2Moves + "\n");

  // Sample preview to stdout.
  console.log("[plan] stats:", JSON.stringify(stats, null, 2));
  if (collisions.length) {
    console.log("[plan] collisions (first 10):");
    for (const c of collisions.slice(0, 10)) console.log("  -", c);
  }
  console.log("[plan] first 20 renames:");
  for (const r of renames.slice(0, 20)) console.log(`  ${r.kind} ${r.oldRel} → ${r.newRel}`);
  console.log(`[plan] wrote ${join(OUT_DIR, "plan.json")}`);
}

main();
