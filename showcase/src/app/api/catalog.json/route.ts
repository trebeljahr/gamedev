import { licenseForVendor } from "@/lib/license";
import {
  assetUrl,
  downloadsForModel,
  manifest,
  modelFormatForFile,
} from "@/lib/manifest";
import {
  artPackSummaries,
  mediaSources,
  musicTracks,
  soundCollections,
  sourceMappings,
} from "@/lib/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_CONTROL = "public, s-maxage=3600, stale-while-revalidate=86400";
const DEFAULT_PER_PAGE = 100;
const MAX_PER_PAGE = 500;
const SCHEMA_ID = "https://gamedev.trebeljahr.com/api/catalog.json?schema=1";

type CatalogItemType = "model" | "sprite" | "sound" | "music" | "texture";

type CatalogDownload = {
  format: string;
  url: string;
  sizeBytes: number | null;
};

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

type SourceInfo = {
  name?: string;
  url?: string | null;
  license?: string;
};

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
  $id: SCHEMA_ID,
  title: "GameDev Asset Catalog Response",
  type: "object",
  additionalProperties: false,
  required: ["schema", "page", "per_page", "total", "total_pages", "items"],
  properties: {
    schema: {
      type: "string",
      const: SCHEMA_ID,
    },
    page: {
      type: "integer",
      minimum: 1,
    },
    per_page: {
      type: "integer",
      minimum: 1,
      maximum: MAX_PER_PAGE,
    },
    total: {
      type: "integer",
      minimum: 0,
    },
    total_pages: {
      type: "integer",
      minimum: 0,
    },
    items: {
      type: "array",
      items: {
        $ref: "#/$defs/catalogItem",
      },
    },
  },
  $defs: {
    catalogItem: {
      type: "object",
      additionalProperties: false,
      required: [
        "id",
        "name",
        "type",
        "license",
        "creator",
        "creatorUrl",
        "sourceUrl",
        "downloads",
      ],
      properties: {
        id: {
          type: "string",
          minLength: 1,
        },
        name: {
          type: "string",
          minLength: 1,
        },
        type: {
          type: "string",
          enum: ["model", "sprite", "sound", "music", "texture"],
        },
        license: {
          type: "string",
        },
        creator: {
          type: "string",
        },
        creatorUrl: {
          type: ["string", "null"],
          format: "uri",
        },
        sourceUrl: {
          type: ["string", "null"],
          format: "uri",
        },
        downloads: {
          type: "array",
          items: {
            $ref: "#/$defs/download",
          },
        },
      },
    },
    download: {
      type: "object",
      additionalProperties: false,
      required: ["format", "url", "sizeBytes"],
      properties: {
        format: {
          type: "string",
          minLength: 1,
        },
        url: {
          type: "string",
          format: "uri",
        },
        sizeBytes: {
          type: ["integer", "null"],
          minimum: 0,
        },
      },
    },
  },
} as const;

function jsonResponse(body: unknown): Response {
  return Response.json(body, {
    headers: {
      "Cache-Control": CACHE_CONTROL,
    },
  });
}

function positiveInt(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return parsed;
}

function absoluteUrl(value: string | null | undefined, request: Request): string | null {
  if (!value) return null;
  try {
    return new URL(value, request.url).toString();
  } catch {
    return null;
  }
}

function downloadUrl(value: string, request: Request): string {
  return absoluteUrl(assetUrl(value), request) ?? value;
}

function formatForUrl(value: string, fallback = "file"): string {
  const clean = value.split(/[?#]/, 1)[0].toLowerCase();
  const extension = clean.match(/\.([a-z0-9]+)$/)?.[1];
  return extension || fallback;
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

function modelItems(request: Request): CatalogItem[] {
  return manifest.packs.flatMap((pack) => {
    const vendorLicense = licenseForVendor(pack.vendor);
    const creatorUrl = absoluteUrl(vendorLicense.vendorUrl, request);
    const sourceUrl = creatorUrl;

    return pack.models.map((model) => ({
      id: `model:${pack.id}/${model.name}`,
      name: model.title,
      type: "model" as const,
      license: pack.license,
      creator: pack.source,
      creatorUrl,
      sourceUrl,
      downloads: downloadsForModel(model).map((download) => ({
        format: download.format || modelFormatForFile(download.file),
        url: downloadUrl(download.file, request),
        sizeBytes: null,
      })),
    }));
  });
}

function spriteItems(request: Request): CatalogItem[] {
  return artPackSummaries.map((pack) => {
    const downloads: CatalogDownload[] = [
      {
        format: "json",
        url: absoluteUrl(`/api/media/art/${encodeURIComponent(pack.folder)}`, request) ?? "",
        sizeBytes: null,
      },
    ];

    if (pack.preview?.src) {
      downloads.unshift({
        format: formatForUrl(pack.preview.src, "image"),
        url: downloadUrl(pack.preview.src, request),
        sizeBytes: null,
      });
    }

    return {
      id: `sprite:${pack.folder}`,
      name: pack.title,
      type: "sprite" as const,
      license: pack.license_class,
      creator: pack.author,
      creatorUrl: absoluteUrl(pack.author_url, request),
      sourceUrl: absoluteUrl(pack.url, request),
      downloads,
    };
  });
}

function soundCreatorFromNotes(notes: string, fallback: string): string {
  const match = notes.match(/\b(?:creator pack by|by)\s+([^.;]+)/i);
  return match?.[1]?.trim() || fallback;
}

function soundItems(request: Request): CatalogItem[] {
  return soundCollections.map((collection) => {
    const sourceInfo = sourceInfoFor(collection.source);
    const sourceUrl = absoluteUrl(collection.url ?? sourceInfo.url, request);

    return {
      id: `sound:${collection.id}`,
      name: collection.title,
      type: "sound" as const,
      license: collection.license,
      creator: soundCreatorFromNotes(collection.notes, sourceInfo.name ?? collection.source),
      creatorUrl: sourceUrl ?? absoluteUrl(sourceInfo.url, request),
      sourceUrl,
      downloads: collection.samples.map((sample) => ({
        format: formatForUrl(sample.src, "audio"),
        url: downloadUrl(sample.src, request),
        sizeBytes: sample.audio?.byteLength ?? null,
      })),
    };
  });
}

function musicItems(request: Request): CatalogItem[] {
  return musicTracks.map((track) => {
    const sourceInfo = sourceInfoFor(track.source);
    const sourceUrl = absoluteUrl(track.url ?? sourceInfo.url, request);

    return {
      id: `music:${track.path}`,
      name: track.title,
      type: "music" as const,
      license: track.license,
      creator: sourceInfo.name ?? track.source,
      creatorUrl: absoluteUrl(sourceInfo.url, request),
      sourceUrl,
      downloads: [
        {
          format: formatForUrl(track.src, "audio"),
          url: downloadUrl(track.src, request),
          sizeBytes: track.audio?.byteLength ?? null,
        },
      ],
    };
  });
}

function textureItems(request: Request): CatalogItem[] {
  return sourceMappings
    .filter((mapping) => mapping.medium === "texture")
    .map((mapping) => {
      const sourceInfo = sourceInfoFor(mapping.source);
      const sourceUrl = absoluteUrl(mapping.url ?? sourceInfo.url, request);

      return {
        id: `texture:${mapping.id}`,
        name: mapping.title,
        type: "texture" as const,
        license: mapping.license ?? sourceInfo.license ?? "See source metadata",
        creator: mapping.likelyCreator ?? sourceInfo.name ?? mapping.source,
        creatorUrl: absoluteUrl(sourceInfo.url, request),
        sourceUrl,
        downloads: sourceUrl
          ? [
              {
                format: "source",
                url: sourceUrl,
                sizeBytes: null,
              },
            ]
          : [],
      };
    });
}

function catalogItems(request: Request): CatalogItem[] {
  return [
    ...modelItems(request),
    ...spriteItems(request),
    ...soundItems(request),
    ...musicItems(request),
    ...textureItems(request),
  ].sort((a, b) => a.id.localeCompare(b.id));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("schema") === "1") {
    return jsonResponse(CATALOG_RESPONSE_SCHEMA);
  }

  const page = positiveInt(url.searchParams.get("page"), 1);
  const perPage = Math.min(positiveInt(url.searchParams.get("per_page"), DEFAULT_PER_PAGE), MAX_PER_PAGE);
  const items = catalogItems(request);
  const total = items.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / perPage);
  const start = (page - 1) * perPage;

  return jsonResponse({
    schema: SCHEMA_ID,
    page,
    per_page: perPage,
    total,
    total_pages: totalPages,
    items: items.slice(start, start + perPage),
  });
}
