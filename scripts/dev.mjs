#!/usr/bin/env node
/**
 * One-stop dev runner. Spawns the local asset HTTP server on
 * :9101 in the background and runs the showcase Next dev server
 * in the foreground. The generated catalog JSON is committed and
 * refreshed manually via `pnpm manifest`; dev startup only checks
 * that those files exist. Ctrl+C tears both down.
 *
 * Why a separate process for assets instead of Next's /public:
 *   - Mirrors the prod URL shape (R2 custom domain at
 *     https://assets.gamedev.trebeljahr.com), so the showcase code
 *     uses one `NEXT_PUBLIC_ASSETS_BASE_URL` env in both worlds.
 *   - Keeps ~50 GB of assets out of the Next build/HMR graph.
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const ASSETS_PORT = process.env.ASSETS_PORT ?? "9412";
const SHOWCASE_PORT = process.env.SHOWCASE_PORT ?? "3679";
const ASSETS_BASE_URL =
  process.env.NEXT_PUBLIC_ASSETS_BASE_URL ?? `http://localhost:${ASSETS_PORT}`;

function log(prefix, msg) {
  process.stdout.write(`[${prefix}] ${msg}\n`);
}

const children = [];
let shuttingDown = false;

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) {
    try {
      c.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }
  setTimeout(() => process.exit(code), 500).unref();
}

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    log("dev", "shutting down…");
    shutdown(0);
  });
}

function startAssets() {
  const child = spawn(process.execPath, ["scripts/serve-assets.mjs"], {
    cwd: ROOT,
    stdio: ["ignore", "inherit", "inherit"],
    env: { ...process.env, PORT: ASSETS_PORT },
  });
  child.on("exit", (code) => {
    if (!shuttingDown) {
      log("dev", `assets server exited (code ${code}); shutting down`);
      shutdown(code ?? 0);
    }
  });
  return child;
}

function startShowcase() {
  // Pass the asset base URL through to the showcase Next dev server so
  // `assetUrl(file)` resolves to the local asset HTTP server (or whatever
  // override the developer set in .env.local).
  const env = {
    ...process.env,
    NEXT_PUBLIC_ASSETS_BASE_URL: ASSETS_BASE_URL,
    // Cap Next's Node heap so long-running HMR sessions stay bounded.
    NODE_OPTIONS: [process.env.NODE_OPTIONS ?? "", "--max-old-space-size=2048"]
      .filter(Boolean)
      .join(" "),
  };
  // Showcase package.json's `dev` script owns the port (3679) so
  // `pnpm --filter 3d-assets-showcase dev` still works standalone.
  // Override only when SHOWCASE_PORT env is set explicitly.
  const args = ["--filter", "3d-assets-showcase", "dev"];
  if (process.env.SHOWCASE_PORT) args.push("--port", SHOWCASE_PORT);
  const child = spawn("pnpm", args, { cwd: ROOT, stdio: "inherit", env });
  child.on("exit", (code) => {
    if (!shuttingDown) {
      log("dev", `next dev exited (code ${code}); shutting down`);
      shutdown(code ?? 0);
    }
  });
  return child;
}

log("dev", `starting asset server on :${ASSETS_PORT}`);
children.push(startAssets());

log("dev", `==> http://localhost:${SHOWCASE_PORT}  (assets via ${ASSETS_BASE_URL})`);
children.push(startShowcase());
