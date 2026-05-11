import data from "./manifest.json";

export type Model = { name: string; file: string; label: string };
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
