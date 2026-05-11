#!/usr/bin/env node
/**
 * Native Node static file server for ./assets/. Local-dev counterpart to
 * the R2 bucket the showcase reads from in prod. Same URL shape both
 * places so the showcase doesn't care which side it's hitting.
 *
 * URL rewrites (kept so the build-manifest URLs match both backends):
 *   GET /glb/<path>  → assets/glb/<path>
 *   GET /raw/<path>  → assets/raw/<path>
 *   GET /<rest>      → assets/<rest>          (textures, sounds, 2D, …)
 *
 * R2 mirrors the same layout: gamedev-assets/glb/, gamedev-assets/raw/, etc.
 * Deliberately minimal — no directory listing, no index.html, no writes.
 */

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(process.env.ASSETS_DIR ?? join(__dirname, "..", "assets"));
const PORT = Number.parseInt(process.env.PORT ?? "9101", 10);
const HOST = process.env.HOST ?? "127.0.0.1";

const MIME = /** @type {const} */ ({
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".bin": "application/octet-stream",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ktx2": "image/ktx2",
  ".basis": "application/octet-stream",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".flac": "audio/flac",
  ".opus": "audio/ogg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
});

// Cross-origin GETs from the Next dev server (different port) need an
// explicit ACAO. R2's public bucket sends `*` by default, so we mirror that.
const CORS_HEADERS = /** @type {const} */ ({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD",
  "Access-Control-Max-Age": "86400",
});

const REWRITES = /** @type {Record<string, string>} */ ({
  glb: "glb",
  raw: "raw",
});

function safeResolve(reqPath) {
  const decoded = decodeURIComponent(reqPath.replace(/^\/+/, ""));
  if (!decoded) return null;
  const [head, ...rest] = decoded.split("/");
  // Top-level prefix lookup so `/glb/foo.glb` and `/raw/bar.gltf` stay
  // structurally explicit; everything else falls through to the literal
  // path under ROOT (textures, sounds, vector-tilesets, …).
  const segments =
    head in REWRITES ? [REWRITES[head], ...rest] : [head, ...rest];
  const absolute = join(ROOT, normalize(segments.join("/")));
  if (!absolute.startsWith(ROOT + "/") && absolute !== ROOT) return null;
  return absolute;
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD", ...CORS_HEADERS });
      res.end();
      return;
    }
    const url = req.url ?? "/";
    const path = safeResolve(url.split("?")[0]);
    if (!path) {
      res.writeHead(403, CORS_HEADERS);
      res.end("forbidden");
      return;
    }

    let stats;
    try {
      stats = await stat(path);
      if (!stats.isFile()) throw new Error("not a file");
    } catch {
      res.writeHead(404, CORS_HEADERS);
      res.end("not found");
      return;
    }

    const mime =
      MIME[/** @type {keyof typeof MIME} */ (extname(path).toLowerCase())] ??
      "application/octet-stream";

    // HTTP Range — three.js/drei sometimes does partial fetches, and the
    // /all view streams many files in parallel; without range support a
    // dropped connection forces a full re-fetch.
    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d+)-(\d*)/.exec(range);
      if (m) {
        const start = Number.parseInt(m[1], 10);
        const end = m[2] ? Number.parseInt(m[2], 10) : stats.size - 1;
        if (start >= stats.size || end >= stats.size || start > end) {
          res.writeHead(416, {
            ...CORS_HEADERS,
            "Content-Range": `bytes */${stats.size}`,
          });
          res.end();
          return;
        }
        res.writeHead(206, {
          ...CORS_HEADERS,
          "Content-Type": mime,
          "Content-Range": `bytes ${start}-${end}/${stats.size}`,
          "Accept-Ranges": "bytes",
          "Content-Length": String(end - start + 1),
          "Cache-Control": "public, max-age=31536000, immutable",
        });
        if (req.method === "HEAD") {
          res.end();
          return;
        }
        createReadStream(path, { start, end }).pipe(res);
        return;
      }
    }

    res.writeHead(200, {
      ...CORS_HEADERS,
      "Content-Type": mime,
      "Content-Length": String(stats.size),
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=31536000, immutable",
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    createReadStream(path).pipe(res);
  } catch (err) {
    console.error("[assets]", err);
    if (!res.headersSent) {
      res.writeHead(500, CORS_HEADERS);
      res.end("internal");
    } else {
      res.end();
    }
  }
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`[assets] serving ${ROOT} → http://${HOST}:${PORT}\n`);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
