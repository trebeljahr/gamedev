#!/usr/bin/env bash
# Append content-addressed objects. Never sync/delete this retained namespace.
set -euo pipefail
: "${DOWNLOAD_ARTIFACTS_DIR:?Set DOWNLOAD_ARTIFACTS_DIR to the generated objects directory}"
: "${R2_ENDPOINT:?Missing R2_ENDPOINT}"
: "${R2_ACCESS_KEY_ID:?Missing R2_ACCESS_KEY_ID}"
: "${R2_SECRET_ACCESS_KEY:?Missing R2_SECRET_ACCESS_KEY}"
command -v rclone >/dev/null || { echo 'Install rclone before publishing.' >&2; exit 1; }
[ -d "$DOWNLOAD_ARTIFACTS_DIR" ] || { echo 'Artifact directory missing.' >&2; exit 1; }
export RCLONE_CONFIG=/dev/null RCLONE_S3_PROVIDER=Cloudflare
export RCLONE_S3_ENDPOINT="$R2_ENDPOINT" RCLONE_S3_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" RCLONE_S3_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
rclone copy "$DOWNLOAD_ARTIFACTS_DIR" ":s3:${R2_ASSETS_BUCKET:-gamedev-assets}/downloads/v1" \
  --immutable --skip-links --exclude '.staging-*' \
  --header-upload 'Content-Disposition: attachment' \
  --header-upload 'Cache-Control: public, max-age=31536000, immutable' \
  --transfers 4 --checkers 4 --low-level-retries 10 --stats 30s "$@"
# Full-byte verification is a separate, read-only step. Run it after upload:
# node showcase/scripts/check-download-artifacts.mjs --full
