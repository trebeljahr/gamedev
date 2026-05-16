// Escape hatch: undo apply-local.ts by reading plan.json and renaming the
// `newRel` paths back to `oldRel`. Run top-down (shallowest first) so a
// renamed parent gets restored before its renamed children are reached.
//
//   ASSETS_DIR=/path pnpm tsx scripts/slug-assets/reverse-local.ts [--dry]

import { existsSync, renameSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ASSETS_DIR = process.env.ASSETS_DIR ?? "/Users/rico/projects/gamedev/assets";
const PLAN_PATH = join(dirname(fileURLToPath(import.meta.url)), "out", "plan.json");
const DRY = process.argv.includes("--dry");

type Rename = { kind: "dir" | "file"; oldRel: string; newRel: string; oldName: string; newName: string };

function isCaseOnly(a: string, b: string): boolean {
  return a !== b && a.toLowerCase() === b.toLowerCase();
}

function uniqueTemp(target: string): string {
  let i = 0;
  while (true) {
    const candidate = `${target}.__slug_tmp_${process.pid}_${i++}`;
    if (!existsSync(candidate)) return candidate;
  }
}

const { renames } = JSON.parse(readFileSync(PLAN_PATH, "utf8")) as { renames: Rename[] };
// Top-down for reverse: rename parents back first, then children.
renames.sort((a, b) => {
  const da = a.newRel.split("/").length;
  const db = b.newRel.split("/").length;
  if (da !== db) return da - db;
  return a.newRel.localeCompare(b.newRel);
});

let ok = 0;
const errors: string[] = [];
for (const r of renames) {
  const cur = join(ASSETS_DIR, r.newRel);
  const orig = join(ASSETS_DIR, r.oldRel);
  if (!existsSync(cur)) {
    if (existsSync(orig)) continue;
    errors.push(`MISSING: ${r.newRel}`);
    continue;
  }
  if (DRY) {
    console.log(`would: ${r.newRel} → ${r.oldRel}`);
    ok++;
    continue;
  }
  try {
    if (isCaseOnly(r.newName, r.oldName)) {
      const tmp = uniqueTemp(orig);
      renameSync(cur, tmp);
      renameSync(tmp, orig);
    } else {
      renameSync(cur, orig);
    }
    ok++;
  } catch (err) {
    errors.push(`FAIL ${r.newRel} → ${r.oldRel}: ${(err as Error).message}`);
  }
}
console.log(`[reverse] restored: ${ok} / ${renames.length}`);
if (errors.length) {
  console.log(`[reverse] errors: ${errors.length}`);
  for (const e of errors.slice(0, 20)) console.log("  -", e);
  process.exit(1);
}
