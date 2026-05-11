import data from "./manifest.json";

export type Model = {
  name: string;
  file: string;
  label: string;
  // World-space XZ footprint + height of the model's static bbox, computed
  // by scripts/build-manifest.ts. Used by /all to size the base plate and to
  // pack cells without normalising every model into a fixed unit cube.
  size: [number, number, number]; // [width X, height Y, depth Z]
  minY: number; // bbox min Y — translate the model up by -minY to ground it
  // Bbox centre in local model coords (X, Z). GLB origins aren't always at
  // the model's XZ centre; the renderer uses this so each model sits in the
  // middle of its cell rather than potentially overhanging into a neighbour.
  cxz: [number, number];
};
export type Pack = {
  id: string;
  vendor: string;
  pack: string;
  label: string;
  count: number;
  models: Model[];
};
export type Manifest = { packs: Pack[] };

export const manifest = data as Manifest;

export function findPack(vendor: string, pack: string): Pack | undefined {
  return manifest.packs.find((p) => p.vendor === vendor && p.pack === pack);
}

/**
 * Prefix a manifest-relative URL (`/glb/<vendor>/...` or `/raw/<vendor>/...`)
 * with the configured asset base URL. `NEXT_PUBLIC_ASSETS_BASE_URL` is
 * inlined by Next at build time, so this also works server-side (route
 * handlers read the same env at runtime).
 *
 *   dev   → http://localhost:9101/glb/…   (scripts/serve-assets.mjs)
 *   prod  → https://assets.gamedev.trebeljahr.com/glb/…   (R2 custom domain)
 *
 * Pass an already-absolute URL through unchanged so callers can mix
 * external textures (rare) into the same pipeline.
 */
const ASSETS_BASE_URL = (process.env.NEXT_PUBLIC_ASSETS_BASE_URL ?? "").replace(
  /\/+$/,
  "",
);

export function assetUrl(file: string): string {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(file)) return file;
  if (!ASSETS_BASE_URL) return file;
  return ASSETS_BASE_URL + (file.startsWith("/") ? file : `/${file}`);
}
