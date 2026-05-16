import { type ModelCategory, usagePhrase } from "./catalog-metadata";

export type Model = {
  name: string;
  file: string;
  downloads?: ModelDownload[];
  title: string;
  category: ModelCategory;
  subcategory: string;
  style: string[];
  themes: string[];
  tags: string[];
  // World-space XZ footprint + height of the model's static bbox, computed
  // by scripts/build-manifest.ts. Used by /all to size the base plate and to
  // pack cells without normalising every model into a fixed unit cube.
  size: [number, number, number]; // [width X, height Y, depth Z]
  minY: number; // bbox min Y — translate the model up by -minY to ground it
};
export type ModelDownload = {
  format: string;
  file: string;
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
  title: string;
  categories: ModelCategory[];
  style: string[];
  themes: string[];
  tags: string[];
  source: string;
  license: string;
  preview?: PackPreview;
  count: number;
  models: Model[];
};
export type Manifest = { packs: Pack[] };

/**
 * The manifest is a 6.8 MB JSON file. It lives in `public/manifest.json` so
 * it's served as a static asset and never enters the JS bundle. We read it
 * once on the server at module init; client components that need the data
 * receive subsets via React props (or fetch /manifest.json themselves for
 * whole-catalog views).
 *
 * Client-side this module still resolves (so helpers like `assetUrl` and
 * `displayPackTitle` remain client-safe), but `manifest.packs` is empty.
 * Any client component that touches manifest data directly is a bug — it
 * should receive a serialized subset from a server component.
 */
const isServer = typeof window === "undefined";
let _manifest: Manifest = { packs: [] };
if (isServer) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs") as typeof import("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("node:path") as typeof import("node:path");
  const raw = fs.readFileSync(path.join(process.cwd(), "public", "manifest.json"), "utf8");
  _manifest = JSON.parse(raw) as Manifest;
}
export const manifest: Manifest = _manifest;

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

const QUATERNIUS_DATE_STAMP =
  /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(?:19|20)\d{2}\b/gi;

export function displayPackTitle(pack: Pick<Pack, "title" | "vendor">): string {
  if (pack.vendor !== "quaternius") return pack.title;

  return (
    pack.title
      .replace(QUATERNIUS_DATE_STAMP, "")
      .replace(/\b(?:19|20)\d{2}\b/g, "")
      .replace(/\s{2,}/g, " ")
      .replace(/\s+([,.:])/g, "$1")
      .replace(/[-,.:]\s*$/g, "")
      .trim() || pack.title
  );
}

/**
 * Render the templated per-model description on demand. Build-manifest used to
 * pre-bake this into the JSON, which was ~1.2 MB of repeated boilerplate.
 */
export function modelDescription(model: Model, pack: Pack): string {
  return `${model.title} is a ${model.style.join(", ")} ${model.subcategory} from ${pack.source}'s ${displayPackTitle(pack)} pack. Useful for ${usagePhrase(model.category)}.`;
}

/**
 * Lazy fuzzy-search index for a single model. Catalog/search components join
 * many of these per keystroke; the surface stays small (no description, no
 * file URL) so substring matching is cheap and meaningful.
 */
export function modelSearchText(model: Model, pack: Pack): string {
  return [
    model.title,
    model.name,
    displayPackTitle(pack),
    pack.pack,
    pack.source,
    model.category,
    model.subcategory,
    ...model.themes,
    ...model.style,
    ...model.tags,
  ].filter(Boolean).join(" ").toLowerCase();
}

export function packDescription(pack: Pack): string {
  const themePhrase = pack.themes.length > 0 ? pack.themes.join(", ") : "general";
  const categoryPhrase = pack.categories.length > 0 ? pack.categories.join(", ") : "game assets";
  return `${displayPackTitle(pack)} is a ${pack.source} ${pack.style.join(", ")} pack with ${pack.count.toLocaleString("en-US")} models focused on ${themePhrase}. Includes ${categoryPhrase}.`;
}

export function packSearchText(pack: Pack): string {
  return [
    displayPackTitle(pack),
    pack.pack,
    pack.source,
    pack.vendor,
    pack.license,
    ...pack.categories,
    ...pack.themes,
    ...pack.style,
    ...pack.tags,
  ].filter(Boolean).join(" ").toLowerCase();
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
