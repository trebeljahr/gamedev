import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import sharp from "sharp";

export type ArtBackgroundKind = "transparent" | "solid" | "mixed";

export type ArtImageInspection = {
  width: number;
  height: number;
  bgKind: ArtBackgroundKind;
  bgColor?: { r: number; g: number; b: number };
  alphaCoverage: number;
  transparentCoverage: number;
  contentRowRuns: number;
  contentColRuns: number;
  promoBackground: boolean;
  spriteSheetGrid: boolean;
  uniformGrid: boolean;
  cellMedianWidth?: number;
  cellMedianHeight?: number;
  contentRowCount: number;
  contentColCount: number;
  inspectedAt: number;
  source: "png" | "gif" | "jpg" | "webp" | "other";
};

type CacheEntry = {
  mtimeMs: number;
  size: number;
  inspection: ArtImageInspection;
};

type Cache = Record<string, CacheEntry>;

const SAMPLE_MAX_DIM = 256;
const COLOR_TOLERANCE = 10;
const ALPHA_OPAQUE = 200;
const ALPHA_TRANSPARENT = 32;

function extKind(path: string): ArtImageInspection["source"] {
  const m = /\.([a-z0-9]+)$/i.exec(path);
  const ext = m ? m[1].toLowerCase() : "";
  if (ext === "png") return "png";
  if (ext === "gif") return "gif";
  if (ext === "jpg" || ext === "jpeg") return "jpg";
  if (ext === "webp") return "webp";
  return "other";
}

export async function inspectArtImage(absPath: string): Promise<ArtImageInspection> {
  const source = extKind(absPath);
  const pipeline = sharp(absPath, { animated: false, failOn: "none" })
    .resize({
      width: SAMPLE_MAX_DIM,
      height: SAMPLE_MAX_DIM,
      fit: "inside",
      withoutEnlargement: true,
      kernel: "nearest",
    })
    .ensureAlpha();
  const meta = await sharp(absPath, { animated: false, failOn: "none" }).metadata();
  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const total = w * h;

  let opaque = 0;
  let transparent = 0;
  for (let i = 3; i < data.length; i += 4) {
    const a = data[i];
    if (a < ALPHA_TRANSPARENT) transparent++;
    else if (a > ALPHA_OPAQUE) opaque++;
  }
  const alphaCoverage = opaque / total;
  const transparentCoverage = transparent / total;

  const samplePoints: [number, number][] = [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
    [Math.floor(w / 2), 0],
    [Math.floor(w / 2), h - 1],
    [0, Math.floor(h / 2)],
    [w - 1, Math.floor(h / 2)],
  ];

  const cornerColors = samplePoints.map(([x, y]) => {
    const o = (y * w + x) * 4;
    return { r: data[o], g: data[o + 1], b: data[o + 2], a: data[o + 3] };
  });
  const ref = cornerColors[0];
  const cornersMatch = cornerColors.every(
    (c) =>
      Math.abs(c.r - ref.r) <= COLOR_TOLERANCE &&
      Math.abs(c.g - ref.g) <= COLOR_TOLERANCE &&
      Math.abs(c.b - ref.b) <= COLOR_TOLERANCE &&
      Math.abs(c.a - ref.a) <= COLOR_TOLERANCE,
  );

  let bgKind: ArtBackgroundKind;
  let bgColor: { r: number; g: number; b: number } | undefined;
  const refTransparent = ref.a < ALPHA_TRANSPARENT;
  if (refTransparent && transparentCoverage > 0.05) {
    bgKind = "transparent";
  } else if (cornersMatch && ref.a > ALPHA_OPAQUE && transparentCoverage < 0.05) {
    bgKind = "solid";
    bgColor = { r: ref.r, g: ref.g, b: ref.b };
  } else if (cornersMatch && refTransparent) {
    bgKind = "transparent";
  } else {
    bgKind = "mixed";
  }

  const isBg = (r: number, g: number, b: number, a: number): boolean => {
    if (bgKind === "transparent") return a < ALPHA_TRANSPARENT;
    if (bgKind === "solid" && bgColor) {
      return (
        a > ALPHA_OPAQUE &&
        Math.abs(r - bgColor.r) <= COLOR_TOLERANCE &&
        Math.abs(g - bgColor.g) <= COLOR_TOLERANCE &&
        Math.abs(b - bgColor.b) <= COLOR_TOLERANCE
      );
    }
    return false;
  };

  const rowEmpty = new Uint8Array(h);
  const colEmpty = new Uint8Array(w);
  if (bgKind !== "mixed") {
    for (let y = 0; y < h; y++) {
      let allBg = 1;
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        if (!isBg(data[o], data[o + 1], data[o + 2], data[o + 3])) {
          allBg = 0;
          break;
        }
      }
      rowEmpty[y] = allBg;
    }
    for (let x = 0; x < w; x++) {
      let allBg = 1;
      for (let y = 0; y < h; y++) {
        const o = (y * w + x) * 4;
        if (!isBg(data[o], data[o + 1], data[o + 2], data[o + 3])) {
          allBg = 0;
          break;
        }
      }
      colEmpty[x] = allBg;
    }
  } else {
    rowEmpty.fill(0);
    colEmpty.fill(0);
  }

  const rowSegments = collectContentSegments(rowEmpty);
  const colSegments = collectContentSegments(colEmpty);
  const contentRowRuns = rowSegments.length;
  const contentColRuns = colSegments.length;

  let cellMedianWidth: number | undefined;
  let cellMedianHeight: number | undefined;
  let uniformGrid = false;
  if (rowSegments.length >= 2 && colSegments.length >= 2) {
    cellMedianHeight = median(rowSegments.map((s) => s.length));
    cellMedianWidth = median(colSegments.map((s) => s.length));
    uniformGrid =
      stddev(rowSegments.map((s) => s.length)) / Math.max(1, cellMedianHeight) < 0.15 &&
      stddev(colSegments.map((s) => s.length)) / Math.max(1, cellMedianWidth) < 0.15;
  }

  const spriteSheetGrid =
    bgKind === "transparent" && (contentRowRuns >= 2 || contentColRuns >= 3);
  const promoBackground = bgKind === "solid";

  const inspection: ArtImageInspection = {
    width: meta.width ?? w,
    height: meta.height ?? h,
    bgKind,
    bgColor,
    alphaCoverage,
    transparentCoverage,
    contentRowRuns,
    contentColRuns,
    contentRowCount: contentRowRuns,
    contentColCount: contentColRuns,
    promoBackground,
    spriteSheetGrid,
    uniformGrid,
    cellMedianWidth,
    cellMedianHeight,
    inspectedAt: Date.now(),
    source,
  };
  return inspection;
}

function collectContentSegments(empty: Uint8Array): { start: number; length: number }[] {
  const segments: { start: number; length: number }[] = [];
  let start = -1;
  for (let i = 0; i < empty.length; i++) {
    if (empty[i] === 0) {
      if (start === -1) start = i;
    } else if (start !== -1) {
      segments.push({ start, length: i - start });
      start = -1;
    }
  }
  if (start !== -1) segments.push({ start, length: empty.length - start });
  return segments.filter((s) => s.length >= 2);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : Math.floor((sorted[mid - 1] + sorted[mid]) / 2);
}

function stddev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / values.length;
  return Math.sqrt(variance);
}

let cacheRef: { path: string; data: Cache } | undefined;

async function loadCache(cachePath: string): Promise<Cache> {
  if (cacheRef && cacheRef.path === cachePath) return cacheRef.data;
  let data: Cache = {};
  if (existsSync(cachePath)) {
    try {
      data = JSON.parse(await readFile(cachePath, "utf8")) as Cache;
    } catch {
      data = {};
    }
  }
  cacheRef = { path: cachePath, data };
  return data;
}

export async function flushInspectionCache(cachePath: string): Promise<void> {
  if (!cacheRef || cacheRef.path !== cachePath) return;
  await mkdir(dirname(cachePath), { recursive: true });
  await writeFile(cachePath, `${JSON.stringify(cacheRef.data, null, 2)}\n`);
}

export async function inspectArtImageCached(
  cachePath: string,
  absPath: string,
  relKey: string,
): Promise<ArtImageInspection> {
  const cache = await loadCache(cachePath);
  const fileStat = await stat(absPath);
  const cached = cache[relKey];
  if (
    cached &&
    cached.mtimeMs === fileStat.mtimeMs &&
    cached.size === fileStat.size
  ) {
    return cached.inspection;
  }
  const inspection = await inspectArtImage(absPath);
  cache[relKey] = { mtimeMs: fileStat.mtimeMs, size: fileStat.size, inspection };
  return inspection;
}
