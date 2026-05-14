#!/usr/bin/env node

import { stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SHOWCASE_DIR = join(fileURLToPath(new URL(".", import.meta.url)), "..");

const requiredFiles = [
  "src/lib/manifest.json",
  "src/lib/media-assets.json",
  "src/lib/audio-analysis.json",
  "src/lib/media-catalog.json",
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

if (missing.length > 0) {
  const list = missing.map((file) => `  - ${relative(SHOWCASE_DIR, join(SHOWCASE_DIR, file))}`).join("\n");
  console.error(
    `[catalog] missing generated catalog files:\n${list}\n\n` +
      "Run `pnpm manifest` after syncing local assets, then commit the generated JSON files.",
  );
  process.exit(1);
}
