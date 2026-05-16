// Read out/r2-keys.txt (produced by r2-plan.sh) and write out/r2-moves.tsv:
// `oldKey<TAB>newKey` for every key whose slugified form differs.
//
// Sibling collisions get -2, -3 suffixes (file extension preserved).

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { slugifyDirname, slugifyFilename } from "./slug.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const KEYS = join(HERE, "out", "r2-keys.txt");
const MOVES = join(HERE, "out", "r2-moves.tsv");

// Mirror the local planner's eligibility (plan.ts):
// - the top-level dir under assets/ is never renamed (root preservation)
// - hidden entries (. prefix) are left alone everywhere
// - junk names (__MACOSX, .DS_Store, Thumbs.db) are skipped entirely
// - file rename only happens inside indexed roots, and only for the
//   extensions the local plan considers safe (no cross-ref breakage).
function isHiddenSegment(seg: string): boolean {
  return seg.startsWith(".");
}
const JUNK_SEG = new Set(["__MACOSX", ".DS_Store", "Thumbs.db"]);

const INDEXED_ROOTS = new Set(["glb", "raw", "2D", "sounds"]);
const ART_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".bmp", ".tiff"]);
const SOUND_EXTS = new Set([".mp3", ".wav", ".ogg", ".m4a", ".flac", ".opus", ".aiff"]);
const SAFE_3D_EXTS = new Set([".glb", ".gltf"]);

function fileExt(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot).toLowerCase();
}

function isFileRenameEligible(root: string, name: string): boolean {
  if (!INDEXED_ROOTS.has(root)) return false;
  const ext = fileExt(name);
  if (root === "2D") return ART_EXTS.has(ext);
  if (root === "sounds") return SOUND_EXTS.has(ext);
  return SAFE_3D_EXTS.has(ext);
}

function slugifySegmentSafe(seg: string, kind: "dir" | "file"): string {
  if (isHiddenSegment(seg)) return seg;
  return kind === "file" ? slugifyFilename(seg) : slugifyDirname(seg);
}

function suffixedFilename(name: string, n: number): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return `${name}-${n}`;
  return `${name.slice(0, dot)}-${n}${name.slice(dot)}`;
}

const rawKeys = readFileSync(KEYS, "utf8").split("\n").map((s) => s.trim()).filter(Boolean);
// Drop any key whose path contains junk segments — those shouldn't be in
// R2 in the first place, and we definitely shouldn't try to move them.
const keys = rawKeys.filter((k) => !k.split("/").some((s) => JUNK_SEG.has(s)));
console.log(`[r2-plan] read ${rawKeys.length} keys (${rawKeys.length - keys.length} junk skipped)`);

// Group by parent prefix so we can detect collisions and disambiguate.
const byParent = new Map<string, Array<{ old: string; targetLast: string }>>();
for (const k of keys) {
  const segs = k.split("/");
  const last = segs.pop()!;
  const root = segs[0] ?? "";
  // Parent path: keep segment 0 (root) verbatim; slugify intermediates.
  const parentSlug = segs
    .map((s, i) => (i === 0 ? s : slugifySegmentSafe(s, "dir")))
    .join("/");
  const targetLast = isFileRenameEligible(root, last)
    ? slugifySegmentSafe(last, "file")
    : last;
  const list = byParent.get(parentSlug) ?? [];
  list.push({ old: k, targetLast });
  byParent.set(parentSlug, list);
}

const moves: Array<[string, string]> = [];
for (const [parent, list] of byParent) {
  const seen = new Map<string, number>();
  // Stable order: sort by original key so reruns produce identical disambiguation.
  list.sort((a, b) => a.old.localeCompare(b.old));
  for (const entry of list) {
    let target = entry.targetLast;
    const count = seen.get(target) ?? 0;
    if (count > 0) target = suffixedFilename(entry.targetLast, count + 1);
    seen.set(entry.targetLast, count + 1);
    const newKey = parent ? `${parent}/${target}` : target;
    if (newKey !== entry.old) moves.push([entry.old, newKey]);
  }
}

// Parent-first ordering for R2: shallowest paths first (irrelevant for
// object store, but keeps the log readable).
moves.sort((a, b) => {
  const da = a[0].split("/").length;
  const db = b[0].split("/").length;
  if (da !== db) return da - db;
  return a[0].localeCompare(b[0]);
});

writeFileSync(MOVES, moves.map(([o, n]) => `${o}\t${n}`).join("\n") + "\n");
console.log(`[r2-plan] ${moves.length} moves → ${MOVES}`);
console.log("[r2-plan] first 10:");
for (const [o, n] of moves.slice(0, 10)) console.log(`  ${o} → ${n}`);
