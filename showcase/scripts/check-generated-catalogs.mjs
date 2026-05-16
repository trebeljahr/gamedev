#!/usr/bin/env node

import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SHOWCASE_DIR = join(fileURLToPath(new URL(".", import.meta.url)), "..");

const requiredFiles = [
  "public/manifest.json",
  "public/audio-analysis.json",
  "public/media-catalog.json",
  "src/lib/media-assets.json",
];

const requiredDirs = [
  // Per-pack art catalog files. The slim media-catalog.json indexes them;
  // ArtWorkbench fetches one at a time via /api/media/art/[folder].
  "public/media-catalog/packs",
];

const missing = [];

for (const file of requiredFiles) {
  const path = join(SHOWCASE_DIR, file);
  try {
    const info = await stat(path);
    if (!info.isFile() || info.size === 0) missing.push(file);
  } catch {
    missing.push(file);
  }
}

for (const dir of requiredDirs) {
  const path = join(SHOWCASE_DIR, dir);
  try {
    const entries = await readdir(path);
    if (entries.filter((name) => name.endsWith(".json")).length === 0) missing.push(`${dir}/ (empty)`);
  } catch {
    missing.push(`${dir}/ (missing)`);
  }
}

if (missing.length > 0) {
  const list = missing.map((file) => `  - ${relative(SHOWCASE_DIR, join(SHOWCASE_DIR, file))}`).join("\n");
  console.error(
    `[catalog] missing generated catalog files:\n${list}\n\n` +
      "Run `pnpm manifest` after syncing local assets, then commit the generated JSON files.",
  );
  process.exit(1);
}
