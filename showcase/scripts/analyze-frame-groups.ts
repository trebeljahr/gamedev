import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import sharp from "sharp";
import {
  artDesignKey,
  groupSequenceFrames,
  sortByFrameNumber,
} from "../src/lib/media-inference";

const SHOWCASE_DIR = join(__dirname, "..");
const REPO_ROOT = join(SHOWCASE_DIR, "..");
const ASSETS_ROOT = process.env.ASSETS_DIR ?? join(REPO_ROOT, "assets");
const PACKS_DIR = join(SHOWCASE_DIR, "public", "media-catalog", "packs");
const HASH_CACHE = join(SHOWCASE_DIR, ".cache", "frame-phash.json");
const OUT_REPORT = join(SHOWCASE_DIR, ".cache", "frame-group-classifications.json");

const HASH_DIM = 16;
const HASH_BITS = HASH_DIM * HASH_DIM * 3;

const ACTION_WORDS_RE = new RegExp(
  String.raw`(^|[^a-z])(idle|walk|walking|run|running|jump|jumping|fall|falling|attack|attacks|attacking|hurt|hit|hits|death|die|dying|dead|move|moving|dash|dashing|roll|rolling|slide|sliding|crouch|crouching|sleep|sleeping|charge|charging|teleport|cast|casting|shoot|shooting|fire|firing|reload|reloading|kick|kicking|punch|punching|swing|swinging|throw|throwing|grab|grabbing|land|landing|climb|climbing|swim|swimming|fly|flying|spawn|appear|disappear|transform|attack1|attack2|attack3|combo)([^a-z]|$)`,
  "i",
);

const ATLAS_WORDS_RE = new RegExp(
  String.raw`(^|[^a-z])(tile|tiles|tileset|tilesheet|tilemap|terrain|prop|props|object|objects|decor|decoration|decorations|item|items|icon|icons|ground|wall|walls|floor|floors|ceiling|background|backgrounds|map|maps|building|buildings|furniture|food|foods|plant|plants|tree|trees|rock|rocks|stone|stones|brick|bricks|fence|fences|door|doors|window|windows|sign|signs|chest|chests|bush|bushes|grass|sand|water|lava|dirt|path|paths|pillar|pillars|column|columns|stairs|ladder|crate|crates|barrel|barrels|hexagon|hex|piece|pieces|card|cards|dice|chip|chips|button|buttons|panel|panels|coin|coins|gem|gems|potion|potions|key|keys)([^a-z]|$)`,
  "i",
);

const VARIANT_WORDS_RE = new RegExp(
  String.raw`(^|[^a-z])(builder|modular|parts|limbs|face|faces|hair|skin|equipment|outfit|outfits|hat|hats|shirt|shirts|pants|shoes|beard|eyes|mouth|nose|head|body|arms|legs|color|colors|colour|variant|variants|skin|skins|palette|recolor|alt|alts|version|versions|style|styles|kit|kits)([^a-z]|$)`,
  "i",
);

const COLOR_WORDS_RE = new RegExp(
  String.raw`^(black|white|red|blue|green|yellow|orange|purple|pink|brown|gray|grey|gold|silver|cyan|magenta|teal|tan|beige|navy|maroon|olive|lime|aqua|violet|indigo|blonde|brunette|ginger|dark|light|colored|colour)(\d|-\d|-?\d+)?$`,
  "i",
);

// Color appearing anywhere in folder/key — catches "pieces-yellow",
// "skeleton-white", "shirt-blue-2".
const COLOR_TOKEN_RE = new RegExp(
  String.raw`(^|[^a-z])(black|white|red|blue|green|yellow|orange|purple|pink|brown|gray|grey|gold|silver|cyan|magenta|teal|navy|maroon|olive|violet|indigo|blonde|brunette)([^a-z]|$)`,
  "i",
);

type CacheEntry = { mtimeMs: number; size: number; hash: string };
type Cache = Record<string, CacheEntry>;

let cache: Cache = {};
let cacheDirty = false;

async function loadCache(): Promise<void> {
  if (existsSync(HASH_CACHE)) {
    try {
      cache = JSON.parse(await readFile(HASH_CACHE, "utf8"));
    } catch {
      cache = {};
    }
  }
}

async function saveCache(): Promise<void> {
  if (!cacheDirty) return;
  await mkdir(dirname(HASH_CACHE), { recursive: true });
  await writeFile(HASH_CACHE, JSON.stringify(cache));
  cacheDirty = false;
}

async function computeHash(absPath: string): Promise<bigint> {
  const buf = await sharp(absPath, { animated: false, failOn: "none" })
    .resize(HASH_DIM, HASH_DIM, { fit: "fill", kernel: "nearest" })
    .removeAlpha()
    .raw()
    .toBuffer();
  const channels = [0, 1, 2].map((c) => {
    const arr: number[] = [];
    for (let i = c; i < buf.length; i += 3) arr.push(buf[i]);
    const sorted = [...arr].sort((a, b) => a - b);
    return { values: arr, median: sorted[Math.floor(sorted.length / 2)] };
  });
  let bits = 0n;
  let bit = 0;
  for (const { values, median } of channels) {
    for (let i = 0; i < values.length; i++) {
      if (values[i] > median) bits |= 1n << BigInt(bit);
      bit++;
    }
  }
  return bits;
}

async function cachedHash(relPath: string): Promise<bigint | null> {
  const abs = join(ASSETS_ROOT, relPath);
  let st: Awaited<ReturnType<typeof stat>>;
  try {
    st = await stat(abs);
  } catch {
    return null;
  }
  const c = cache[relPath];
  if (c && c.mtimeMs === st.mtimeMs && c.size === st.size) {
    return BigInt(`0x${c.hash}`);
  }
  try {
    const h = await computeHash(abs);
    cache[relPath] = { mtimeMs: st.mtimeMs, size: st.size, hash: h.toString(16) };
    cacheDirty = true;
    return h;
  } catch {
    return null;
  }
}

function hamming(a: bigint, b: bigint): number {
  let x = a ^ b;
  let n = 0;
  while (x) {
    x &= x - 1n;
    n++;
  }
  return n;
}

type Sample = {
  path: string;
  src: string;
  inspection?: {
    width?: number;
    height?: number;
    bgKind?: string;
    spriteSheetGrid?: boolean;
  };
};

type Classification = "animation" | "atlas" | "ambiguous";

type GroupResult = {
  packFolder: string;
  designKey: string;
  frameCount: number;
  paths: string[];
  consecHammingMean: number | null;
  consecHammingMax: number | null;
  pairwiseHammingMean: number | null;
  hasActionWord: boolean;
  hasAtlasWord: boolean;
  hasVariantWord: boolean;
  hasColorToken: boolean;
  dimUniform: boolean;
  parentFolder: string;
  parentIsAction: boolean;
  parentIsColor: boolean;
  frameNumberMonotonic: boolean;
  bgTransparentAll: boolean;
  classification: Classification;
  score: number;
  reasons: string[];
};

async function analyzeGroup(packFolder: string, grp: Sample[]): Promise<GroupResult> {
  const sorted = sortByFrameNumber(grp);
  const paths = sorted.map((s) => s.path);
  const dims = sorted.map((s) => ({
    w: s.inspection?.width ?? 0,
    h: s.inspection?.height ?? 0,
  }));

  const hashes = await Promise.all(paths.map(cachedHash));
  const valid = hashes.filter((h): h is bigint => h !== null);

  let consecMean: number | null = null;
  let consecMax: number | null = null;
  let pairwiseMean: number | null = null;
  if (valid.length >= 2) {
    const consec: number[] = [];
    for (let i = 1; i < valid.length; i++) consec.push(hamming(valid[i - 1], valid[i]));
    consecMean = consec.reduce((a, b) => a + b, 0) / consec.length / HASH_BITS;
    consecMax = Math.max(...consec) / HASH_BITS;
    const pairs: number[] = [];
    for (let i = 0; i < valid.length; i++) {
      for (let j = i + 1; j < valid.length; j++) pairs.push(hamming(valid[i], valid[j]));
    }
    pairwiseMean = pairs.reduce((a, b) => a + b, 0) / pairs.length / HASH_BITS;
  }

  const designKey = artDesignKey(paths[0]);
  const allPathText = paths.join(" ").toLowerCase();
  const text = `${designKey.toLowerCase()} ${allPathText}`;
  const hasActionWord = ACTION_WORDS_RE.test(text);
  const hasAtlasWord = ATLAS_WORDS_RE.test(text);
  const hasVariantWord = VARIANT_WORDS_RE.test(text);
  const hasColorToken = COLOR_TOKEN_RE.test(designKey) || COLOR_TOKEN_RE.test(paths[0]);

  const parentFolder = paths[0].split("/").slice(-2, -1)[0] ?? "";
  const parentIsAction = ACTION_WORDS_RE.test(` ${parentFolder} `);
  const parentIsColor =
    COLOR_WORDS_RE.test(parentFolder) || COLOR_TOKEN_RE.test(parentFolder);

  const widths = new Set(dims.map((d) => d.w));
  const heights = new Set(dims.map((d) => d.h));
  const dimUniform = widths.size === 1 && heights.size === 1 && [...widths][0] > 0;

  const bgTransparentAll =
    sorted.length > 0 && sorted.every((s) => s.inspection?.bgKind === "transparent");

  const frameNumsAll = paths.map((p) => {
    const base = p.split("/").pop() ?? "";
    const m = base.replace(/\.[^.]+$/, "").match(/(\d{1,5})$/);
    return m ? Number(m[1]) : null;
  });
  const allNumbered = frameNumsAll.every((n) => n !== null);
  const uniqueFrameNums = [...new Set(frameNumsAll.filter((n): n is number => n !== null))].sort(
    (a, b) => a - b,
  );
  const hasDuplicateFrameNums =
    frameNumsAll.filter((n) => n !== null).length !== uniqueFrameNums.length;
  const frameNumberMonotonic =
    allNumbered &&
    !hasDuplicateFrameNums &&
    uniqueFrameNums.length >= 3 &&
    uniqueFrameNums[uniqueFrameNums.length - 1] - uniqueFrameNums[0] + 1 ===
      uniqueFrameNums.length;

  let score = 0;
  const reasons: string[] = [];
  if (hasActionWord) {
    score += 3;
    reasons.push("+anim action-word");
  }
  if (parentIsAction) {
    score += 2;
    reasons.push("+anim action-folder");
  }
  if (hasAtlasWord && !hasActionWord) {
    score -= 3;
    reasons.push("-atlas atlas-word");
  }
  if (hasVariantWord && !hasActionWord) {
    score -= 2;
    reasons.push("-atlas variant-word");
  }
  if (parentIsColor) {
    score -= 2;
    reasons.push("-atlas color-folder");
  } else if (hasColorToken && !hasActionWord) {
    score -= 1;
    reasons.push("-atlas color-token");
  }
  if (consecMean !== null) {
    const animBonusCap = hasAtlasWord && !hasActionWord ? 1 : 3;
    if (consecMean < 0.10) {
      score += animBonusCap;
      reasons.push(`+anim consec-hamming ${consecMean.toFixed(2)}`);
    } else if (consecMean < 0.18) {
      score += Math.min(animBonusCap, 1);
      reasons.push(`+anim soft consec-hamming ${consecMean.toFixed(2)}`);
    } else if (consecMean > 0.32) {
      score -= 3;
      reasons.push(`-atlas consec-hamming ${consecMean.toFixed(2)}`);
    } else {
      reasons.push(`~ consec-hamming ${consecMean.toFixed(2)}`);
    }
  }
  if (dimUniform) {
    score += 1;
    reasons.push("+anim dim-uniform");
  } else {
    score -= 2;
    reasons.push("-atlas dim-mixed");
  }
  if (frameNumberMonotonic) {
    score += 1;
    reasons.push("+anim contiguous-frames");
  } else if (allNumbered && paths.length >= 3 && !hasDuplicateFrameNums) {
    score -= 1;
    reasons.push("-atlas non-contiguous-frames");
  } else if (hasDuplicateFrameNums) {
    reasons.push("~ duplicate-frame-nums");
  } else if (!allNumbered) {
    reasons.push("~ mixed-name-frames");
  }
  // Frame-count prior: animations p75 ≈ 4; atlases p75 ≈ 16. Big groups skew atlas.
  if (paths.length > 32 && !hasActionWord) {
    score -= 2;
    reasons.push(`-atlas frame-count ${paths.length}`);
  } else if (paths.length > 16 && !hasActionWord) {
    score -= 1;
    reasons.push(`-atlas frame-count ${paths.length}`);
  }
  if (bgTransparentAll) {
    reasons.push("~ all-transparent-bg");
  }

  const classification: Classification =
    score >= 3 ? "animation" : score <= -2 ? "atlas" : "ambiguous";

  return {
    packFolder,
    designKey,
    frameCount: paths.length,
    paths,
    consecHammingMean: consecMean,
    consecHammingMax: consecMax,
    pairwiseHammingMean: pairwiseMean,
    hasActionWord,
    hasAtlasWord,
    hasVariantWord,
    hasColorToken,
    dimUniform,
    parentFolder,
    parentIsAction,
    parentIsColor,
    frameNumberMonotonic,
    bgTransparentAll,
    classification,
    score,
    reasons,
  };
}

async function analyzePack(file: string): Promise<GroupResult[]> {
  const pack = JSON.parse(await readFile(join(PACKS_DIR, file), "utf8"));
  const samples: Sample[] = pack.samples ?? [];
  const groups = groupSequenceFrames(samples);
  const results: GroupResult[] = [];
  for (const grp of groups) {
    results.push(await analyzeGroup(pack.folder, grp as Sample[]));
  }
  return results;
}

async function main(): Promise<void> {
  await loadCache();
  const files = (await readdir(PACKS_DIR)).filter((f) => f.endsWith(".json")).sort();
  const allGroups: GroupResult[] = [];
  let done = 0;
  for (const file of files) {
    try {
      const groups = await analyzePack(file);
      allGroups.push(...groups);
    } catch (err) {
      console.warn(`[analyze] ${file}: ${(err as Error).message}`);
    }
    done++;
    if (done % 20 === 0) {
      await saveCache();
      console.log(`[analyze] ${done}/${files.length} packs · ${allGroups.length} groups`);
    }
  }
  await saveCache();

  const counts = {
    total: allGroups.length,
    animation: allGroups.filter((g) => g.classification === "animation").length,
    atlas: allGroups.filter((g) => g.classification === "atlas").length,
    ambiguous: allGroups.filter((g) => g.classification === "ambiguous").length,
  };

  type PackBucket = {
    animation: number;
    atlas: number;
    ambiguous: number;
    groups: GroupResult[];
  };
  const byPack: Record<string, PackBucket> = {};
  for (const g of allGroups) {
    const bucket = (byPack[g.packFolder] ??= {
      animation: 0,
      atlas: 0,
      ambiguous: 0,
      groups: [],
    });
    bucket[g.classification]++;
    bucket.groups.push(g);
  }

  await mkdir(dirname(OUT_REPORT), { recursive: true });
  await writeFile(
    OUT_REPORT,
    `${JSON.stringify({ counts, byPack }, null, 2)}\n`,
  );

  const packsWithAtlas = Object.entries(byPack)
    .filter(([, b]) => b.atlas > 0)
    .sort((a, b) => b[1].atlas - a[1].atlas);
  const packsWithAmbiguous = Object.entries(byPack)
    .filter(([, b]) => b.ambiguous > 0)
    .sort((a, b) => b[1].ambiguous - a[1].ambiguous);

  console.log("\n=== Frame-group classification ===");
  console.log(`Total multi-file groups: ${counts.total}`);
  console.log(`  Clearly animation:  ${counts.animation}`);
  console.log(`  Clearly atlas/tile: ${counts.atlas}`);
  console.log(`  Ambiguous:          ${counts.ambiguous}`);
  console.log("\nTop packs with atlas-classified groups:");
  for (const [pack, b] of packsWithAtlas.slice(0, 15)) {
    console.log(`  ${pack}: ${b.atlas} atlas, ${b.animation} anim, ${b.ambiguous} ambig`);
  }
  console.log("\nTop packs with ambiguous groups:");
  for (const [pack, b] of packsWithAmbiguous.slice(0, 15)) {
    console.log(`  ${pack}: ${b.ambiguous} ambig, ${b.animation} anim, ${b.atlas} atlas`);
  }
  console.log(`\nReport: ${OUT_REPORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
