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
