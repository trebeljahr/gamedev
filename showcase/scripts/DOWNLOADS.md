# Durable model and pack downloads

Download links point straight at immutable objects on the independent asset
origin; the site never owns the byte stream. The static build
(`scripts/build-static-site.ts`) validates every object path and writes one map
per pack (`/api/downloads/<vendor>/<pack>.json`), which the download buttons
fetch, plus a `_redirects` 307 per pack ZIP URL (`/api/packs/<vendor>/<pack>/zip`).
Old `/api/models/download?file=…` links land on a static page that forwards in
the browser. R2 supports byte ranges; clients may resume the same
content-addressed URL.

`public/downloads.json` maps allowed catalog paths and existing UI filenames
to SHA256-addressed model snapshots and deterministic ZIP files. Pack generation
fails on a missing model; it cannot publish an incomplete archive. Existing
client-side ZIP workers remain available and already fetch directly from R2.

When the manifest or downloadable bytes change:

1. Generate objects from the complete local assets tree (run inside `showcase`):
   `node --import tsx scripts/build-download-artifacts.ts --assets-root /absolute/assets --output-root /absolute/download-objects`.
   The output must be outside the source assets tree. It contains no credentials.
2. Publish only after the normal deployment authorization, with the existing R2
   environment credentials and `DOWNLOAD_ARTIFACTS_DIR` set to that output:
   `bash scripts/publish-download-artifacts.sh` from the repository root.
   This uses append-only `rclone copy --immutable`, attachment headers, and
   immutable caching. It does not delete retained objects.
3. Run `node showcase/scripts/check-download-artifacts.mjs --full` from the root.
   Every object must pass size, attachment, range, caching and full SHA256 checks.
   This is a read-only public-object verification, with eight workers.
4. Commit the generated `downloads.json` with the source manifest/change, then
   build the release. The build checks the manifest hash. CI also checks every
   referenced remote object's headers before uploading a site version.

Keep all published `/downloads/v1/` objects. Deleting one can break an open tab,
a paused download, or a rollback. The regular asset sync excludes that namespace.
Storage retention is an external requirement; the site's deploys do not bound
download duration. Regenerate and publish before changing a source asset
whose path remains the same.

For local development, pass `DOWNLOAD_ARTIFACTS_DIR` to `scripts/serve-assets.mjs`;
it serves the same immutable paths with attachment and Range support.

Validation (inside `showcase`):

- `node --import tsx --test scripts/durable-download.test.ts`
