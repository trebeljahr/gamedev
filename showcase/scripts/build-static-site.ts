/**
 * Completes the static export in `out/` after `next build`.
 *
 * The site used to answer these URLs from route handlers on a Node server.
 * Production is now Cloudflare Workers static assets with no Worker script,
 * so every answer is a file or a `_redirects` rule written here:
 *
 *   /manifest.json, /media-catalog.json   the license-filtered catalogs
 *                                          (the raw public/ copies list
 *                                          packs production must not show)
 *   /media-catalog/packs/<slug>.json      visible packs only, minified
 *   /api/catalog.json                     the whole agent catalog, one page
 *   /api/catalog.schema.json              its JSON Schema
 *   /api/media/art-json/<folder>.json     a pack with resolved sample URLs
 *   /api/downloads/<vendor>/<pack>.json   model file → immutable object URL
 *   /api/models/download                  legacy query links, forwarded in
 *                                          the browser (no server to 307)
 *   _redirects                            pack ZIPs (307 to storage), old API
 *                                          paths and 2D asset pages (200 proxy)
 *
 * It also deletes the payload files of model pages and the segment files
 * under /media/2d/<x>/, then checks the upload against the Workers Free
 * limits. Run from showcase/ with NODE_ENV=production: the catalogs filter
 * restricted packs only in production.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { artifactUrl } from "../src/lib/durable-download";
import { downloadCatalog, modelDownloadUrl, packZipUrl } from "../src/lib/download-catalog";
import { licenseForVendor } from "../src/lib/license";
import { shouldShowRestrictedAssets } from "../src/lib/license-policy";
import { assetUrl, downloadsForModel, manifest, modelFormatForFile } from "../src/lib/manifest";
import {
  artPackSummaries,
  catalog,
  findArtPack,
  mediaSources,
  musicTracks,
  soundCollections,
  sourceMappings,
  withResolvedSampleUrls,
} from "../src/lib/media";
import { artPackSlug } from "../src/lib/art-routing";
import { modelRouteRefsForPack } from "../src/lib/model-routes";
import { SITE_URL } from "../src/lib/seo";

const OUT = join(process.cwd(), "out");
// Workers Free: 20,000 files per version, 25 MiB per file, 2,000 static and
// 100 dynamic redirects. Leave room for the hashed files carried from the
// previous releases (scripts/carry-static.mjs).
const MAX_FILES = 18_000;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_STATIC_REDIRECTS = 2_000;
const MAX_DYNAMIC_REDIRECTS = 100;

const CATALOG_SCHEMA_URL = `${SITE_URL}/api/catalog.schema.json`;

function writeOut(path: string, body: string) {
  const target = join(OUT, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, body);
}

function writeJson(path: string, value: unknown) {
  writeOut(path, JSON.stringify(value));
}

function walk(root: string): string[] {
  const found: string[] = [];
  const visit = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) visit(path);
      else found.push(relative(root, path).split(sep).join("/"));
    }
  };
  visit(root);
  return found;
}

// ---------------------------------------------------------------------------
// Catalogs
// ---------------------------------------------------------------------------

function writeCatalogs() {
  writeJson("manifest.json", manifest);
  writeJson("media-catalog.json", catalog);

  const visible = new Set(artPackSummaries.map((summary) => artPackSlug(summary.folder)));
  const packsDir = join(OUT, "media-catalog", "packs");
  let removed = 0;
  for (const file of readdirSync(packsDir)) {
    const slug = file.replace(/\.json$/, "");
    const path = join(packsDir, file);
    if (!visible.has(slug)) {
      rmSync(path);
      removed += 1;
      continue;
    }
    writeFileSync(path, JSON.stringify(JSON.parse(readFileSync(path, "utf8"))));
  }
  for (const summary of artPackSummaries) {
    const pack = findArtPack(summary.folder);
    if (!pack) throw new Error(`Visible art pack ${summary.folder} has no catalog file.`);
    writeJson(`api/media/art-json/${summary.folder}.json`, withResolvedSampleUrls(pack));
  }
  return { artPacks: visible.size, restrictedPackFilesRemoved: removed };
}

// ---------------------------------------------------------------------------
// /api/catalog.json — the agent catalog, formerly a paginated route handler
// ---------------------------------------------------------------------------

type CatalogItemType = "model" | "sprite" | "sound" | "music" | "texture";
type CatalogDownload = { format: string; url: string; sizeBytes: number | null };
type CatalogItem = {
  id: string;
  name: string;
  type: CatalogItemType;
  license: string;
  creator: string;
  creatorUrl: string | null;
  sourceUrl: string | null;
  downloads: CatalogDownload[];
};
type SourceInfo = { name?: string; url?: string | null; license?: string };

const SOURCE_ALIASES: Record<string, string> = {
  kaykit: "kay-lousberg",
  "kay-kit": "kay-lousberg",
  "kay lousberg": "kay-lousberg",
  "kenney.nl": "kenney",
  "freesound.org": "freesound",
  "poly haven": "poly-haven",
  polyhaven: "poly-haven",
};

const CATALOG_RESPONSE_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: CATALOG_SCHEMA_URL,
  title: "GameDev Asset Catalog Response",
  description:
    "The whole catalog in one response. `page` is always 1 and `total_pages` 1; query parameters are ignored.",
  type: "object",
  additionalProperties: false,
  required: ["schema", "page", "per_page", "total", "total_pages", "items"],
  properties: {
    schema: { type: "string", const: CATALOG_SCHEMA_URL },
    page: { type: "integer", const: 1 },
    per_page: { type: "integer", minimum: 0 },
    total: { type: "integer", minimum: 0 },
    total_pages: { type: "integer", minimum: 0, maximum: 1 },
    items: { type: "array", items: { $ref: "#/$defs/catalogItem" } },
  },
  $defs: {
    catalogItem: {
      type: "object",
      additionalProperties: false,
      required: ["id", "name", "type", "license", "creator", "creatorUrl", "sourceUrl", "downloads"],
      properties: {
        id: { type: "string", minLength: 1 },
        name: { type: "string", minLength: 1 },
        type: { type: "string", enum: ["model", "sprite", "sound", "music", "texture"] },
        license: { type: "string" },
        creator: { type: "string" },
        creatorUrl: { type: ["string", "null"], format: "uri" },
        sourceUrl: { type: ["string", "null"], format: "uri" },
        downloads: { type: "array", items: { $ref: "#/$defs/download" } },
      },
    },
    download: {
      type: "object",
      additionalProperties: false,
      required: ["format", "url", "sizeBytes"],
      properties: {
        format: { type: "string", minLength: 1 },
        url: { type: "string", format: "uri" },
        sizeBytes: { type: ["integer", "null"], minimum: 0 },
      },
    },
  },
} as const;

function absoluteUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value, SITE_URL).toString();
  } catch {
    return null;
  }
}

function downloadUrl(value: string): string {
  return absoluteUrl(assetUrl(value)) ?? value;
}

function formatForUrl(value: string, fallback = "file"): string {
  const clean = value.split(/[?#]/, 1)[0].toLowerCase();
  return clean.match(/\.([a-z0-9]+)$/)?.[1] || fallback;
}

function normalizeSourceKey(value: string | null | undefined): string {
  const key = (value ?? "").trim().toLowerCase().replace(/[\s_]+/g, "-");
  return SOURCE_ALIASES[key] ?? key;
}

function sourceInfoFor(source: string | null | undefined): SourceInfo {
  const sources = mediaSources as Record<string, SourceInfo | undefined>;
  const normalized = normalizeSourceKey(source);
  return sources[normalized] ?? sources[SOURCE_ALIASES[normalized]] ?? {};
}

function soundCreatorFromNotes(notes: string, fallback: string): string {
  const match = notes.match(/\b(?:creator pack by|by)\s+([^.;]+)/i);
  return match?.[1]?.trim() || fallback;
}

function catalogItems(): CatalogItem[] {
  const models = manifest.packs.flatMap((pack) => {
    const creatorUrl = absoluteUrl(licenseForVendor(pack.vendor).vendorUrl);
    return pack.models.map((model) => ({
      id: `model:${pack.id}/${model.name}`,
      name: model.title,
      type: "model" as const,
      license: pack.license,
      creator: pack.source,
      creatorUrl,
      sourceUrl: creatorUrl,
      downloads: downloadsForModel(model).map((download) => ({
        format: download.format || modelFormatForFile(download.file),
        url: downloadUrl(download.file),
        sizeBytes: null,
      })),
    }));
  });

  const sprites = artPackSummaries.map((pack) => {
    const downloads: CatalogDownload[] = [
      { format: "json", url: `${SITE_URL}/api/media/art-json/${pack.folder}.json`, sizeBytes: null },
    ];
    if (pack.preview?.src) {
      downloads.unshift({
        format: formatForUrl(pack.preview.src, "image"),
        url: downloadUrl(pack.preview.src),
        sizeBytes: null,
      });
    }
    return {
      id: `sprite:${pack.folder}`,
      name: pack.title,
      type: "sprite" as const,
      license: pack.license_class,
      creator: pack.author,
      creatorUrl: absoluteUrl(pack.author_url),
      sourceUrl: absoluteUrl(pack.url),
      downloads,
    };
  });

  const sounds = soundCollections.map((collection) => {
    const sourceInfo = sourceInfoFor(collection.source);
    const sourceUrl = absoluteUrl(collection.url ?? sourceInfo.url);
    return {
      id: `sound:${collection.id}`,
      name: collection.title,
      type: "sound" as const,
      license: collection.license,
      creator: soundCreatorFromNotes(collection.notes, sourceInfo.name ?? collection.source),
      creatorUrl: sourceUrl ?? absoluteUrl(sourceInfo.url),
      sourceUrl,
      downloads: collection.samples.map((sample) => ({
        format: formatForUrl(sample.src, "audio"),
        url: downloadUrl(sample.src),
        sizeBytes: sample.audio?.byteLength ?? null,
      })),
    };
  });

  const music = musicTracks.map((track) => {
    const sourceInfo = sourceInfoFor(track.source);
    return {
      id: `music:${track.path}`,
      name: track.title,
      type: "music" as const,
      license: track.license,
      creator: sourceInfo.name ?? track.source,
      creatorUrl: absoluteUrl(sourceInfo.url),
      sourceUrl: absoluteUrl(track.url ?? sourceInfo.url),
      downloads: [
        {
          format: formatForUrl(track.src, "audio"),
          url: downloadUrl(track.src),
          sizeBytes: track.audio?.byteLength ?? null,
        },
      ],
    };
  });

  const textures = sourceMappings
    .filter((mapping) => mapping.medium === "texture")
    .map((mapping) => {
      const sourceInfo = sourceInfoFor(mapping.source);
      const sourceUrl = absoluteUrl(mapping.url ?? sourceInfo.url);
      return {
        id: `texture:${mapping.id}`,
        name: mapping.title,
        type: "texture" as const,
        license: mapping.license ?? sourceInfo.license ?? "See source metadata",
        creator: mapping.likelyCreator ?? sourceInfo.name ?? mapping.source,
        creatorUrl: absoluteUrl(sourceInfo.url),
        sourceUrl,
        downloads: sourceUrl ? [{ format: "source", url: sourceUrl, sizeBytes: null }] : [],
      };
    });

  return [...models, ...sprites, ...sounds, ...music, ...textures].sort((a, b) => a.id.localeCompare(b.id));
}

function writeAgentCatalog() {
  const items = catalogItems();
  writeJson("api/catalog.json", {
    schema: CATALOG_SCHEMA_URL,
    page: 1,
    per_page: items.length,
    total: items.length,
    total_pages: items.length === 0 ? 0 : 1,
    items,
  });
  writeJson("api/catalog.schema.json", CATALOG_RESPONSE_SCHEMA);
  return { catalogItems: items.length };
}

// ---------------------------------------------------------------------------
// Downloads: per-pack maps, legacy query links, pack ZIP redirects
// ---------------------------------------------------------------------------

function writeDownloads(): { redirects: string[]; packs: number; files: number } {
  const redirects: string[] = [];
  let files = 0;
  for (const pack of manifest.packs) {
    const models: Record<string, string> = {};
    for (const model of pack.models) {
      for (const download of downloadsForModel(model)) {
        if (models[download.file]) continue;
        if ((downloadCatalog.models[download.file]?.length ?? 0) !== 1) {
          // The map holds one URL per file; the old route picked by filename.
          throw new Error(`Expected exactly one download object for ${download.file}.`);
        }
        const prefix = `/${download.file.split("/")[1]}/${pack.vendor}/${pack.pack}/`;
        if (!download.file.startsWith(prefix)) {
          throw new Error(`${download.file} is not under ${prefix}; the browser cannot find its pack map.`);
        }
        models[download.file] = modelDownloadUrl(download.file);
        files += 1;
      }
    }
    const zip = packZipUrl(pack.vendor, pack.pack);
    writeJson(`api/downloads/${pack.vendor}/${pack.pack}.json`, { schema: 1, zip, models });
    redirects.push(`/api/packs/${pack.vendor}/${pack.pack}/zip ${zip} 307`);
  }

  // `/api/models/download?file=…&name=…` used to answer 307 to the object.
  // `_redirects` cannot match a query, so this page forwards in the browser.
  writeOut(
    "api/models/download.html",
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Download | GameDev Asset Library</title>
</head>
<body>
<p id="status">Starting your download…</p>
<p><a href="/">GameDev Asset Library</a></p>
<script>
(function () {
  var status = document.getElementById("status");
  var file = new URLSearchParams(location.search).get("file") || "";
  var match = file.match(/^\\/(?:glb|raw)\\/([^/]+)\\/([^/]+)\\//);
  if (!match) { status.textContent = "This download link is not valid."; return; }
  fetch("/api/downloads/" + match[1] + "/" + match[2] + ".json")
    .then(function (response) { return response.ok ? response.json() : null; })
    .then(function (map) {
      var url = map && map.models[file];
      if (url) location.replace(url);
      else status.textContent = "This download is not available.";
    })
    .catch(function () { status.textContent = "This download could not be started."; });
})();
</script>
</body>
</html>
`,
  );
  return { redirects, packs: manifest.packs.length, files };
}

// ---------------------------------------------------------------------------
// Pages: drop payload files that would pass the file limit
// ---------------------------------------------------------------------------

function pruneModelPagePayloads() {
  let models = 0;
  for (const pack of manifest.packs) {
    for (const ref of modelRouteRefsForPack(pack)) {
      const base = join(OUT, pack.vendor, pack.pack, ref.slug);
      if (!existsSync(`${base}.html`)) throw new Error(`Model page ${pack.vendor}/${pack.pack}/${ref.slug} was not exported.`);
      rmSync(`${base}.txt`, { force: true });
      rmSync(base, { recursive: true, force: true });
      models += 1;
    }
  }
  return models;
}

function pruneArtSegmentFiles() {
  // Every two-segment path under /media/2d/ goes to the asset page proxy, so
  // the pack pages' per-segment prefetch files there are unreachable anyway.
  const dir = join(OUT, "media", "2d");
  let removed = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    rmSync(join(dir, entry.name), { recursive: true, force: true });
    removed += 1;
  }
  return removed;
}

// ---------------------------------------------------------------------------
// _redirects and limits
// ---------------------------------------------------------------------------

function writeRedirects(packZipRedirects: string[]) {
  const staticRules = [
    "/api/models/manifest /manifest.json 200",
    "/api/media/catalog /media-catalog.json 200",
    ...packZipRedirects,
  ];
  const dynamicRules = [
    "/api/media/catalog/packs/:file /media-catalog/packs/:file 200",
    "/api/media/art/* /api/media/art-json/:splat.json 200",
    "/media/2d/:pack/:asset /media/2d/item 200",
  ];
  if (staticRules.length > MAX_STATIC_REDIRECTS) throw new Error(`${staticRules.length} static redirects`);
  if (dynamicRules.length > MAX_DYNAMIC_REDIRECTS) throw new Error(`${dynamicRules.length} dynamic redirects`);
  writeOut(
    "_redirects",
    [
      "# Generated by showcase/scripts/build-static-site.ts. Static rules first.",
      ...staticRules,
      ...dynamicRules,
      "",
    ].join("\n"),
  );
  return { staticRedirects: staticRules.length, dynamicRedirects: dynamicRules.length };
}

function checkLimits() {
  const files = walk(OUT);
  const oversized = files.filter((file) => statSync(join(OUT, file)).size > MAX_FILE_BYTES);
  if (oversized.length > 0) throw new Error(`Files over 25 MiB: ${oversized.join(", ")}`);
  if (files.length > MAX_FILES) throw new Error(`${files.length} files in out/ (limit ${MAX_FILES} before carry).`);
  const bytes = files.reduce((sum, file) => sum + statSync(join(OUT, file)).size, 0);
  return { files: files.length, bytes };
}

function main() {
  if (process.env.NODE_ENV !== "production" || shouldShowRestrictedAssets()) {
    throw new Error("Run with NODE_ENV=production and without SHOW_RESTRICTED_ASSETS, or restricted packs ship.");
  }
  if (!existsSync(join(OUT, "index.html"))) throw new Error("out/index.html is missing; run next build first.");
  // Fail before writing anything if storage is misconfigured.
  artifactUrl(Object.values(downloadCatalog.packs)[0], process.env.NEXT_PUBLIC_ASSETS_BASE_URL ?? "", SITE_URL);

  const catalogs = writeCatalogs();
  const agent = writeAgentCatalog();
  const downloads = writeDownloads();
  const modelPages = pruneModelPagePayloads();
  const artSegmentDirs = pruneArtSegmentFiles();
  const redirects = writeRedirects(downloads.redirects);
  const limits = checkLimits();
  console.log(
    JSON.stringify(
      {
        ...catalogs,
        ...agent,
        downloadMaps: downloads.packs,
        downloadFiles: downloads.files,
        modelPagesHtmlOnly: modelPages,
        artSegmentDirsRemoved: artSegmentDirs,
        ...redirects,
        ...limits,
      },
      null,
      2,
    ),
  );
}

main();
