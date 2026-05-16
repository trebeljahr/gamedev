import { useMemo } from "react";
import type { AudioAnalysis } from "./media";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function fallbackLoudnessEnvelope(seed: string, bucketCount: number): number[] {
  let noiseSeed = hashString(seed || "audio");
  const phase = (noiseSeed % 360) * (Math.PI / 180);
  const phraseCount = 2 + (noiseSeed % 5);
  const beatCount = 14 + ((noiseSeed >>> 5) % 18);
  const burstCount = 3 + ((noiseSeed >>> 9) % 5);

  function nextNoise() {
    noiseSeed = Math.imul(noiseSeed, 1664525) + 1013904223;
    return ((noiseSeed >>> 0) / 0xffffffff) * 2 - 1;
  }

  const bursts = Array.from({ length: burstCount }, (_, index) => {
    const center = (index + 0.45 + Math.abs(nextNoise()) * 0.28) / burstCount;
    return {
      center: clamp(center, 0.05, 0.95),
      width: 0.025 + Math.abs(nextNoise()) * 0.12,
      strength: 0.34 + Math.abs(nextNoise()) * 0.64,
    };
  });

  return Array.from({ length: bucketCount }, (_, index) => {
    const position = bucketCount <= 1 ? 0 : index / (bucketCount - 1);
    const arc = Math.sin(Math.PI * position);
    const phrase = 0.5 + Math.sin(position * Math.PI * 2 * phraseCount + phase) * 0.5;
    const transient = Math.max(0, Math.sin(position * Math.PI * 2 * beatCount + phase * 0.37));
    const micro = Math.abs(nextNoise()) * 0.72 + Math.abs(nextNoise()) * 0.28;
    const burstEnergy = bursts.reduce((sum, burst) => {
      const distance = (position - burst.center) / burst.width;
      return sum + Math.exp(-distance * distance) * burst.strength;
    }, 0);
    const level = 0.018 + arc * 0.035 + burstEnergy * (0.24 + micro * 0.5) + phrase * arc * 0.05 + Math.pow(transient, 8) * 0.22;
    return clamp(level, 0.018, 0.98);
  });
}

export function resampleLoudnessEnvelope(values: number[], bucketCount: number): number[] {
  if (values.length === bucketCount) return values.map((value) => clamp(value, 0.018, 1));
  if (values.length === 0) return [];
  return Array.from({ length: bucketCount }, (_, index) => {
    const position = bucketCount <= 1 ? 0 : (index / (bucketCount - 1)) * (values.length - 1);
    const left = Math.floor(position);
    const right = Math.min(values.length - 1, left + 1);
    const mix = position - left;
    return clamp(values[left] * (1 - mix) + values[right] * mix, 0.018, 1);
  });
}

export function loudnessEnvelopeFor(
  seed: string,
  bucketCount: number,
  audio?: AudioAnalysis | { loudness?: number[] },
): number[] {
  if (audio?.loudness?.length) return resampleLoudnessEnvelope(audio.loudness, bucketCount);
  return fallbackLoudnessEnvelope(seed, bucketCount);
}

export function useLoudnessEnvelope(
  seed: string,
  bucketCount: number,
  audio?: AudioAnalysis,
): number[] {
  return useMemo(
    () => loudnessEnvelopeFor(seed, bucketCount, audio),
    [audio, bucketCount, seed],
  );
}

export function waveformPath(values: number[]): string {
  if (values.length === 0) return "";
  const width = 1000;
  const center = 50;
  const maxAmplitude = 46;
  const points = values.map((level, index) => {
    const x = values.length <= 1 ? 0 : (index / (values.length - 1)) * width;
    const amplitude = 1.4 + clamp(level, 0, 1) * maxAmplitude;
    return {
      x: Number(x.toFixed(2)),
      top: Number((center - amplitude).toFixed(2)),
      bottom: Number((center + amplitude).toFixed(2)),
    };
  });
  const top = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.top}`).join(" ");
  const bottom = [...points].reverse().map((point) => `L${point.x} ${point.bottom}`).join(" ");
  return `${top} ${bottom} Z`;
}
