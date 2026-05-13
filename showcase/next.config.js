const path = require("node:path");

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
