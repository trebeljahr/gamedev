#!/usr/bin/env bash
# Apply the renames from out/r2-moves.tsv to the R2 bucket using `rclone
# moveto` (server-side copy + delete, no payload re-upload). Parent
# prefixes get moved before their grandchildren so we don't briefly
# orphan keys.
#
# Use through pnpm so env decryption + .env layering matches the rest of
# the asset pipeline:
#   dotenvx run -f ../../.env.production -f ../../.env.local --ignore=MISSING_ENV_FILE \
#     --overload --quiet -- bash scripts/slug-assets/apply-r2.sh [--dry-run]
#
# Required env (same as scripts/sync-assets.sh):
#   R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ASSETS_BUCKET
#
# Notes:
# - `rclone moveto` works on individual objects. For dir-rename plan
#   entries the children get their own moveto calls (planner emits one
#   entry per file + one per dir), so we don't rely on dir-level move
#   semantics. Empty dirs don't exist as keys in S3/R2 — only files do —
#   so the dir entries in the plan act as a record but don't need to be
#   moved on R2; we filter them out.

set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
MOVES_TSV="$SCRIPT_DIR/out/r2-moves.tsv"

if [ ! -f "$MOVES_TSV" ]; then
  echo "Missing $MOVES_TSV. Run r2-plan.sh + r2-plan.ts first." >&2
  exit 1
fi

require() {
  if [ -z "${!1:-}" ]; then
    echo "Missing required env var: $1" >&2
    exit 1
  fi
}
require R2_ENDPOINT
require R2_ACCESS_KEY_ID
require R2_SECRET_ACCESS_KEY
R2_ASSETS_BUCKET="${R2_ASSETS_BUCKET:-gamedev-assets}"

DRY_FLAG=""
if [ "${1:-}" = "--dry-run" ] || [ "${1:-}" = "--dry" ]; then
  DRY_FLAG="--dry-run"
fi

PARALLEL="${R2_APPLY_PARALLEL:-32}"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not found on PATH." >&2
  exit 1
fi

# r2-plan.ts emits a file-only moves list (R2 listing only contains
# objects = files, no directory entries). Use it as-is.
TOTAL=$(wc -l < "$MOVES_TSV" | tr -d ' ')
echo "[r2-apply] $TOTAL file moves queued (dry-run: ${DRY_FLAG:-no}, parallel: $PARALLEL)"

# One container, parallel moveto via xargs -P. Each moveto = HEAD + COPY
# + DELETE (server-side, free under R2). With high parallelism the wall
# time for ~120k files drops from hours to ~20-30 min, throttled by R2's
# rate limits rather than rclone's own concurrency.
docker run --rm \
  -v "$MOVES_TSV:/moves.tsv:ro" \
  -e RCLONE_CONFIG=/dev/null \
  -e RCLONE_S3_PROVIDER=Cloudflare \
  -e RCLONE_S3_ENDPOINT="$R2_ENDPOINT" \
  -e RCLONE_S3_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
  -e RCLONE_S3_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
  -e BUCKET="$R2_ASSETS_BUCKET" \
  -e DRY_FLAG="$DRY_FLAG" \
  -e PARALLEL="$PARALLEL" \
  --entrypoint sh \
  rclone/rclone:latest \
  -c '
set -e
total=$(wc -l < /moves.tsv | tr -d " ")
echo "[r2-apply] starting $PARALLEL workers over $total moves"

# Atomic counter via mkdir; each worker bumps it after success and logs
# progress every 1000 moves.
COUNT_DIR=/tmp/r2-count
rm -rf "$COUNT_DIR" && mkdir "$COUNT_DIR"

# xargs -L 1 sends one line per rclone call; -P spawns parallel workers.
# Each line is "OLD\tNEW" — sh -c uses positional args $1,$2.
awk -F"\t" -v dry="$DRY_FLAG" "NF==2 && \$1 != \$2 {print \$1 \"\\t\" \$2}" /moves.tsv \
| xargs -L 1 -P "$PARALLEL" -I {} sh -c '"'"'
  pair="$1"
  OLD="${pair%%	*}"
  NEW="${pair#*	}"
  rclone moveto $DRY_FLAG ":s3:$BUCKET/$OLD" ":s3:$BUCKET/$NEW" \
    --header-upload "Cache-Control: public, max-age=31536000, immutable" \
    --low-level-retries 10 \
    --retries 3 \
    --no-traverse \
    --quiet \
    >/tmp/r2-last.out 2>&1 || {
      printf "FAIL\t%s\t%s\n" "$OLD" "$NEW" >&2
      cat /tmp/r2-last.out >&2 || true
    }
  # Tick the counter; print progress milestones.
  fname="$COUNT_DIR/$$.$RANDOM"
  : > "$fname"
  n=$(ls "$COUNT_DIR" | wc -l | tr -d " ")
  if [ $((n % 1000)) -eq 0 ]; then
    echo "[r2-apply] $n / $TOTAL_HINT"
  fi
'"'"' _ {}
echo "[r2-apply] done"
' 2>&1

