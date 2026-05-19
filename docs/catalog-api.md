# Catalog JSON API

`GET /api/catalog.json` returns a paginated, machine-readable catalog for the 3D model library plus sprite, sound, music, and texture entries used by coding agents.

Responses set:

```http
Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400
```

## Pagination

- `page`: 1-based page number. Defaults to `1`.
- `per_page`: page size. Defaults to `100`; values above `500` are capped to `500`.

Example response shape:

```json
{
  "schema": "https://gamedev.trebeljahr.com/api/catalog.json?schema=1",
  "page": 1,
  "per_page": 100,
  "total": 6432,
  "total_pages": 65,
  "items": [
    {
      "id": "model:kaykit/adventurers/arrow-bow",
      "name": "Arrow Bow",
      "type": "model",
      "license": "CC0 1.0",
      "creator": "KayKit",
      "creatorUrl": "https://kaylousberg.com/",
      "sourceUrl": "https://kaylousberg.com/",
      "downloads": [
        {
          "format": "fbx",
          "url": "https://gamedev.trebeljahr.com/raw/kaykit/adventurers/extracted/kaykit-adventurers-2-0-free/assets/fbx-unity/arrow_bow.fbx",
          "sizeBytes": null
        }
      ]
    }
  ]
}
```

`creatorUrl`, `sourceUrl`, and `downloads[].sizeBytes` are `null` when the catalog has no verified value.

## JSON Schema

`GET /api/catalog.json?schema=1` returns the response schema:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://gamedev.trebeljahr.com/api/catalog.json?schema=1",
  "title": "GameDev Asset Catalog Response",
  "type": "object",
  "additionalProperties": false,
  "required": ["schema", "page", "per_page", "total", "total_pages", "items"],
  "properties": {
    "schema": {
      "type": "string",
      "const": "https://gamedev.trebeljahr.com/api/catalog.json?schema=1"
    },
    "page": {
      "type": "integer",
      "minimum": 1
    },
    "per_page": {
      "type": "integer",
      "minimum": 1,
      "maximum": 500
    },
    "total": {
      "type": "integer",
      "minimum": 0
    },
    "total_pages": {
      "type": "integer",
      "minimum": 0
    },
    "items": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/catalogItem"
      }
    }
  },
  "$defs": {
    "catalogItem": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "id",
        "name",
        "type",
        "license",
        "creator",
        "creatorUrl",
        "sourceUrl",
        "downloads"
      ],
      "properties": {
        "id": {
          "type": "string",
          "minLength": 1
        },
        "name": {
          "type": "string",
          "minLength": 1
        },
        "type": {
          "type": "string",
          "enum": ["model", "sprite", "sound", "music", "texture"]
        },
        "license": {
          "type": "string"
        },
        "creator": {
          "type": "string"
        },
        "creatorUrl": {
          "type": ["string", "null"],
          "format": "uri"
        },
        "sourceUrl": {
          "type": ["string", "null"],
          "format": "uri"
        },
        "downloads": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/download"
          }
        }
      }
    },
    "download": {
      "type": "object",
      "additionalProperties": false,
      "required": ["format", "url", "sizeBytes"],
      "properties": {
        "format": {
          "type": "string",
          "minLength": 1
        },
        "url": {
          "type": "string",
          "format": "uri"
        },
        "sizeBytes": {
          "type": ["integer", "null"],
          "minimum": 0
        }
      }
    }
  }
}
```

## Example Fetch

```ts
type CatalogDownload = {
  format: string;
  url: string;
  sizeBytes: number | null;
};

type CatalogItem = {
  id: string;
  name: string;
  type: "model" | "sprite" | "sound" | "music" | "texture";
  license: string;
  creator: string;
  creatorUrl: string | null;
  sourceUrl: string | null;
  downloads: CatalogDownload[];
};

const response = await fetch("https://gamedev.trebeljahr.com/api/catalog.json?page=1&per_page=100", {
  headers: { Accept: "application/json" },
});

if (!response.ok) {
  throw new Error(`Catalog fetch failed: ${response.status}`);
}

const catalog = (await response.json()) as {
  schema: string;
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
  items: CatalogItem[];
};

const glbModels = catalog.items.filter((item) =>
  item.downloads.some((download) => download.format === "glb"),
);
```
