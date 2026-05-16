const path = require("node:path");
const fs = require("node:fs");
const { PHASE_DEVELOPMENT_SERVER } = require("next/constants");

const DEV_LOCK = path.join(__dirname, ".next-dev.lock.json");

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err?.code === "EPERM";
  }
}

function readDevLock() {
  try {
    return JSON.parse(fs.readFileSync(DEV_LOCK, "utf8"));
  } catch {
    return null;
  }
}

function removeDevLock(token) {
  const lock = readDevLock();
  if (lock?.token === token) fs.rmSync(DEV_LOCK, { force: true });
}

function ensureSingleDevServer(isDevServer) {
  if (!isDevServer) return;

  const token = process.env.NEXT_DEV_LOCK_TOKEN ?? `${process.pid}-${Date.now()}`;
  process.env.NEXT_DEV_LOCK_TOKEN = token;

  const lock = readDevLock();
  if (lock?.token === token) return;
  if (isPidAlive(lock?.pid)) {
    throw new Error(
      `Another Next dev server is already running for this checkout (pid ${lock.pid}). ` +
        "Stop it before starting a second one; concurrent dev servers corrupt .next chunks.",
    );
  }

  fs.writeFileSync(
    DEV_LOCK,
    `${JSON.stringify({ pid: process.pid, token, startedAt: new Date().toISOString() }, null, 2)}\n`,
  );
  if (!process.env.NEXT_PRIVATE_WORKER) process.once("exit", () => removeDevLock(token));
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  turbopack: {
    resolveAlias: {
      three: "./node_modules/three",
    },
  },
  webpack(config) {
    // pnpm + webpack can resolve `three` through multiple symlink paths,
    // producing two module instances and breaking R3F's `<primitive>` (instanceof checks).
    // Pin to a single path.
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      three: path.resolve(__dirname, "node_modules/three"),
    };
    config.module.rules.push({ test: /\.(glb|gltf)$/, type: "asset/resource" });
    return config;
  },
};

// Tailscale dev URL wiring (https://gamedev.local.ricoslabs.com/).
// hatchkit's auto-patcher only handles ESM `export default` shapes; this
// file is CJS, so the wrap goes here by hand.
module.exports = async (phase) => {
  const isDevWorker = Boolean(process.env.NEXT_DEV_LOCK_TOKEN && process.env.NEXT_PRIVATE_WORKER);
  ensureSingleDevServer(
    phase === PHASE_DEVELOPMENT_SERVER || isDevWorker,
  );

  const { withLocalDev } = await import("@hatchkit/dev-plugin-next");
  // Next 16 Turbopack evaluates next.config in main + worker processes.
  // Suppress the worker's duplicate Tailscale banner; allowedDevOrigins
  // still gets applied so the worker trusts the local-dev host.
  return withLocalDev(nextConfig, { slug: "gamedev", silent: isDevWorker });
};
