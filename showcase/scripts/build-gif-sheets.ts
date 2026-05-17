/**
 * Converts every animated GIF under ASSETS_DIR into a static PNG sprite sheet
 * (horizontal strip when feasible, multi-row grid when frames are too wide for
 * an 8K strip). The output filename embeds the frame size (`__strip-WxH.sheet.png`)
 * so existing grid-hint detection (parseSpriteSizeHint / parseGridHint) recovers
 * the layout without a sidecar. A sidecar `.sheet.json` is also written for
 * tooling that wants exact frame counts and timing.
 *
 * Run before build-manifest.ts / build-media-assets.ts so the walkers pick up
 * the .sheet.png files and skip the original .gif (see those scripts for the
 * sibling-aware filter).
 */
import { existsSync } from "node:fs";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import sharp from "sharp";

const SHOWCASE_DIR = join(__dirname, "..");
const REPO_ROOT = join(SHOWCASE_DIR, "..");
const ASSETS_ROOT = process.env.ASSETS_DIR
  ? process.env.ASSETS_DIR
  : join(REPO_ROOT, "assets");

const MAX_STRIP_WIDTH = 8192;
const MIN_FRAMES = 2;

type SheetMetadata = {
  source: string;
  frameCount: number;
  cols: number;
  rows: number;
  frameWidth: number;
  frameHeight: number;
  delayMs: number[];
};

function isJunkPath(path: string): boolean {
  return /(^|\/)(__MACOSX|\.DS_Store)(\/|$)/i.test(path) || /(^|\/)\._/.test(path);
}

async function walkGifs(dir: string): Promise<string[]> {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop()!;
    let entries;
    try {
      entries = await readdir(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const p = join(d, entry.name);
      if (isJunkPath(p)) continue;
      if (entry.isDirectory()) stack.push(p);
      else if (entry.isFile() && /\.gif$/i.test(entry.name)) out.push(p);
    }
  }
  return out;
}

function sheetPaths(gifAbs: string, frameWidth: number, frameHeight: number) {
  const base = gifAbs.replace(/\.gif$/i, "");
  const suffix = `__strip-${frameWidth}x${frameHeight}.sheet`;
  return {
    png: `${base}${suffix}.png`,
    json: `${base}${suffix}.json`,
  };
}

async function existingSheetIsCurrent(gifAbs: string, base: string): Promise<boolean> {
  const dir = dirname(gifAbs);
  let entries;
  try {
    entries = await readdir(dir);
  } catch {
    return false;
  }
  const expectedPrefix = `${base}__strip-`;
  const candidate = entries.find(
    (name) => name.startsWith(expectedPrefix) && name.endsWith(".sheet.png"),
  );
  if (!candidate) return false;
  const candidateAbs = join(dir, candidate);
  try {
    const [gifStat, sheetStat] = await Promise.all([stat(gifAbs), stat(candidateAbs)]);
    return sheetStat.mtimeMs >= gifStat.mtimeMs;
  } catch {
    return false;
  }
}

function pickGrid(frameCount: number, frameWidth: number): { cols: number; rows: number } {
  const maxCols = Math.max(1, Math.floor(MAX_STRIP_WIDTH / Math.max(1, frameWidth)));
  if (frameCount <= maxCols) return { cols: frameCount, rows: 1 };
  // Prefer near-square layout when frames don't fit on one row.
  const cols = Math.min(maxCols, Math.ceil(Math.sqrt(frameCount)));
  const rows = Math.ceil(frameCount / cols);
  return { cols, rows };
}

async function extractFrame(file: string, page: number): Promise<Buffer> {
  return sharp(file, { animated: true, page, pages: 1, failOn: "none" })
    .ensureAlpha()
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function buildSheet(gifAbs: string): Promise<"written" | "skipped" | "single-frame" | "failed"> {
  const base = gifAbs.replace(/\.gif$/i, "");
  const baseName = base.split("/").pop() ?? base;
  const baseDir = dirname(gifAbs);
  let pages = 0;
  let pageHeight = 0;
  let width = 0;
  let delay: number[] = [];
  try {
    const meta = await sharp(gifAbs, { animated: true, failOn: "none" }).metadata();
    pages = meta.pages ?? 1;
    pageHeight = meta.pageHeight ?? meta.height ?? 0;
    width = meta.width ?? 0;
    delay = Array.isArray(meta.delay) ? [...meta.delay] : [];
  } catch (err) {
    console.warn(`[gif-sheets] metadata failed for ${gifAbs}: ${(err as Error).message}`);
    return "failed";
  }
  if (pages < MIN_FRAMES || pageHeight <= 0 || width <= 0) return "single-frame";
  if (await existingSheetIsCurrent(gifAbs, baseName)) return "skipped";

  const frameWidth = width;
  const frameHeight = pageHeight;
  const { cols, rows } = pickGrid(pages, frameWidth);
  const { png: outPng, json: outJson } = sheetPaths(gifAbs, frameWidth, frameHeight);

  const composites: sharp.OverlayOptions[] = [];
  for (let i = 0; i < pages; i += 1) {
    const buffer = await extractFrame(gifAbs, i);
    const col = i % cols;
    const row = Math.floor(i / cols);
    composites.push({ input: buffer, left: col * frameWidth, top: row * frameHeight });
  }

  const canvasWidth = cols * frameWidth;
  const canvasHeight = rows * frameHeight;

  await mkdir(baseDir, { recursive: true });
  await sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png({ compressionLevel: 9 })
    .toFile(outPng);

  const metadata: SheetMetadata = {
    source: relative(ASSETS_ROOT, gifAbs).split("/").join("/"),
    frameCount: pages,
    cols,
    rows,
    frameWidth,
    frameHeight,
    delayMs: delay,
  };
  await writeFile(outJson, `${JSON.stringify(metadata, null, 2)}\n`);
  return "written";
}

const RESULT_GLYPH: Record<"written" | "skipped" | "single-frame" | "failed", string> = {
  written: "+",
  skipped: "=",
  "single-frame": ".",
  failed: "!",
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = Math.round(seconds - minutes * 60);
  return `${minutes}m${rem.toString().padStart(2, "0")}s`;
}

async function main() {
  const startedAt = Date.now();
  if (!existsSync(ASSETS_ROOT)) {
    console.warn(`[gif-sheets] assets dir not found: ${ASSETS_ROOT}`);
    return;
  }
  console.log(`[gif-sheets] scanning ${ASSETS_ROOT}`);
  const gifs = await walkGifs(ASSETS_ROOT);
  if (gifs.length === 0) {
    console.log(`[gif-sheets] no gifs under ${ASSETS_ROOT}`);
    return;
  }
  const total = gifs.length;
  const padWidth = String(total).length;
  console.log(`[gif-sheets] found ${total} gif(s); converting…`);
  const tallies = { written: 0, skipped: 0, "single-frame": 0, failed: 0 };
  for (let index = 0; index < total; index += 1) {
    const gif = gifs[index];
    const rel = relative(ASSETS_ROOT, gif).split("/").join("/");
    const itemStart = Date.now();
    let result: "written" | "skipped" | "single-frame" | "failed";
    let errorMessage: string | null = null;
    try {
      result = await buildSheet(gif);
    } catch (err) {
      result = "failed";
      errorMessage = (err as Error).message;
    }
    tallies[result] += 1;
    const glyph = RESULT_GLYPH[result];
    const counter = `${String(index + 1).padStart(padWidth, " ")}/${total}`;
    const duration = formatDuration(Date.now() - itemStart);
    const suffix = errorMessage ? ` — ${errorMessage}` : "";
    console.log(`[gif-sheets] ${counter} ${glyph} ${result.padEnd(12)} ${duration.padStart(6)}  ${rel}${suffix}`);
  }
  const elapsed = formatDuration(Date.now() - startedAt);
  console.log(
    `[gif-sheets] done in ${elapsed} · ${tallies.written} written · ${tallies.skipped} up-to-date · ${tallies["single-frame"]} single-frame · ${tallies.failed} failed (of ${total})`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
