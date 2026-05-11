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
