# Cache Rules

## Binary Asset Responses

`showcase/next.config.js` adds:

`Cache-Control: public, max-age=31536000, immutable`

for Next-served paths ending in these extensions only:

`.glb`, `.gltf`, `.fbx`, `.obj`, `.mp3`, `.wav`, `.ogg`, `.png`

The matcher does not cover HTML routes or extensionless app routes.

## Cache Busting Status

Verified asset URL generation does not currently guarantee cache busting for
all immutable binary asset URLs:

- `showcase/src/lib/manifest.ts` `assetUrl()` only prefixes
  `NEXT_PUBLIC_ASSETS_BASE_URL`; it does not add a content hash, version query,
  or version path segment.
- Generated catalogs use source paths such as `/glb/...`, `/raw/...`,
  `/2D/.../*.png`, and `/sounds/.../*.ogg`. Some filenames include upstream
  random IDs, but that pattern is not universal and should not be treated as a
  content hash.
- The gitignored `assets/` payload mirrors to R2 with the same object keys, and
  `scripts/sync-assets.sh` syncs by size under those stable keys.
- Next public PNGs such as `/favicon.png` and `/apple-touch-icon.png` are fixed
  paths.

Follow-up: add a content hash or explicit version segment to every mutable
binary asset URL before depending on one-year immutable caching for updated
assets.
