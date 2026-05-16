#!/usr/bin/env bash
# List every R2 key and write it to out/r2-keys.txt (one key per line).
# Run via:
#   pnpm dotenvx run -f .env.production -f .env.local --ignore=MISSING_ENV_FILE \
#     --overload --quiet -- bash scripts/slug-assets/r2-plan.sh
#
# We do this in a separate step from the planner (r2-plan.ts) because
# rclone has the most reliable + fastest paginated lister for R2 buckets.

set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
OUT="$SCRIPT_DIR/out/r2-keys.txt"
mkdir -p "$(dirname "$OUT")"

require() { if [ -z "${!1:-}" ]; then echo "Missing env: $1" >&2; exit 1; fi; }
require R2_ENDPOINT
require R2_ACCESS_KEY_ID
require R2_SECRET_ACCESS_KEY
R2_ASSETS_BUCKET="${R2_ASSETS_BUCKET:-gamedev-assets}"

echo "[r2-plan] listing :s3:$R2_ASSETS_BUCKET …"
docker run --rm \
  -e RCLONE_CONFIG=/dev/null \
  -e RCLONE_S3_PROVIDER=Cloudflare \
  -e RCLONE_S3_ENDPOINT="$R2_ENDPOINT" \
  -e RCLONE_S3_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
  -e RCLONE_S3_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
  rclone/rclone:latest \
  lsf -R ":s3:$R2_ASSETS_BUCKET" --files-only > "$OUT"

wc -l "$OUT"
