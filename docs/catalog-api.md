# Catalog JSON API

`GET /api/catalog.json` returns a machine-readable catalog for the 3D model library plus sprite, sound, music, and texture entries used by coding agents.

It is a static file, written at build time by `showcase/scripts/build-static-site.ts` and served by Cloudflare Workers static assets with the default `Cache-Control: public, max-age=0, must-revalidate` and an `ETag`.

## One response, no pagination

Until October 2026 a route handler paged the catalog with `page` and `per_page` (100 by default, 500 at most). A static file cannot read the query string, so the endpoint now returns every item in one response and ignores all query parameters:

- `page` is always `1` and `total_pages` is `1` (or `0` for an empty catalog).
- `per_page` equals `total`.

A client that requests page 1 and stops at `total_pages` gets the whole catalog in one request. A client that requests `page=2` gets the same full response again, so it must stop at `total_pages`, not at an empty `items` array.

Example response shape:

```json
{
  "schema": "https://gamedev.trebeljahr.com/api/catalog.schema.json",
  "page": 1,
  "per_page": 7472,
  "total": 7472,
  "total_pages": 1,
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
          "url": "https://assets.gamedev.trebeljahr.com/raw/kaykit/adventurers/extracted/kaykit-adventurers-2-0-free/assets/fbx-unity/arrow_bow.fbx",
          "sizeBytes": null
        }
      ]
    }
  ]
}
```

`creatorUrl`, `sourceUrl`, and `downloads[].sizeBytes` are `null` when the catalog has no verified value.

Sprite items list a `json` download: the full pack with resolved sample URLs, at `/api/media/art-json/<pack folder>.json`. The older `/api/media/art/<url-encoded folder>` form still answers (a redirect to that file).

## JSON Schema

`GET /api/catalog.schema.json` returns the response schema; each response names it in `schema`. The older `GET /api/catalog.json?schema=1` cannot be told apart from a catalog request any more and returns the catalog.

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

const response = await fetch("https://gamedev.trebeljahr.com/api/catalog.json", {
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
