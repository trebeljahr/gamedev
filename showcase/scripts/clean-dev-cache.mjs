#!/usr/bin/env node

import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SHOWCASE_DIR = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const SERVER_CACHE = join(SHOWCASE_DIR, ".next", "server");

if (existsSync(SERVER_CACHE)) {
  await rm(SERVER_CACHE, { recursive: true, force: true });
  process.stdout.write(`[dev-cache] removed stale ${relative(SHOWCASE_DIR, SERVER_CACHE)}\n`);
}
