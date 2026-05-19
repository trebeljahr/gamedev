export const CATALOG_URL = "https://gamedev.trebeljahr.com/api/catalog.json";

export type JsonRecord = Record<string, unknown>;

export type Download = {
  format: string;
  url: string;
  label?: string;
  optimized?: boolean;
};

export type Asset = {
  id: string;
  type: string;
  title: string;
  description?: string;
  creator?: string;
  license?: string;
  sourceUrl?: string;
  tags: string[];
  downloads: Download[];
  metadata: JsonRecord;
  searchText: string;
};

export type SearchFilters = {
  query: string;
  type?: string;
  license?: string;
  limit?: number;
};

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

export async function fetchCatalog(fetchImpl: typeof fetch = globalThis.fetch): Promise<unknown> {
  if (typeof fetchImpl !== "function") {
    throw new Error("This MCP server requires a Node runtime with fetch support.");
  }

  const response = await fetchImpl(CATALOG_URL, {
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Catalog request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export function searchAssets(catalog: unknown, filters: SearchFilters): Asset[] {
  const assets = normalizeCatalog(catalog);
  const query = normalizeText(filters.query);
  const tokens = query.split(/\s+/).filter(Boolean);
  const type = normalizeText(filters.type ?? "");
  const license = normalizeText(filters.license ?? "");
  const limit = clampLimit(filters.limit);

  return assets
    .map((asset, index) => ({ asset, index, score: scoreAsset(asset, tokens, type, license) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((entry) => summarizeAsset(entry.asset));
}

export function getAsset(catalog: unknown, id: string): Asset | undefined {
  return normalizeCatalog(catalog).find((asset) => asset.id === id);
}

export function getDownloadUrl(catalog: unknown, id: string, format: string): Download | undefined {
  const asset = getAsset(catalog, id);
  if (!asset) return undefined;

  const requestedFormat = normalizeFormat(format);
  return asset.downloads.find((download) => normalizeFormat(download.format) === requestedFormat);
}

export function normalizeCatalog(catalog: unknown): Asset[] {
  if (!isRecord(catalog)) return [];

  const items = asArray(catalog.items);
  if (items.length > 0) return items.flatMap(normalizeCatalogItem);

  return [
    ...normalizeManifest(catalog),
    ...normalizeMediaCatalog(catalog),
  ];
}

export function availableFormats(asset: Asset | undefined): string[] {
  if (!asset) return [];
  return [...new Set(asset.downloads.map((download) => download.format))];
}

function normalizeCatalogItem(item: unknown): Asset[] {
  if (!isRecord(item)) return [];

  const id = firstString(item.id, item.key, item.slug, item.path);
  const title = firstString(item.title, item.name, item.label, id);
  if (!id || !title) return [];

  const tags = uniqueStrings([
    ...asStringArray(item.tags),
    ...asStringArray(item.themes),
    ...asStringArray(item.categories),
    ...asStringArray(item.useCases),
    firstString(item.category),
  ]);
  const downloads = normalizeDownloads(item.downloads, item.download_url, item.downloadUrl, item.url, item.src, item.file);
  const asset: Asset = {
    id,
    type: firstString(item.type, item.kind, item.category) ?? "asset",
    title,
    description: firstString(item.description, item.summary),
    creator: firstString(item.creator, item.author, item.vendor, item.source),
    license: firstString(item.license, item.license_class, item.licenseClass),
    sourceUrl: firstString(item.sourceUrl, item.source_url, item.url, item.author_url),
    tags,
    downloads,
    metadata: pickMetadata(item, [
      "category",
      "source",
      "path",
      "pack",
      "vendor",
      "sourceUrl",
      "source_url",
      "attribution",
      "notes",
    ]),
    searchText: [
      id,
      title,
      firstString(item.type, item.kind, item.category),
      firstString(item.creator, item.author, item.vendor, item.source),
      firstString(item.license, item.license_class, item.licenseClass),
      firstString(item.description, item.summary),
      item.searchText,
      ...tags,
    ]
      .filter(Boolean)
      .join(" "),
  };

  return [asset];
}

function normalizeManifest(catalog: JsonRecord): Asset[] {
  return asArray(catalog.packs).flatMap((pack) => {
    if (!isRecord(pack)) return [];

    const vendor = firstString(pack.vendor) ?? "unknown";
    const packId = firstString(pack.pack, pack.id, pack.title) ?? "unknown-pack";
    const packTitle = firstString(pack.title, packId) ?? packId;
    const license = firstString(pack.license);
    const sourceUrl = firstString(pack.source);
    const creator = vendor;
    const packTags = uniqueStrings([
      ...asStringArray(pack.categories),
      ...asStringArray(pack.style),
      ...asStringArray(pack.themes),
      ...asStringArray(pack.tags),
      packTitle,
    ]);

    return asArray(pack.models).flatMap((model) => {
      if (!isRecord(model)) return [];

      const modelName = firstString(model.name, model.title, model.file);
      const title = firstString(model.title, modelName);
      const file = firstString(model.file);
      if (!modelName || !title || !file) return [];

      const tags = uniqueStrings([
        ...packTags,
        ...asStringArray(model.style),
        ...asStringArray(model.themes),
        ...asStringArray(model.tags),
        firstString(model.category),
        firstString(model.subcategory),
      ]);
      const downloads = normalizeDownloads(model.downloads, file);
      const id = `model:${vendor}/${packId}/${modelName}`;

      return [
        {
          id,
          type: "model",
          title,
          description: `${title} is a 3D model from ${packTitle}.`,
          creator,
          license,
          sourceUrl,
          tags,
          downloads,
          metadata: {
            vendor,
            pack: packId,
            packTitle,
            category: firstString(model.category),
            subcategory: firstString(model.subcategory),
            size: model.size,
          },
          searchText: [
            id,
            title,
            packTitle,
            vendor,
            license,
            firstString(model.category),
            firstString(model.subcategory),
            ...tags,
          ]
            .filter(Boolean)
            .join(" "),
        } satisfies Asset,
      ];
    });
  });
}

function normalizeMediaCatalog(catalog: JsonRecord): Asset[] {
  const artSamples = asArray(catalog.artPacks).flatMap((pack) => {
    if (!isRecord(pack)) return [];

    const packFolder = firstString(pack.folder);
    const packTitle = firstString(pack.title, packFolder) ?? "Untitled art pack";
    const creator = firstString(pack.author);
    const license = firstString(pack.license_class, pack.license);
    const sourceUrl = firstString(pack.url, pack.author_url);
    const packTags = uniqueStrings([
      ...asStringArray(pack.tags),
      ...asStringArray(pack.themes),
      ...asStringArray(pack.useCases),
      firstString(pack.category),
      firstString(pack.theme),
      packTitle,
    ]);

    return asArray(pack.samples).flatMap((sample) => {
      if (!isRecord(sample)) return [];

      const path = firstString(sample.path, sample.src);
      const label = firstString(sample.label, sample.path, sample.src);
      if (!path || !label) return [];

      const tags = uniqueStrings([
        ...packTags,
        ...asStringArray(sample.tags),
        ...asStringArray(sample.themes),
        ...asStringArray(sample.useCases),
        firstString(sample.category),
        firstString(sample.kind),
      ]);
      const id = `sprite:${path}`;

      return [
        {
          id,
          type: "sprite",
          title: `${packTitle} - ${label}`,
          description: firstString(sample.description, pack.description),
          creator,
          license,
          sourceUrl,
          tags,
          downloads: normalizeDownloads(undefined, sample.src, sample.path),
          metadata: {
            packFolder,
            packTitle,
            kind: firstString(sample.kind),
            animated: Boolean(sample.animated),
            attribution: firstString(pack.attribution),
          },
          searchText: [
            id,
            label,
            packTitle,
            creator,
            license,
            firstString(sample.kind),
            firstString(sample.description, pack.description),
            sample.searchText,
            pack.searchText,
            ...tags,
          ]
            .filter(Boolean)
            .join(" "),
        } satisfies Asset,
      ];
    });
  });

  const soundSamples = asArray(catalog.soundCollections).flatMap((collection) => {
    if (!isRecord(collection)) return [];

    const collectionTitle = firstString(collection.title, collection.id, collection.path) ?? "Untitled sound collection";
    const creator = firstString(collection.source, collection.organizationLabel);
    const license = firstString(collection.license);
    const sourceUrl = firstString(collection.url);
    const collectionTags = uniqueStrings([
      ...asStringArray(collection.tags),
      ...asStringArray(collection.themes),
      ...asStringArray(collection.useCases),
      firstString(collection.category),
      collectionTitle,
    ]);

    return asArray(collection.samples).flatMap((sample) => {
      if (!isRecord(sample)) return [];

      const path = firstString(sample.path, sample.src);
      const label = firstString(sample.label, sample.title, sample.path, sample.src);
      if (!path || !label) return [];

      const tags = uniqueStrings([
        ...collectionTags,
        ...asStringArray(sample.tags),
        ...asStringArray(sample.themes),
        ...asStringArray(sample.useCases),
        firstString(sample.category),
        firstString(sample.kind),
      ]);
      const id = `sound:${path}`;

      return [
        {
          id,
          type: "sound",
          title: `${collectionTitle} - ${label}`,
          description: firstString(sample.description, collection.description),
          creator,
          license,
          sourceUrl,
          tags,
          downloads: normalizeDownloads(undefined, sample.src, sample.path),
          metadata: {
            collectionTitle,
            collectionPath: firstString(collection.path),
            notes: firstString(collection.notes),
          },
          searchText: [
            id,
            label,
            collectionTitle,
            creator,
            license,
            firstString(sample.description, collection.description),
            sample.searchText,
            collection.searchText,
            ...tags,
          ]
            .filter(Boolean)
            .join(" "),
        } satisfies Asset,
      ];
    });
  });

  const musicTracks = asArray(catalog.musicTracks).flatMap((track) => {
    if (!isRecord(track)) return [];

    const path = firstString(track.path, track.src, track.title);
    const title = firstString(track.title, path);
    if (!path || !title) return [];

    const tags = uniqueStrings([
      ...asStringArray(track.tags),
      ...asStringArray(track.themes),
      ...asStringArray(track.useCases),
      firstString(track.category),
      firstString(track.source),
      title,
    ]);
    const id = `music:${path}`;

    return [
      {
        id,
        type: "music",
        title,
        description: firstString(track.description),
        creator: firstString(track.source),
        license: firstString(track.license),
        sourceUrl: firstString(track.url),
        tags,
        downloads: normalizeDownloads(undefined, track.src, track.path),
        metadata: {
          source: firstString(track.source),
          packId: firstString(track.packId),
          packTitle: firstString(track.packTitle),
          notes: firstString(track.notes),
        },
        searchText: [
          id,
          title,
          firstString(track.source),
          firstString(track.license),
          firstString(track.description),
          track.searchText,
          ...tags,
        ]
          .filter(Boolean)
          .join(" "),
      } satisfies Asset,
    ];
  });

  return [...artSamples, ...soundSamples, ...musicTracks];
}

function normalizeDownloads(downloads: unknown, ...fallbacks: unknown[]): Download[] {
  const normalized = asArray(downloads).flatMap((entry) => {
    if (typeof entry === "string") {
      return [{ format: formatFromUrl(entry), url: absolutizeUrl(entry) }];
    }
    if (!isRecord(entry)) return [];

    const url = firstString(entry.url, entry.href, entry.src, entry.file, entry.path);
    if (!url) return [];

    return [
      {
        format: firstString(entry.format, entry.type, entry.kind) ?? formatFromUrl(url),
        url: absolutizeUrl(url),
        label: firstString(entry.label, entry.title),
        optimized: typeof entry.optimized === "boolean" ? entry.optimized : undefined,
      },
    ];
  });

  if (normalized.length > 0) return dedupeDownloads(normalized);

  return dedupeDownloads(
    fallbacks.flatMap((fallback) => {
      if (typeof fallback !== "string" || fallback.length === 0) return [];
      return [{ format: formatFromUrl(fallback), url: absolutizeUrl(fallback) }];
    }),
  );
}

function summarizeAsset(asset: Asset): Asset {
  return {
    ...asset,
    tags: asset.tags.slice(0, 16),
    metadata: compactMetadata(asset.metadata),
  };
}

function scoreAsset(asset: Asset, tokens: string[], type: string, license: string): number {
  if (type && !typeMatches(asset.type, type, asset.searchText)) return 0;
  if (license && !normalizeText(asset.license ?? "").includes(license)) return 0;

  if (tokens.length === 0) return 1;

  const haystack = normalizeText(asset.searchText);
  let score = 0;
  for (const token of tokens) {
    if (!haystack.includes(token)) return 0;
    if (normalizeText(asset.title).includes(token)) score += 5;
    if (normalizeText(asset.id).includes(token)) score += 4;
    if (normalizeText(asset.tags.join(" ")).includes(token)) score += 3;
    score += 1;
  }
  return score;
}

function typeMatches(assetType: string, requested: string, searchText: string): boolean {
  const type = normalizeText(assetType);
  const haystack = normalizeText(`${assetType} ${searchText}`);
  if (type === requested || haystack.includes(requested)) return true;
  if (requested === "3d") return type === "model" || haystack.includes("3d");
  if (requested === "2d" || requested === "art") return ["sprite", "texture", "image"].includes(type) || haystack.includes("2d");
  if (requested === "audio") return type === "sound" || type === "music";
  return false;
}

function clampLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.trunc(limit ?? DEFAULT_LIMIT)));
}

function normalizeFormat(format: string): string {
  return normalizeText(format).replace(/^\./, "");
}

function formatFromUrl(url: string): string {
  const clean = url.split(/[?#]/, 1)[0] ?? url;
  const ext = clean.match(/\.([a-z0-9]+)$/i)?.[1];
  return ext?.toLowerCase() ?? "file";
}

function absolutizeUrl(url: string): string {
  try {
    return new URL(url, CATALOG_URL).toString();
  } catch {
    return url;
  }
}

function normalizeText(value: string): string {
  return value.toLowerCase().trim();
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asStringArray(value: unknown): string[] {
  return asArray(value).filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function uniqueStrings(values: unknown[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const text = firstString(value);
    if (!text) continue;
    const key = normalizeText(text);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function dedupeDownloads(downloads: Download[]): Download[] {
  const seen = new Set<string>();
  return downloads.filter((download) => {
    const key = `${normalizeFormat(download.format)} ${download.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function pickMetadata(record: JsonRecord, keys: string[]): JsonRecord {
  const out: JsonRecord = {};
  for (const key of keys) {
    if (record[key] !== undefined) out[key] = record[key];
  }
  return compactMetadata(out);
}

function compactMetadata(record: JsonRecord): JsonRecord {
  const out: JsonRecord = {};
  for (const [key, value] of Object.entries(record)) {
    if (value === undefined || value === null || value === "") continue;
    out[key] = value;
  }
  return out;
}
