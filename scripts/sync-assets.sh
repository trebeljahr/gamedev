#!/usr/bin/env bash
# Mirror ./assets/ → an S3-compatible bucket (Cloudflare R2 by default)
# using rclone running in a throwaway docker container. No host install.
#
# Why rclone:
#   - retry + resume on flaky uplinks
#   - per-file multipart for the big originals
#   - --bwlimit, --transfers, --checkers tunables built in
#   - mature progress + stats reporting
#
# Re-runnable: rclone's `sync` is incremental (size-only by default),
# so this is safe to call after every download/cleanup pass.
#
# Env loading: package.json's `assets:sync` invokes this via `dotenvx run`
# which decrypts .env.production and layers .env.local on top before exec.
# So the four R2 vars below can live in either file (encrypted in
# .env.production for cross-machine sharing, plaintext in .env.local for
# per-machine overrides).
#
# Required env:
#   R2_ENDPOINT             https://<account-id>.r2.cloudflarestorage.com
#   R2_ACCESS_KEY_ID        R2 API token, write access to the assets bucket
#   R2_SECRET_ACCESS_KEY    ↑
#   R2_ASSETS_BUCKET        bucket name (default: gamedev-assets)
#
# Any extra args are forwarded to `rclone sync`, e.g.:
#   pnpm assets:sync -- --dry-run
#   pnpm assets:sync -- --bwlimit 10M
#   pnpm assets:sync -- --include 'glb/quaternius/**'
#   pnpm assets:sync -- -P                  # show the live progress bar

set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT="$( dirname "$SCRIPT_DIR" )"
ASSETS_DIR="${ASSETS_DIR:-$ROOT/assets}"

require() {
  if [ -z "${!1:-}" ]; then
    echo "Missing required env var: $1" >&2
    echo "Add it (encrypted) to .env.production or to .env.local." >&2
    exit 1
  fi
}
require R2_ENDPOINT
require R2_ACCESS_KEY_ID
require R2_SECRET_ACCESS_KEY

R2_ASSETS_BUCKET="${R2_ASSETS_BUCKET:-gamedev-assets}"

if [ ! -d "$ASSETS_DIR" ]; then
  echo "assets/ not found at $ASSETS_DIR — nothing to sync." >&2
  echo "Set ASSETS_DIR=<path> if your assets live elsewhere." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not found on PATH. Install Docker Desktop and retry." >&2
  exit 1
fi

# pnpm forwards `pnpm assets:sync -- <args>` to the script as `-- <args>`.
# rclone interprets a literal `--` as end-of-flags, which would turn
# `--dry-run` etc. into positional args. Drop the leading separator.
if [ "${1:-}" = "--" ]; then shift; fi

DOCKER_FLAGS=(--rm)
if [ -t 1 ]; then
  # Allocate a pseudo-TTY when stdout is a terminal so rclone --progress
  # can draw its in-place dashboard. -t alone (no -i) avoids docker
  # errors when stdin isn't attached (the common pnpm-wrapped case).
  # TERM must be forwarded explicitly — without it the container falls
  # back to dumb mode and rclone skips the cursor-position escapes that
  # make the dashboard redraw in place.
  DOCKER_FLAGS+=(-t -e "TERM=${TERM:-xterm-256color}")
fi

echo "[sync] starting rclone (assets/ → :s3:$R2_ASSETS_BUCKET)"
echo "[sync] expect a quiet 2-3 min while --fast-list pulls the full remote"
echo "[sync] index (~10k+ objects in this bucket), then per-file activity"
echo "[sync] once transfers begin."

# `:s3:<bucket>` is rclone's ad-hoc remote prefix — backend config from
# RCLONE_S3_* env vars, no rclone.conf needed. provider=Cloudflare picks
# the R2-specific quirks (region=auto, etc.).
#
# Exclude rules:
#   - .DS_Store / ._* macOS metadata
#   - node_modules / .next / .git: should never appear under assets/ but
#     belt-and-braces in case someone drops a stray scaffold in there
#   - .gitattributes / .gitignore: shouldn't be there either
exec docker run "${DOCKER_FLAGS[@]}" \
  -v "$ASSETS_DIR:/data:ro" \
  -e RCLONE_CONFIG=/dev/null \
  -e RCLONE_S3_PROVIDER=Cloudflare \
  -e RCLONE_S3_ENDPOINT="$R2_ENDPOINT" \
  -e RCLONE_S3_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
  -e RCLONE_S3_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
  rclone/rclone:latest \
  sync /data ":s3:$R2_ASSETS_BUCKET" \
  --header-upload "Cache-Control: public, max-age=31536000, immutable" \
  --size-only \
  --fast-list \
  --skip-links \
  --transfers 16 \
  --checkers 8 \
  --low-level-retries 20 \
  --stats 5s \
  --stats-one-line \
  --stats-one-line-date \
  --verbose \
  --exclude '.DS_Store' \
  --exclude '._*' \
  --exclude '.git/**' \
  --exclude '.gitignore' \
  --exclude '.gitattributes' \
  --exclude 'node_modules/**' \
  --exclude '.next/**' \
  "$@"
