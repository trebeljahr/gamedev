import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import {
  analyzeAudioFile,
  AUDIO_ANALYSIS_SCHEMA,
  canReuseAudioAnalysis,
  DEFAULT_AUDIO_BUCKET_COUNT,
  DEFAULT_AUDIO_SAMPLE_RATE,
  hashFile,
  type AudioAnalysisCatalog,
  type AudioAnalysisItem,
} from "./audio-analysis";

type MediaAssets = {
  soundSamples?: Array<{ path: string }>;
  musicTracks?: Array<{ path: string }>;
};

type Metadata = {
  mappings?: Array<{ path_pattern: string }>;
};

const SHOWCASE_DIR = join(__dirname, "..");
const REPO_ROOT = join(SHOWCASE_DIR, "..");
const ASSETS_ROOT = process.env.ASSETS_DIR ? process.env.ASSETS_DIR : join(REPO_ROOT, "assets");
const MEDIA_ASSETS_PATH = join(SHOWCASE_DIR, "src", "lib", "media-assets.json");
const METADATA_PATH = join(REPO_ROOT, "metadata.json");
const OUT = join(SHOWCASE_DIR, "public", "audio-analysis.json");
const AUDIO_EXT_PATTERN = /\.(mp3|wav|ogg|m4a|flac|opus)$/i;
const BUCKET_COUNT = Number(process.env.AUDIO_ENVELOPE_BUCKETS ?? DEFAULT_AUDIO_BUCKET_COUNT);
const ANALYSIS_SAMPLE_RATE = Number(process.env.AUDIO_ANALYSIS_SAMPLE_RATE ?? DEFAULT_AUDIO_SAMPLE_RATE);
const FORCE = process.env.AUDIO_ANALYSIS_FORCE === "1";

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function emptyCatalog(): AudioAnalysisCatalog {
  return {
    schema: AUDIO_ANALYSIS_SCHEMA,
    bucketCount: BUCKET_COUNT,
    analysisSampleRate: ANALYSIS_SAMPLE_RATE,
    items: {},
  };
}

function audioTargets(mediaAssets: MediaAssets, metadata: Metadata): string[] {
  const paths = new Set<string>();

  for (const sample of mediaAssets.soundSamples ?? []) {
    if (AUDIO_EXT_PATTERN.test(sample.path)) paths.add(sample.path);
  }

  for (const track of mediaAssets.musicTracks ?? []) {
    if (AUDIO_EXT_PATTERN.test(track.path)) paths.add(track.path);
  }

  for (const mapping of metadata.mappings ?? []) {
    if (mapping.path_pattern.startsWith("sounds/music/") && AUDIO_EXT_PATTERN.test(mapping.path_pattern)) {
      paths.add(mapping.path_pattern);
    }
  }

  return [...paths].sort((a, b) => a.localeCompare(b));
}

async function main() {
  const mediaAssets = await readJson<MediaAssets>(MEDIA_ASSETS_PATH, {});
  const metadata = await readJson<Metadata>(METADATA_PATH, {});
  const previous = await readJson<AudioAnalysisCatalog>(OUT, emptyCatalog());
  const nextItems: Record<string, AudioAnalysisItem> = {};
  const targets = audioTargets(mediaAssets, metadata);
  let analyzed = 0;
  let reused = 0;
  let missing = 0;
  let failed = 0;

  const total = targets.length;
  const padWidth = String(total).length;
  console.log(`[audio-analysis] ${total} target file(s)`);
  for (let index = 0; index < total; index += 1) {
    const path = targets[index];
    const counter = `${String(index + 1).padStart(padWidth, " ")}/${total}`;
    const file = join(ASSETS_ROOT, path);
    const previousItem = previous.items?.[path];
    const startedAt = Date.now();
    const log = (status: string) =>
      process.stdout.write(`[audio-analysis] ${counter} ${status.padEnd(8)} ${`${Date.now() - startedAt}ms`.padStart(6)}  ${path}\n`);
    process.stdout.write(`[audio-analysis] ${counter} ▶ start              ${path}\n`);

    if (!existsSync(file)) {
      if (previousItem) {
        nextItems[path] = previousItem;
        reused += 1;
        log("= reused (missing)");
      } else {
        missing += 1;
        log("? missing");
      }
      continue;
    }

    try {
      const [{ size }, contentHash] = await Promise.all([stat(file), hashFile(file)]);
      if (!FORCE && canReuseAudioAnalysis(previousItem, contentHash, BUCKET_COUNT, ANALYSIS_SAMPLE_RATE)) {
        nextItems[path] = previousItem;
        reused += 1;
        log("= reused");
        continue;
      }

      const item = await analyzeAudioFile({
        file,
        path,
        contentHash,
        bucketCount: BUCKET_COUNT,
        analysisSampleRate: ANALYSIS_SAMPLE_RATE,
      });
      nextItems[path] = { ...item, byteLength: item.byteLength || size };
      analyzed += 1;
      log("+ analyzed");
    } catch (error) {
      failed += 1;
      if (previousItem) {
        nextItems[path] = previousItem;
        reused += 1;
      }
      log("! failed");
      console.warn(`[audio-analysis] skipped ${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const catalog: AudioAnalysisCatalog = {
    schema: AUDIO_ANALYSIS_SCHEMA,
    bucketCount: BUCKET_COUNT,
    analysisSampleRate: ANALYSIS_SAMPLE_RATE,
    items: Object.fromEntries(Object.entries(nextItems).sort((a, b) => a[0].localeCompare(b[0]))),
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(catalog, null, 2)}\n`);

  if (missing > 0) {
    console.warn(
      `[audio-analysis] ${missing} target files missing under ${ASSETS_ROOT}; preserved existing analysis where available.`,
    );
  }
  console.log(
    `[audio-analysis] ${Object.keys(catalog.items).length}/${targets.length} files · ${analyzed} analyzed · ${reused} reused · ${failed} failed → ${relative(SHOWCASE_DIR, OUT)}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
