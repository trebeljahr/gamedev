// Apply the renames from plan.json against the local asset tree.
//
//   ASSETS_DIR=/path/to/assets pnpm tsx scripts/slug-assets/apply-local.ts [--dry]
//
// We rename bottom-up (deepest paths first) so that parent renames don't
// invalidate paths we haven't yet processed. Each rename uses rename() —
// same volume, atomic on macOS HFS+/APFS.
//
// Idempotent-ish: if a planned source no longer exists but the destination
// does, we skip and count it as already-applied. If neither exists, that's
// an error.
//
// macOS APFS is case-insensitive by default. `Foo` → `foo` is a no-op for
// rename() since the OS treats them as the same file. We work around this
// with a two-step rename through a temporary name.

import { existsSync, renameSync } from "node:fs";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ASSETS_DIR = process.env.ASSETS_DIR ?? "/Users/rico/projects/gamedev/assets";
const PLAN_PATH = join(dirname(fileURLToPath(import.meta.url)), "out", "plan.json");
const DRY = process.argv.includes("--dry");

type Rename = {
  kind: "dir" | "file";
  root: string;
  oldRel: string;
  newRel: string;
  oldName: string;
  newName: string;
};

function isCaseOnlyChange(a: string, b: string): boolean {
  return a !== b && a.toLowerCase() === b.toLowerCase();
}

function uniqueTemp(target: string): string {
  let i = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const candidate = `${target}.__slug_tmp_${process.pid}_${i++}`;
    if (!existsSync(candidate)) return candidate;
  }
}

function main() {
  const { renames } = JSON.parse(readFileSync(PLAN_PATH, "utf8")) as { renames: Rename[] };
  // Bottom-up: longest path first.
  renames.sort((a, b) => {
    const da = a.oldRel.split("/").length;
    const db = b.oldRel.split("/").length;
    if (da !== db) return db - da;
    return b.oldRel.localeCompare(a.oldRel);
  });

  const stats = { renamed: 0, skipped: 0, missing: 0, caseTwoStep: 0 };
  const errors: string[] = [];

  for (const r of renames) {
    const oldAbs = join(ASSETS_DIR, r.oldRel);
    const newAbs = join(ASSETS_DIR, r.newRel);

    if (!existsSync(oldAbs)) {
      // Already applied? Only count as "missing" if dest is also gone.
      if (existsSync(newAbs)) {
        stats.skipped++;
      } else {
        stats.missing++;
        errors.push(`MISSING: ${r.oldRel}`);
      }
      continue;
    }

    if (DRY) {
      console.log(`would: ${r.oldRel} → ${r.newRel}`);
      stats.renamed++;
      continue;
    }

    try {
      if (isCaseOnlyChange(r.oldName, r.newName)) {
        // Case-insensitive FS workaround: rename through a temp.
        const tmp = uniqueTemp(newAbs);
        renameSync(oldAbs, tmp);
        renameSync(tmp, newAbs);
        stats.caseTwoStep++;
      } else {
        renameSync(oldAbs, newAbs);
      }
      stats.renamed++;
    } catch (err) {
      errors.push(`FAIL ${r.oldRel} → ${r.newRel}: ${(err as Error).message}`);
    }

    if (stats.renamed % 5000 === 0) {
      console.log(`[apply] progress: ${stats.renamed}/${renames.length}`);
    }
  }

  console.log("[apply] stats:", stats);
  if (errors.length) {
    console.log(`[apply] ${errors.length} errors. First 20:`);
    for (const e of errors.slice(0, 20)) console.log("  -", e);
    process.exit(1);
  }
}

main();
