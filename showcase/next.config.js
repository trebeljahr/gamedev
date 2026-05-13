const path = require("node:path");
const fs = require("node:fs");

const DEV_LOCK = path.join(__dirname, ".next-dev.lock.json");
const isDevServer =
  process.argv.some((arg) => arg === "dev") ||
  Boolean(process.env.NEXT_DEV_LOCK_TOKEN && process.env.NEXT_PRIVATE_WORKER);

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

function ensureSingleDevServer() {
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

ensureSingleDevServer();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
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
module.exports = async () => {
  const { withLocalDev } = await import("@hatchkit/dev-plugin-next");
  return withLocalDev(nextConfig, { slug: "gamedev" });
};
