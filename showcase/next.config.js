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

module.exports = nextConfig;
