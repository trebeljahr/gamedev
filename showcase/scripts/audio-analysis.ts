import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const AUDIO_ANALYSIS_SCHEMA = "gamedev.audio-analysis.v2";
export const DEFAULT_AUDIO_BUCKET_COUNT = 192;
export const DEFAULT_AUDIO_SAMPLE_RATE = 1000;

export type AudioAnalysisItem = {
  schema: typeof AUDIO_ANALYSIS_SCHEMA;
  path: string;
  contentHash: string;
  byteLength: number;
  duration: number;
  sampleRate: number | null;
  channels: number | null;
  analysisSampleRate: number;
  bucketCount: number;
  loudness: number[];
  peak: number;
  rms: number;
};

export type AudioAnalysisCatalog = {
  schema: typeof AUDIO_ANALYSIS_SCHEMA;
  bucketCount: number;
  analysisSampleRate: number;
  items: Record<string, AudioAnalysisItem>;
};

type FfprobeOutput = {
  streams?: Array<{
    channels?: number;
    sample_rate?: string;
  }>;
  format?: {
    duration?: string;
    size?: string;
  };
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 4): number {
  return Number(value.toFixed(digits));
}

function normalizeLoudness(values: number[]): number[] {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  const reference = sorted[Math.max(0, Math.floor(sorted.length * 0.98) - 1)] || sorted.at(-1) || 1;
  return values.map((value) => {
    const normalized = clamp(value / reference, 0, 1);
    return round(clamp(0.018 + Math.pow(normalized, 0.62) * 0.982, 0.018, 1));
  });
}

function loudnessFromPcm(buffer: Buffer, bucketCount: number): { loudness: number[]; peak: number; rms: number } {
  const sampleCount = Math.floor(buffer.length / 4);
  const raw = new Array<number>(bucketCount).fill(0);
  let totalSquares = 0;
  let totalPeak = 0;

  if (sampleCount === 0) {
    return { loudness: raw, peak: 0, rms: 0 };
  }

  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    const start = Math.floor((bucket / bucketCount) * sampleCount);
    const end = Math.max(start + 1, Math.floor(((bucket + 1) / bucketCount) * sampleCount));
    let sumSquares = 0;
    let peak = 0;

    for (let index = start; index < end; index += 1) {
      const sample = Math.abs(buffer.readFloatLE(index * 4));
      sumSquares += sample * sample;
      peak = Math.max(peak, sample);
    }

    totalSquares += sumSquares;
    totalPeak = Math.max(totalPeak, peak);
    const rms = Math.sqrt(sumSquares / Math.max(1, end - start));
    raw[bucket] = rms * 0.35 + peak * 0.65;
  }

  return {
    loudness: normalizeLoudness(raw),
    peak: round(totalPeak),
    rms: round(Math.sqrt(totalSquares / Math.max(1, sampleCount))),
  };
}

async function ffprobe(file: string): Promise<FfprobeOutput> {
  const { stdout } = await execFileAsync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "a:0",
      "-show_entries",
      "format=duration,size:stream=channels,sample_rate",
      "-of",
      "json",
      file,
    ],
    { encoding: "utf8", maxBuffer: 1024 * 1024 },
  );
  return JSON.parse(stdout) as FfprobeOutput;
}

async function decodePcm(file: string, sampleRate: number): Promise<Buffer> {
  const { stdout } = await execFileAsync(
    "ffmpeg",
    ["-v", "error", "-i", file, "-vn", "-ac", "1", "-ar", String(sampleRate), "-f", "f32le", "pipe:1"],
    { encoding: "buffer", maxBuffer: 256 * 1024 * 1024 },
  );
  return stdout;
}

function chooseDecodeSampleRate({
  duration,
  sourceSampleRate,
  analysisSampleRate,
  bucketCount,
}: {
  duration: number | null;
  sourceSampleRate: number | null;
  analysisSampleRate: number;
  bucketCount: number;
}): number {
  let decodeSampleRate = analysisSampleRate;
  if (duration && duration > 0) {
    decodeSampleRate = Math.max(decodeSampleRate, Math.ceil(bucketCount / duration));
  }
  if (sourceSampleRate && sourceSampleRate > 0) {
    decodeSampleRate = Math.min(decodeSampleRate, sourceSampleRate);
  }
  return Math.max(1, decodeSampleRate);
}

export async function hashFile(file: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    createReadStream(file)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", resolve);
  });
  return `sha256:${hash.digest("hex")}`;
}

export function canReuseAudioAnalysis(
  item: AudioAnalysisItem | undefined,
  contentHash: string,
  bucketCount: number,
  analysisSampleRate: number,
): item is AudioAnalysisItem {
  return (
    item?.schema === AUDIO_ANALYSIS_SCHEMA &&
    item.contentHash === contentHash &&
    item.bucketCount === bucketCount &&
    item.analysisSampleRate === analysisSampleRate &&
    item.loudness.length === bucketCount
  );
}

export async function analyzeAudioFile({
  file,
  path,
  contentHash,
  bucketCount = DEFAULT_AUDIO_BUCKET_COUNT,
  analysisSampleRate = DEFAULT_AUDIO_SAMPLE_RATE,
}: {
  file: string;
  path: string;
  contentHash: string;
  bucketCount?: number;
  analysisSampleRate?: number;
}): Promise<AudioAnalysisItem> {
  const probe = await ffprobe(file);
  const firstStream = probe.streams?.[0];
  const sourceSampleRate = firstStream?.sample_rate ? Number(firstStream.sample_rate) : null;
  const byteLength = probe.format?.size ? Number(probe.format.size) : 0;
  const probeDuration = probe.format?.duration ? Number(probe.format.duration) : null;
  const decodeSampleRate = chooseDecodeSampleRate({
    duration: Number.isFinite(probeDuration) ? probeDuration : null,
    sourceSampleRate: Number.isFinite(sourceSampleRate) ? sourceSampleRate : null,
    analysisSampleRate,
    bucketCount,
  });
  let pcm = await decodePcm(file, decodeSampleRate);
  if (pcm.length === 0 && sourceSampleRate && sourceSampleRate !== decodeSampleRate) {
    pcm = await decodePcm(file, sourceSampleRate);
  }
  const duration = probeDuration ?? pcm.length / 4 / decodeSampleRate;
  const envelope = loudnessFromPcm(pcm, bucketCount);

  return {
    schema: AUDIO_ANALYSIS_SCHEMA,
    path,
    contentHash,
    byteLength,
    duration: round(duration, 3),
    sampleRate: Number.isFinite(sourceSampleRate) ? sourceSampleRate : null,
    channels: firstStream?.channels ?? null,
    analysisSampleRate,
    bucketCount,
    ...envelope,
  };
}
