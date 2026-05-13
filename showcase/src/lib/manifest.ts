import data from "./manifest.json";
import type { ModelCategory } from "./catalog-metadata";

export type Model = {
  name: string;
  file: string;
  downloads?: ModelDownload[];
  label: string;
  title: string;
  description: string;
  category: ModelCategory;
  subcategory: string;
  style: string[];
  themes: string[];
  tags: string[];
  searchText: string;
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
export type ModelDownload = {
  format: string;
  file: string;
  label?: string;
  optimized?: boolean;
};
export type PackPreview = {
  modelFile: string;
  modelName: string;
  modelTitle: string;
  category: ModelCategory;
};
export type Pack = {
  id: string;
  vendor: string;
  pack: string;
  label: string;
  title: string;
  description: string;
  categories: ModelCategory[];
  style: string[];
  themes: string[];
  tags: string[];
  source: string;
  license: string;
  searchText: string;
  preview?: PackPreview;
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

export function modelFormatForFile(file: string): string {
  const clean = file.split(/[?#]/, 1)[0].toLowerCase();
  if (clean.endsWith(".gltf")) return "gltf";
  const ext = clean.match(/\.([a-z0-9]+)$/)?.[1];
  return ext || "file";
}

export function modelDownloadLabel(download: ModelDownload): string {
  const format = download.format.toLowerCase();
  const formatted =
    format === "gltf"
      ? "glTF"
      : format === "glb"
        ? "GLB"
        : format.toUpperCase();
  if (download.optimized) return `${formatted} optimized`;
  return `${formatted} source`;
}

export function downloadsForModel(model: Model): ModelDownload[] {
  const rawDownloads =
    model.downloads && model.downloads.length > 0
      ? model.downloads
      : [
          {
            format: modelFormatForFile(model.file),
            file: model.file,
            optimized: model.file.startsWith("/glb/"),
          },
        ];
  const seen = new Set<string>();
  const downloads: ModelDownload[] = [];
  for (const download of rawDownloads) {
    if (!download.file || seen.has(download.file)) continue;
    seen.add(download.file);
    downloads.push({
      ...download,
      format: (download.format || modelFormatForFile(download.file)).toLowerCase(),
      optimized: download.optimized ?? download.file.startsWith("/glb/"),
    });
  }
  return downloads.sort((a, b) => {
    if (a.optimized !== b.optimized) return a.optimized ? -1 : 1;
    return a.format.localeCompare(b.format);
  });
}

export function downloadProxyUrl(file: string, name?: string): string {
  const params = new URLSearchParams({ file });
  if (name) params.set("name", name);
  return `/api/models/download?${params.toString()}`;
}

export function modelDownloadFilename(model: Model, download: ModelDownload): string {
  const format = modelFormatForFile(download.file);
  const base = (model.title || model.name || "model")
    .trim()
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "model";
  const variant = download.optimized ? "optimized" : "source";
  return `${base}-${variant}.${format}`;
}
