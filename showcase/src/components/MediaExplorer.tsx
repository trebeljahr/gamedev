"use client";

import Link from "next/link";
import { type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import { LicenseLink } from "@/components/LicenseLink";
import { NavDrawer, SelectDropdown } from "@/components/NavDrawer";
import { InfiniteListSentinel, useInfiniteList } from "@/components/useInfiniteList";
import type {
  ArtPack,
  ArtPackSummary,
  ArtSample,
  AudioAnalysis,
  MusicTrack,
  SoundCollection,
  SoundSample,
  SourceMapping,
} from "@/lib/media";
import { materialSamplesFor, mediaPackHref } from "@/lib/media";
import { resolveSoundAttribution, type SoundAttribution } from "@/lib/sound-attribution";
import { cleanAudioLabel } from "@/lib/audio-label";
import { useLoudnessEnvelope, waveformPath } from "@/lib/loudness";
import {
  exportAudioSelection,
  type AudioExportFormat,
  type AudioExportProgress,
} from "@/lib/audio-export";
import {
  artDesignKey,
  isLikelyHybridSpriteAtlasPath,
  isLikelySeparateFramePath,
  isLikelySpriteSheet,
  isLikelySpriteSheetPath,
  isLikelyTextureAtlas,
  isLikelyTextureAtlasPath,
} from "@/lib/media-inference";
import { SiteHeader } from "@/components/SiteHeader";
import { trackAudioExport, trackSearchNoResults } from "@/lib/analytics";
import { brokenAssetIssueUrl } from "@/lib/github-issue";
import { navGroups, type NavKey } from "@/lib/navigation";
import { uniqueTags } from "@/lib/tags";
import { SOUND_SUBCATEGORIES, SOUND_SUBCATEGORY_LABELS } from "@/lib/catalog-metadata";

type MediaExplorerProps = {
  soundCollections: SoundCollection[];
  musicTracks: MusicTrack[];
  artPacks: ArtPackSummary[];
  sourceMappings: SourceMapping[];
  artCreators: string[];
  initialView?: View;
  initialArtType?: ArtTypeFilter;
  initialSpriteSubject?: SpriteSubjectFilter;
  initialSpriteMotion?: SpriteMotionFilter;
  initialSoundType?: SoundTypeFilter;
};

type View = "sounds" | "art" | "sources";
type GroupMode = "type" | "creator";
type ArtTypeFilter = "all" | "ui-icons" | "spritesheets";
type SpriteSubjectFilter = "all" | "characters" | "environments" | "effects-items" | "other";
type SpriteMotionFilter = "all" | "animated" | "static";
type SoundTypeFilter = "all" | "sfx" | "music";
type SoundSortMode = "shuffle" | "alpha";
type SoundOrganization = SoundCollection["organization"];
type SpriteLayoutMode = "static" | "grid" | "variable" | "atlas" | "hybrid-atlas" | "sequence-pack";
type SpriteSequenceMode = "off" | "hybrid-atlas" | "sequence-pack";
type SoundEffectItem = SoundSample & {
  collection: SoundCollection;
  source: string;
  license: string;
  organization: SoundOrganization;
  organizationLabel: string;
  packHref: string;
  attribution: SoundAttribution;
};
type SoundResult =
  | { kind: "sfx"; key: string; sortLabel: string; item: SoundEffectItem }
  | { kind: "music"; key: string; sortLabel: string; track: MusicTrack };
type SpriteGrid = {
  cols: number;
  rows: number;
  confidence: number;
  mode: SpriteLayoutMode;
  frames?: SpriteRect[];
  sequences?: SpriteSequence[];
};
type SpriteRect = { x: number; y: number; w: number; h: number };
type SpriteSequence = { label: string; frames: SpriteRect[]; bounds: SpriteRect; frameBoxes?: SpriteRect[] };
type SpriteDrawFrame = { source: SpriteRect; box: SpriteRect };
type ContentIntegral = { width: number; height: number; stride: number; sums: Uint32Array };
type LoadedSpriteImage = {
  src: string;
  image: HTMLImageElement;
  imageData: ImageData | null;
  bgSample: ReturnType<typeof sampleImageBackground> | null;
};
type ArtSampleGroup = {
  id: string;
  label: string;
  layout: string;
  primary: ArtSample;
  samples: ArtSample[];
  sequence: boolean;
};
type LoadedSequenceFrame = {
  sample: ArtSample;
  image: HTMLImageElement;
  source: SpriteRect;
};

function isUsableSpriteGrid(grid: SpriteGrid): boolean {
  if (grid.mode === "atlas" || grid.mode === "static") return false;
  if (grid.frames) return grid.frames.length > 1 && grid.confidence >= 0.5;
  return grid.cols * grid.rows > 1 && grid.confidence >= 0.45;
}

function isUnwrappableSpriteGrid(grid: SpriteGrid): boolean {
  if (grid.mode === "static") return false;
  if (grid.frames) return grid.frames.length > 1 && grid.confidence >= 0.45;
  return grid.cols * grid.rows > 1 && grid.confidence >= 0.45;
}

function formatTime(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function licenseBucket(license: string): string {
  const lower = license.toLowerCase();
  if (lower.includes("cc0") || lower.includes("creative commons zero")) return "CC0";
  if (lower.includes("non-commercial")) return "Non-commercial";
  if (lower.includes("pixabay")) return "Pixabay";
  if (lower.includes("cc-by")) return "CC-BY";
  if (lower.includes("custom") || lower.includes("redistribution")) return "Custom";
  return "Varies";
}

function initials(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function samplePathParent(path: string): string {
  return path.split("/").slice(0, -1).join("/");
}

function sampleFrameNumber(sample: ArtSample): number | null {
  const match = basenameWithoutExtension(sample.path).match(/(?:^|[^0-9])(\d{1,5})$/);
  return match ? Number(match[1]) : null;
}

function humanizePathSegment(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function sampleFileName(path: string): string {
  return path.split("/").pop() ?? path;
}

function sortSamplesByFrame(a: ArtSample, b: ArtSample): number {
  const parent = samplePathParent(a.path).localeCompare(samplePathParent(b.path));
  if (parent !== 0) return parent;
  const aFrame = sampleFrameNumber(a);
  const bFrame = sampleFrameNumber(b);
  if (aFrame !== null && bFrame !== null && aFrame !== bFrame) return aFrame - bFrame;
  return a.path.localeCompare(b.path);
}

function sampleLayoutLabel(sample: ArtSample, group?: ArtSampleGroup): string {
  if (group?.sequence) return `${group.samples.length} frame files`;
  if (sample.inspection?.promoBackground) {
    return sample.path.toLowerCase().endsWith(".gif") ? "promo gif" : "promo image";
  }
  if (isLikelyHybridSpriteAtlasPath(sample.path)) return "hybrid atlas";
  if (isLikelyTextureAtlas(sample.path, sample.inspection)) return "atlas / tiles";
  if (sample.animated || isLikelySpriteSheet(sample.path, sample.inspection))
    return sample.path.toLowerCase().endsWith(".gif") ? "gif animation" : "sprite sheet";
  return sample.kind;
}

function sequenceLabel(samples: ArtSample[]): string {
  const sorted = [...samples].sort(sortSamplesByFrame);
  const first = sorted[0];
  const labelBase = first.label.replace(/\s*(?:frame\s*)?\d{1,5}$/i, "").trim();
  if (labelBase && !/^\d+$/.test(labelBase)) return labelBase;
  const folder = samplePathParent(first.path).split("/").pop() ?? first.label;
  const numericFrames = sorted.map(sampleFrameNumber).filter((value): value is number => value !== null);
  const range =
    numericFrames.length === sorted.length
      ? ` ${Math.min(...numericFrames)}-${Math.max(...numericFrames)}`
      : "";
  return `${humanizePathSegment(folder) || "Frame"}${range}`;
}

const SUBJECT_NOISE_FOLDER = /^(extracted|assets?|images?|png|pngs?|sprites?|spritesheets?|sheets?|frames?|individual|separate|all|default|export|exports?|files?|godotproject|previews?|samples?|demo|version|v\d+)$/i;

function inferSampleSubject(samplePath: string): string {
  const segments = samplePath.split("/").filter(Boolean);
  if (segments.length < 2) return "All";
  for (let index = segments.length - 2; index >= 0; index--) {
    if (!SUBJECT_NOISE_FOLDER.test(segments[index])) return humanizePathSegment(segments[index]);
  }
  return humanizePathSegment(segments[0]);
}

type PackSubjectGroup = { subject: string; samples: ArtSample[] };

function packSubjectGroups(samples: ArtSample[]): PackSubjectGroup[] {
  const buckets = new Map<string, ArtSample[]>();
  for (const sample of samples) {
    const subject = inferSampleSubject(sample.path);
    const list = buckets.get(subject) ?? [];
    list.push(sample);
    buckets.set(subject, list);
  }
  return [...buckets.entries()]
    .map(([subject, items]) => ({ subject, samples: items }))
    .sort((a, b) => b.samples.length - a.samples.length || a.subject.localeCompare(b.subject));
}

function artSampleGroups(samples: ArtSample[]): ArtSampleGroup[] {
  const designBuckets = new Map<string, ArtSample[]>();
  for (const sample of samples) {
    if (!isLikelySeparateFramePath(sample.path)) continue;
    const key = artDesignKey(sample.path);
    const list = designBuckets.get(key) ?? [];
    list.push(sample);
    designBuckets.set(key, list);
  }

  const designKeys = new Map<string, string>();
  for (const [key, list] of designBuckets) {
    if (list.length < 2) continue;
    for (const sample of list) designKeys.set(sample.path, `frames:${key}`);
  }

  const samplesByGroup = new Map<string, ArtSample[]>();
  for (const sample of samples) {
    const groupKey = designKeys.get(sample.path) ?? `single:${sample.path}`;
    const list = samplesByGroup.get(groupKey) ?? [];
    list.push(sample);
    samplesByGroup.set(groupKey, list);
  }

  const emitted = new Set<string>();
  const groups: ArtSampleGroup[] = [];
  for (const sample of samples) {
    const groupKey = designKeys.get(sample.path) ?? `single:${sample.path}`;
    if (emitted.has(groupKey)) continue;
    emitted.add(groupKey);
    const groupedSamples = [...(samplesByGroup.get(groupKey) ?? [sample])].sort(sortSamplesByFrame);
    const sequence = groupedSamples.length > 1;
    const primary = groupedSamples[0];
    groups.push({
      id: groupKey,
      label: sequence ? sequenceLabel(groupedSamples) : primary.label,
      layout: sequence ? `${groupedSamples.length} frame files` : sampleLayoutLabel(primary),
      primary,
      samples: groupedSamples,
      sequence,
    });
  }
  return groups;
}

function searchMatches(searchText: string, query: string): boolean {
  const normalizedSearchText = `${searchText} ${searchText.replace(/\bkrab\b/gi, "crab").replace(/alkakrab/gi, "alkacrab")}`;
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  return terms.every((term) => normalizedSearchText.includes(term));
}

function creatorUrlForPacks(packs: ArtPackSummary[]): string | undefined {
  return packs.find((pack) => pack.author_url)?.author_url;
}

function previewSampleStub(pack: ArtPackSummary, preview: NonNullable<ArtPackSummary["preview"]>): ArtSample {
  return {
    packFolder: pack.folder,
    path: preview.path,
    src: preview.src,
    label: preview.label,
    kind: preview.kind,
    animated: preview.animated,
    description: "",
    category: pack.category,
    themes: pack.themes,
    useCases: pack.useCases,
    tags: pack.tags,
    searchText: "",
  };
}

const ART_SUBJECT_LABELS: Record<SpriteSubjectFilter & string, string> = {
  all: "All",
  characters: "Characters",
  environments: "Environments",
  "effects-items": "Effects & Items",
  other: "Other",
};

function artTaxonomyLabel(pack: ArtPackSummary): string {
  if (pack.artType === "ui-icons") return "UI / Icons";
  const motion = pack.spriteMotion === "animated" ? "Animated" : "Static";
  return `Spritesheets / ${ART_SUBJECT_LABELS[pack.spriteSubject]} / ${motion}`;
}

const ART_TAXONOMY_ORDER = [
  "UI / Icons",
  "Spritesheets / Characters / Animated",
  "Spritesheets / Characters / Static",
  "Spritesheets / Environments / Animated",
  "Spritesheets / Environments / Static",
  "Spritesheets / Effects & Items / Animated",
  "Spritesheets / Effects & Items / Static",
  "Spritesheets / Other / Animated",
  "Spritesheets / Other / Static",
];

const SOUND_CATEGORY_ORDER = ["movement", "combat", "ui", "ambient", "effect", "source-pattern"];
const SOUND_CATEGORY_NAMES: Record<string, string> = {
  movement: "Movement",
  combat: "Combat",
  ui: "UI",
  ambient: "Ambience",
  effect: "Effects",
  "source-pattern": "Source patterns",
};
const TEXTURE_LIST_PAGE_SIZE = 80;
const SOUND_LIST_PAGE_SIZE = 32;
const ART_LIST_PAGE_SIZE = 48;

function soundCategoryLabel(category: string): string {
  return (
    SOUND_CATEGORY_NAMES[category] ??
    category
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (character) => character.toUpperCase())
  );
}

function compareSoundCategories(a: string, b: string): number {
  const aIndex = SOUND_CATEGORY_ORDER.indexOf(a);
  const bIndex = SOUND_CATEGORY_ORDER.indexOf(b);
  if (aIndex !== -1 || bIndex !== -1) {
    return (aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex) - (bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex);
  }
  return soundCategoryLabel(a).localeCompare(soundCategoryLabel(b));
}

function stableShuffleScore(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

function musicTrackPackId(track: MusicTrack): string {
  return track.packId ?? track.path.split("/").slice(0, -1).join("/");
}

function isSpriteSheetCandidate(sample: ArtSample): boolean {
  return sample.animated || isLikelySpriteSheetPath(sample.path) || /(?:sprite|spritesheet|sheet|animation|anim)/i.test(sample.label);
}

function isGifSample(sample: { path: string }): boolean {
  return sample.path.toLowerCase().endsWith(".gif");
}

function normalizeSpritePathText(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function basenameWithoutExtension(path: string): string {
  return (path.split(/[\\/]+/).pop() ?? path).replace(/\.[^.]+$/i, "");
}

const SPRITE_ACTION_NAME_PATTERN =
  /\b(?:idle|walk|run|jump|fall|attack|attacks|hurt|hit|death|die|move|dash|roll|slide|crouch|sleep|sleeping|damaged|charge|teleport)\b/i;
const GENERIC_SEQUENCE_SHEET_PATTERN =
  /\b(?:spritesheet|sprite sheet|sprite sheets|sheet|strip|allanim|all anim|animation|all animation|all animations|animations)\b/i;
const SEQUENCE_FOLDER_PATTERN = /\b(?:spritesheets|sprite sheets|all animations|all anim)\b/i;

function isLikelySpriteSequencePackPath(path: string): boolean {
  if (!isLikelySpriteSheetPath(path)) return false;

  const name = normalizeSpritePathText(basenameWithoutExtension(path));
  if (SPRITE_ACTION_NAME_PATTERN.test(name)) return false;
  if (GENERIC_SEQUENCE_SHEET_PATTERN.test(name)) return true;

  const parentText = normalizeSpritePathText(path.split(/[\\/]+/).slice(-3, -1).join(" "));
  return SEQUENCE_FOLDER_PATTERN.test(parentText) && !SPRITE_ACTION_NAME_PATTERN.test(parentText);
}

function sampleImageBackground(imageData: ImageData) {
  const { width, height, data } = imageData;
  const corners = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ];
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  for (const [x, y] of corners) {
    const index = (y * width + x) * 4;
    r += data[index];
    g += data[index + 1];
    b += data[index + 2];
    a += data[index + 3];
  }
  return { r: r / 4, g: g / 4, b: b / 4, a: a / 4, transparent: a < 128 };
}

function isContentPixel(data: Uint8ClampedArray, index: number, bg: ReturnType<typeof sampleImageBackground>): boolean {
  const alpha = data[index + 3];
  if (bg.transparent) return alpha >= 32;
  if (alpha < 32) return false;
  const threshold = 20;
  return (
    Math.abs(data[index] - bg.r) >= threshold ||
    Math.abs(data[index + 1] - bg.g) >= threshold ||
    Math.abs(data[index + 2] - bg.b) >= threshold
  );
}

function detectPeriod(signal: Float32Array): { lag: number; score: number } {
  const n = signal.length;
  if (n < 32) return { lag: 0, score: 0 };

  let mean = 0;
  for (let i = 0; i < n; i++) mean += signal[i];
  mean /= n;

  let variance = 0;
  for (let i = 0; i < n; i++) {
    const d = signal[i] - mean;
    variance += d * d;
  }
  variance /= n;
  if (variance < 1e-8) return { lag: 0, score: 0 };

  const minLag = 8;
  const maxLag = Math.floor(n / 2);
  if (maxLag < minLag) return { lag: 0, score: 0 };

  const acf = new Float32Array(maxLag - minLag + 1);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    const end = n - lag;
    for (let i = 0; i < end; i++) {
      sum += (signal[i] - mean) * (signal[i + lag] - mean);
    }
    acf[lag - minLag] = sum / (end * variance);
  }

  const peaks: Array<{ lag: number; score: number }> = [];
  for (let i = 1; i < acf.length - 1; i++) {
    if (acf[i] > acf[i - 1] && acf[i] >= acf[i + 1] && acf[i] > 0.2) {
      peaks.push({ lag: i + minLag, score: acf[i] });
    }
  }
  if (peaks.length === 0) return { lag: 0, score: 0 };

  let best = peaks[0];
  for (const peak of peaks) if (peak.score > best.score) best = peak;

  for (let div = 2; div <= 8; div++) {
    const candidate = Math.round(best.lag / div);
    if (candidate < minLag) break;
    const idx = candidate - minLag;
    if (idx < 0 || idx >= acf.length) continue;
    let localBest = -Infinity;
    for (let d = -1; d <= 1; d++) {
      const j = idx + d;
      if (j >= 0 && j < acf.length) localBest = Math.max(localBest, acf[j]);
    }
    if (localBest >= best.score * 0.8) {
      best = { lag: candidate, score: localBest };
    }
  }

  return best;
}

function contentRatioForRect(imageData: ImageData, source: SpriteRect, bg: ReturnType<typeof sampleImageBackground>): number {
  const { width, data } = imageData;
  let count = 0;
  for (let y = source.y; y < source.y + source.h; y++) {
    for (let x = source.x; x < source.x + source.w; x++) {
      if (isContentPixel(data, (y * width + x) * 4, bg)) count++;
    }
  }
  return count / Math.max(1, source.w * source.h);
}

function buildContentIntegral(imageData: ImageData, bg: ReturnType<typeof sampleImageBackground>): ContentIntegral {
  const { width, height, data } = imageData;
  const stride = width + 1;
  const sums = new Uint32Array((width + 1) * (height + 1));

  for (let y = 1; y <= height; y++) {
    let rowSum = 0;
    for (let x = 1; x <= width; x++) {
      if (isContentPixel(data, ((y - 1) * width + (x - 1)) * 4, bg)) rowSum++;
      sums[y * stride + x] = sums[(y - 1) * stride + x] + rowSum;
    }
  }

  return { width, height, stride, sums };
}

function contentPixelsInRect(integral: ContentIntegral, source: SpriteRect): number {
  const x1 = Math.max(0, Math.min(integral.width, source.x));
  const y1 = Math.max(0, Math.min(integral.height, source.y));
  const x2 = Math.max(x1, Math.min(integral.width, source.x + source.w));
  const y2 = Math.max(y1, Math.min(integral.height, source.y + source.h));
  const { sums, stride } = integral;
  return sums[y2 * stride + x2] - sums[y1 * stride + x2] - sums[y2 * stride + x1] + sums[y1 * stride + x1];
}

function isEmptyFrameRect(integral: ContentIntegral, source: SpriteRect): boolean {
  const area = Math.max(1, source.w * source.h);
  const minPixels = Math.max(3, Math.floor(area * 0.0015));
  return contentPixelsInRect(integral, source) < minPixels;
}

function gutterContentFraction(integral: ContentIntegral, cols: number, rows: number, gutterWidth = 2): number {
  if (cols <= 1 && rows <= 1) return 0;
  const cellWidth = integral.width / cols;
  const cellHeight = integral.height / rows;
  let contentPixels = 0;
  let gutterArea = 0;
  for (let col = 1; col < cols; col++) {
    const center = Math.round(col * cellWidth);
    const x = Math.max(0, center - Math.floor(gutterWidth / 2));
    const w = Math.min(gutterWidth, integral.width - x);
    if (w <= 0) continue;
    const stripe = { x, y: 0, w, h: integral.height };
    contentPixels += contentPixelsInRect(integral, stripe);
    gutterArea += stripe.w * stripe.h;
  }
  for (let row = 1; row < rows; row++) {
    const center = Math.round(row * cellHeight);
    const y = Math.max(0, center - Math.floor(gutterWidth / 2));
    const h = Math.min(gutterWidth, integral.height - y);
    if (h <= 0) continue;
    const stripe = { x: 0, y, w: integral.width, h };
    contentPixels += contentPixelsInRect(integral, stripe);
    gutterArea += stripe.w * stripe.h;
  }
  return gutterArea > 0 ? contentPixels / gutterArea : 0;
}

function hasClearGridGutters(integral: ContentIntegral, cols: number, rows: number): boolean {
  if (cols <= 1 && rows <= 1) return true;
  return gutterContentFraction(integral, cols, rows, 1) <= 0.002;
}

function cellSizeCandidates(length: number): number[] {
  const preferred = [16, 24, 32, 48, 64, 80, 96, 128, 192, 256];
  const sizes = new Set<number>();
  for (const size of preferred) {
    if (length % size === 0) sizes.add(size);
  }
  for (let divisions = 2; divisions <= 32; divisions++) {
    if (length % divisions === 0) sizes.add(length / divisions);
  }
  return [...sizes].filter((size) => size >= 8 && size <= length / 2).sort((a, b) => a - b);
}

function fitRectToCell(
  rect: SpriteRect,
  axis: "x" | "y",
  cellSize: number,
  imageSize: number,
): { slot: number; error: number } | null {
  const start = axis === "x" ? rect.x : rect.y;
  const size = axis === "x" ? rect.w : rect.h;
  const slots = imageSize / cellSize;
  if (!Number.isInteger(slots) || slots < 2 || size > cellSize * 0.95) return null;

  const center = start + size / 2;
  const slot = Math.max(0, Math.min(slots - 1, Math.floor(center / cellSize)));
  const slotStart = slot * cellSize;
  const slotEnd = slotStart + cellSize;
  const outside = Math.max(0, slotStart - start) + Math.max(0, start + size - slotEnd);
  const centerError = Math.abs(center - (slotStart + cellSize / 2)) / cellSize;
  if (outside > Math.max(2, cellSize * 0.06) || centerError > 0.42) return null;
  return { slot, error: centerError + outside / cellSize };
}

function scoreSequenceCellWidth(sequences: SpriteSequence[], cellSize: number, imageWidth: number): number {
  let error = 0;
  let frames = 0;
  let weakSequences = 0;

  for (const sequence of sequences) {
    const slots = new Set<number>();
    for (const frame of sequence.frames) {
      const fit = fitRectToCell(frame, "x", cellSize, imageWidth);
      if (!fit) return Number.POSITIVE_INFINITY;
      slots.add(fit.slot);
      error += fit.error;
      frames++;
    }
    if (slots.size < Math.max(2, Math.ceil(sequence.frames.length * 0.75))) weakSequences++;
  }

  if (frames === 0 || weakSequences > Math.max(0, Math.floor(sequences.length * 0.15))) {
    return Number.POSITIVE_INFINITY;
  }
  return error / frames;
}

function scoreSequenceCellHeight(sequences: SpriteSequence[], cellSize: number, imageHeight: number): number {
  const slots = new Set<number>();
  let error = 0;

  for (const sequence of sequences) {
    const rowFit = fitRectToCell(sequence.bounds, "y", cellSize, imageHeight);
    if (!rowFit) return Number.POSITIVE_INFINITY;
    slots.add(rowFit.slot);
    error += rowFit.error;

    for (const frame of sequence.frames) {
      const frameFit = fitRectToCell(frame, "y", cellSize, imageHeight);
      if (!frameFit || frameFit.slot !== rowFit.slot) return Number.POSITIVE_INFINITY;
      error += frameFit.error * 0.15;
    }
  }

  if (slots.size < Math.ceil(sequences.length * 0.75)) return Number.POSITIVE_INFINITY;
  return error / Math.max(1, sequences.length);
}

function inferSequenceCellSize(
  candidates: number[],
  score: (cellSize: number) => number,
): number | null {
  let best: { size: number; score: number } | null = null;
  for (const size of candidates) {
    const candidateScore = score(size);
    if (!Number.isFinite(candidateScore)) continue;
    if (!best || candidateScore < best.score) best = { size, score: candidateScore };
  }
  return best && best.score <= 0.22 ? best.size : null;
}

function snapRectToCell(rect: SpriteRect, cellWidth: number, cellHeight: number, imageWidth: number, imageHeight: number): SpriteRect | null {
  const xFit = fitRectToCell(rect, "x", cellWidth, imageWidth);
  const yFit = fitRectToCell(rect, "y", cellHeight, imageHeight);
  if (!xFit || !yFit) return null;
  return {
    x: xFit.slot * cellWidth,
    y: yFit.slot * cellHeight,
    w: cellWidth,
    h: cellHeight,
  };
}

function snapSequencesToRegularCells(
  imageData: ImageData,
  integral: ContentIntegral,
  sequences: SpriteSequence[],
): SpriteSequence[] {
  if (sequences.length < 2) return sequences;

  const cellWidth = inferSequenceCellSize(
    cellSizeCandidates(imageData.width),
    (cellSize) => scoreSequenceCellWidth(sequences, cellSize, imageData.width),
  );
  const cellHeight = inferSequenceCellSize(
    cellSizeCandidates(imageData.height),
    (cellSize) => scoreSequenceCellHeight(sequences, cellSize, imageData.height),
  );
  if (!cellWidth || !cellHeight) return sequences;

  const snapped: SpriteSequence[] = [];
  let weakSequences = 0;
  for (const sequence of sequences) {
    const frames: SpriteRect[] = [];
    const seen = new Set<string>();
    for (const frame of sequence.frames) {
      const cell = snapRectToCell(frame, cellWidth, cellHeight, imageData.width, imageData.height);
      if (!cell || isEmptyFrameRect(integral, cell)) continue;
      const key = `${cell.x}:${cell.y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      frames.push(cell);
    }

    if (frames.length < Math.max(2, Math.ceil(sequence.frames.length * 0.75))) weakSequences++;
    if (frames.length >= 2) {
      snapped.push({ ...sequence, frames, frameBoxes: frames, bounds: rectUnion(frames) });
    }
  }

  if (
    snapped.length < Math.max(2, Math.floor(sequences.length * 0.75)) ||
    weakSequences > Math.max(0, Math.floor(sequences.length * 0.15))
  ) {
    return sequences;
  }
  return snapped;
}

function detectActiveSpans(activity: Float32Array): Array<{ start: number; end: number }> {
  let maxActivity = 0;
  for (let i = 0; i < activity.length; i++) maxActivity = Math.max(maxActivity, activity[i]);
  const threshold = Math.max(0.005, Math.min(0.035, maxActivity * 0.08));
  const spans: Array<{ start: number; end: number }> = [];
  let start = -1;
  for (let i = 0; i < activity.length; i++) {
    if (activity[i] > threshold) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      spans.push({ start, end: i });
      start = -1;
    }
  }
  if (start >= 0) spans.push({ start, end: activity.length });

  const merged: Array<{ start: number; end: number }> = [];
  for (const span of spans.filter((item) => item.end - item.start >= 2)) {
    const prev = merged.at(-1);
    if (prev && span.start - prev.end <= 2) {
      prev.end = span.end;
    } else {
      merged.push({ ...span });
    }
  }
  return merged;
}

function detectVariableFrames(imageData: ImageData, bg: ReturnType<typeof sampleImageBackground>, rowActivity: Float32Array, colActivity: Float32Array): SpriteRect[] {
  const rowSpans = detectActiveSpans(rowActivity);
  const colSpans = detectActiveSpans(colActivity);
  if (rowSpans.length === 0 || colSpans.length === 0) return [];
  if (rowSpans.length > 16 || colSpans.length > 32 || rowSpans.length * colSpans.length > 96) return [];

  const frames: SpriteRect[] = [];
  for (const row of rowSpans) {
    for (const col of colSpans) {
      const rect = { x: col.start, y: row.start, w: col.end - col.start, h: row.end - row.start };
      if (contentRatioForRect(imageData, rect, bg) < 0.01) continue;
      frames.push(computeTrimRect(imageData, rect, bg));
    }
  }

  const imageArea = imageData.width * imageData.height;
  const usefulFrames = frames.filter((rect) => rect.w * rect.h >= imageArea * 0.001);
  return usefulFrames.length >= 2 ? usefulFrames : [];
}

function rectUnion(rects: SpriteRect[]): SpriteRect {
  const minX = Math.min(...rects.map((rect) => rect.x));
  const minY = Math.min(...rects.map((rect) => rect.y));
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.w));
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.h));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function detectAnimationSequences(imageData: ImageData, bg: ReturnType<typeof sampleImageBackground>, rowActivity: Float32Array, colActivity: Float32Array): SpriteSequence[] {
  const rowSpans = detectActiveSpans(rowActivity);
  const colSpans = detectActiveSpans(colActivity);
  if (rowSpans.length < 2 || colSpans.length < 2) return [];
  if (rowSpans.length > 24 || colSpans.length > 40 || rowSpans.length * colSpans.length > 240) return [];

  const imageArea = imageData.width * imageData.height;
  const minFrameArea = imageArea * 0.0006;
  const sequences: SpriteSequence[] = [];

  for (const [rowIndex, row] of rowSpans.entries()) {
    const frames: SpriteRect[] = [];
    const frameBoxes: SpriteRect[] = [];
    for (const col of colSpans) {
      const rect = { x: col.start, y: row.start, w: col.end - col.start, h: row.end - row.start };
      if (contentRatioForRect(imageData, rect, bg) < 0.01) continue;
      const trimmed = computeTrimRect(imageData, rect, bg);
      if (trimmed.w * trimmed.h < minFrameArea) continue;
      frames.push(trimmed);
      frameBoxes.push(rect);
    }
    if (frames.length >= 2) {
      sequences.push({ label: `row ${rowIndex + 1}`, frames, frameBoxes, bounds: rectUnion(frameBoxes) });
    }
  }

  return sequences.filter((sequence) => sequence.frames.length >= 2);
}

function hasVariableSpanSizes(spans: Array<{ start: number; end: number }>): boolean {
  if (spans.length <= 1) return false;
  const sizes = spans.map((span) => span.end - span.start);
  const min = Math.min(...sizes);
  const max = Math.max(...sizes);
  return max - min > Math.max(3, max * 0.18);
}

function scoreDivisorGrid(integral: ContentIntegral, cols: number, rows: number): number {
  if (cols <= 0 || rows <= 0) return 0;
  const total = cols * rows;
  if (total <= 1 || total > 256) return 0;
  if (integral.width % cols !== 0 || integral.height % rows !== 0) return 0;

  const cellWidth = integral.width / cols;
  const cellHeight = integral.height / rows;
  if (cellWidth < 8 || cellHeight < 8) return 0;

  let occupied = 0;
  const occupiedRows = new Set<number>();
  const occupiedCols = new Set<number>();
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const rect = { x: col * cellWidth, y: row * cellHeight, w: cellWidth, h: cellHeight };
      if (!isEmptyFrameRect(integral, rect)) {
        occupied++;
        occupiedRows.add(row);
        occupiedCols.add(col);
      }
    }
  }
  if (occupied < 2) return 0;

  const coverage = occupied / total;
  if (coverage < 0.25) return 0;

  let boundaryContent = 0;
  let boundaryArea = 0;
  for (let col = 1; col < cols; col++) {
    const x = col * cellWidth;
    const rect = { x: Math.max(0, x - 1), y: 0, w: Math.min(3, integral.width - Math.max(0, x - 1)), h: integral.height };
    boundaryContent += contentPixelsInRect(integral, rect);
    boundaryArea += rect.w * rect.h;
  }
  for (let row = 1; row < rows; row++) {
    const y = row * cellHeight;
    const rect = { x: 0, y: Math.max(0, y - 1), w: integral.width, h: Math.min(3, integral.height - Math.max(0, y - 1)) };
    boundaryContent += contentPixelsInRect(integral, rect);
    boundaryArea += rect.w * rect.h;
  }

  const boundaryRatio = boundaryArea > 0 ? boundaryContent / boundaryArea : 0;
  const boundaryScore = 1 - Math.min(1, boundaryRatio * 12);
  const cellAspect = cellWidth / cellHeight;
  const aspectScore = 1 - Math.min(1, Math.abs(Math.log(cellAspect)) / Math.log(6));
  const axisUse = (occupiedRows.size / rows + occupiedCols.size / cols) / 2;
  const frameCountScore = Math.min(1, Math.log2(total + 1) / 6);

  return boundaryScore * 0.4 + coverage * 0.2 + aspectScore * 0.22 + axisUse * 0.13 + frameCountScore * 0.05;
}

function detectDivisorGrid(integral: ContentIntegral): SpriteGrid | null {
  let best: { cols: number; rows: number; score: number } | null = null;

  for (let rows = 1; rows <= 32; rows++) {
    if (integral.height % rows !== 0) continue;
    for (let cols = 1; cols <= 32; cols++) {
      if (integral.width % cols !== 0) continue;
      const score = scoreDivisorGrid(integral, cols, rows);
      if (!best || score > best.score) best = { cols, rows, score };
    }
  }

  if (!best || best.score < 0.72) return null;
  return { cols: best.cols, rows: best.rows, confidence: Math.min(0.72, 0.42 + best.score * 0.32), mode: "grid" };
}

function parseSpriteSizeHint(path: string, imageWidth: number, imageHeight: number): SpriteGrid | null {
  const hints = [...path.matchAll(/(^|[^0-9])(\d{2,4})\s*[x×]\s*(\d{2,4})(?:\s*px)?([^0-9]|$)/gi)];
  for (const hint of hints) {
    const w = Number(hint[2]);
    const h = Number(hint[3]);
    if (w <= 0 || h <= 0) continue;
    const cols = imageWidth / w;
    const rows = imageHeight / h;
    if (Number.isInteger(cols) && Number.isInteger(rows) && cols * rows > 1 && cols <= 32 && rows <= 32) {
      return { cols, rows, confidence: 0.82, mode: "grid" };
    }
  }
  return null;
}

function parseGridHint(path: string, imageWidth: number, imageHeight: number): SpriteGrid | null {
  const hints = [...path.matchAll(/(^|[^0-9])(\d{1,2})\s*[x×]\s*(\d{1,2})([^0-9]|$)/gi)];
  for (const hint of hints) {
    const cols = Number(hint[2]);
    const rows = Number(hint[3]);
    if (cols <= 1 && rows <= 1) continue;
    if (cols > 32 || rows > 32) continue;
    if (imageWidth % cols === 0 && imageHeight % rows === 0) return { cols, rows, confidence: 0.78, mode: "grid" };
  }
  return null;
}

function buildRowSequenceGrid(cols: number, rows: number, imageWidth: number, imageHeight: number, confidence = 0.54): SpriteGrid | null {
  if (cols <= 1 || rows <= 1 || cols > 32 || rows > 32) return null;
  if (imageWidth % cols !== 0 || imageHeight % rows !== 0) return null;

  const frameWidth = imageWidth / cols;
  const frameHeight = imageHeight / rows;
  const sequences: SpriteSequence[] = Array.from({ length: rows }, (_, row) => {
    const frames = Array.from({ length: cols }, (_, col) => ({
      x: col * frameWidth,
      y: row * frameHeight,
      w: frameWidth,
      h: frameHeight,
    }));
    return {
      label: `row ${row + 1}`,
      frames,
      frameBoxes: frames,
      bounds: { x: 0, y: row * frameHeight, w: imageWidth, h: frameHeight },
    };
  });

  return { cols, rows: 1, confidence, mode: "sequence-pack", frames: sequences[0]?.frames, sequences };
}

function fallbackSequenceGridFromImage(path: string, imageWidth: number, imageHeight: number): SpriteGrid | null {
  if (!isLikelySpriteSequencePackPath(path)) return null;

  const hinted = parseSpriteSizeHint(path, imageWidth, imageHeight) ?? parseGridHint(path, imageWidth, imageHeight);
  if (hinted && hinted.cols > 1 && hinted.rows > 1) {
    return buildRowSequenceGrid(hinted.cols, hinted.rows, imageWidth, imageHeight, Math.min(0.7, hinted.confidence));
  }

  for (const cellSize of [64, 96, 80, 48, 32, 128, 24, 16]) {
    if (imageWidth % cellSize !== 0 || imageHeight % cellSize !== 0) continue;
    const cols = imageWidth / cellSize;
    const rows = imageHeight / cellSize;
    if (cols >= 2 && rows >= 2 && cols <= 16 && rows <= 16) {
      return buildRowSequenceGrid(cols, rows, imageWidth, imageHeight);
    }
  }

  return null;
}

function fallbackStaticSheetGridFromImage(sample: ArtSample, imageWidth: number, imageHeight: number): SpriteGrid | null {
  const sheetLike =
    sample.animated ||
    isLikelySpriteSheetPath(sample.path) ||
    isLikelyTextureAtlasPath(sample.path) ||
    /^(character|sprite|effect|tile|icon)$/.test(sample.kind) ||
    /^\d{1,5}$/.test(basenameWithoutExtension(sample.path));
  if (!sheetLike) return null;

  const hinted = parseSpriteSizeHint(sample.path, imageWidth, imageHeight) ?? parseGridHint(sample.path, imageWidth, imageHeight);
  if (hinted && hinted.cols * hinted.rows > 1) return { ...hinted, mode: sample.animated ? hinted.mode : "atlas" };

  for (const cellSize of [64, 32, 48, 96, 128, 24, 16]) {
    if (imageWidth % cellSize !== 0 || imageHeight % cellSize !== 0) continue;
    const cols = imageWidth / cellSize;
    const rows = imageHeight / cellSize;
    const total = cols * rows;
    if (total > 1 && total <= 256 && cols <= 32 && rows <= 32) {
      return { cols, rows, confidence: 0.52, mode: sample.animated ? "grid" : "atlas" };
    }
  }

  return null;
}

function detectGridFromImageData(
  imageData: ImageData,
  options: { sequenceMode?: SpriteSequenceMode; requireCleanGutters?: boolean } = {},
): SpriteGrid {
  const { width, height, data } = imageData;
  const bg = sampleImageBackground(imageData);
  const integral = buildContentIntegral(imageData, bg);
  const requireCleanGutters = options.requireCleanGutters ?? false;
  const finalize = (grid: SpriteGrid): SpriteGrid => {
    if (!requireCleanGutters) return grid;
    if (grid.frames || grid.sequences) return grid;
    if (grid.cols * grid.rows <= 1) return grid;
    return hasClearGridGutters(integral, grid.cols, grid.rows)
      ? grid
      : { cols: 1, rows: 1, confidence: 0, mode: "static" };
  };
  const divisorGrid = detectDivisorGrid(integral);
  const rowActivity = new Float32Array(height);
  const colActivity = new Float32Array(width);

  for (let y = 0; y < height; y++) {
    let count = 0;
    for (let x = 0; x < width; x++) {
      if (isContentPixel(data, (y * width + x) * 4, bg)) count++;
    }
    rowActivity[y] = count / width;
  }
  for (let x = 0; x < width; x++) {
    let count = 0;
    for (let y = 0; y < height; y++) {
      if (isContentPixel(data, (y * width + x) * 4, bg)) count++;
    }
    colActivity[x] = count / height;
  }

  const rowPeriod = detectPeriod(rowActivity);
  const colPeriod = detectPeriod(colActivity);
  const sequenceMode = options.sequenceMode ?? "off";
  const sequenceLayoutMode = sequenceMode === "off" ? null : sequenceMode;
  const rawSequences = sequenceLayoutMode ? detectAnimationSequences(imageData, bg, rowActivity, colActivity) : [];
  const sequences = sequenceLayoutMode ? snapSequencesToRegularCells(imageData, integral, rawSequences) : [];
  if (sequenceLayoutMode && sequences.length > 1) {
    const first = sequences[0];
    return finalize({
      cols: first.frames.length,
      rows: 1,
      confidence: 0.72,
      mode: sequenceLayoutMode,
      frames: first.frames,
      sequences,
    });
  }

  if (rowPeriod.lag > 0 && colPeriod.lag > 0) {
    const rows = Math.max(1, Math.round(height / rowPeriod.lag));
    const cols = Math.max(1, Math.round(width / colPeriod.lag));
    if (rows <= 32 && cols <= 32) {
      return finalize({ cols, rows, confidence: 0.5 + Math.min(rowPeriod.score, colPeriod.score) * 0.4, mode: "grid" });
    }
  }

  const countCells = (activity: Float32Array): number => {
    const isGap = Array.from(activity, (value) => value < 0.01);
    let start = 0;
    while (start < isGap.length && isGap[start]) start++;
    let end = isGap.length - 1;
    while (end >= start && isGap[end]) end--;
    if (start > end) return 0;
    const gaps: number[] = [];
    let gap = 0;
    for (let i = start; i <= end; i++) {
      if (isGap[i]) {
        gap++;
      } else if (gap > 0) {
        gaps.push(gap);
        gap = 0;
      }
    }
    if (gaps.length === 0) return 1;
    const threshold = Math.max(1, Math.floor(Math.max(...gaps) * 0.5));
    return gaps.filter((g) => g >= threshold).length + 1;
  };

  const rows = countCells(rowActivity);
  const cols = countCells(colActivity);
  if (rows >= 1 && cols >= 1 && rows <= 32 && cols <= 32) {
    const projectionGrid = { cols, rows, confidence: 0.6, mode: "grid" as const };
    if (
      divisorGrid &&
      (divisorGrid.confidence >= projectionGrid.confidence + 0.04 ||
        cols * rows > 96 ||
        (cols * rows > 1 && scoreDivisorGrid(integral, cols, rows) < 0.58))
    ) {
      return finalize(divisorGrid);
    }

    const frames = detectVariableFrames(imageData, bg, rowActivity, colActivity);
    const rowSpans = detectActiveSpans(rowActivity);
    const colSpans = detectActiveSpans(colActivity);
    if (frames.length > 1 && (frames.length !== rows * cols || hasVariableSpanSizes(rowSpans) || hasVariableSpanSizes(colSpans))) {
      return finalize({ cols: frames.length, rows: 1, confidence: 0.62, mode: "variable", frames });
    }
    return finalize(projectionGrid);
  }

  if (divisorGrid) return finalize(divisorGrid);

  for (const size of [16, 24, 32, 48, 64, 96, 128, 192, 256]) {
    if (width % size === 0 && height % size === 0) {
      return finalize({ cols: width / size, rows: height / size, confidence: 0.4, mode: "grid" });
    }
  }

  return { cols: 1, rows: 1, confidence: 0, mode: "static" };
}

function clampRectToImage(source: SpriteRect, imageWidth: number, imageHeight: number): SpriteRect {
  const x = Math.max(0, Math.min(imageWidth - 1, source.x));
  const y = Math.max(0, Math.min(imageHeight - 1, source.y));
  const maxX = Math.max(x + 1, Math.min(imageWidth, source.x + source.w));
  const maxY = Math.max(y + 1, Math.min(imageHeight, source.y + source.h));
  return { x, y, w: maxX - x, h: maxY - y };
}

function expandRectWithinImage(source: SpriteRect, imageWidth: number, imageHeight: number, padding: number): SpriteRect {
  if (padding <= 0) return clampRectToImage(source, imageWidth, imageHeight);
  return clampRectToImage(
    {
      x: source.x - padding,
      y: source.y - padding,
      w: source.w + padding * 2,
      h: source.h + padding * 2,
    },
    imageWidth,
    imageHeight,
  );
}

function computeTrimRect(imageData: ImageData, source: SpriteRect, bg: ReturnType<typeof sampleImageBackground>, padding = 0): SpriteRect {
  const { width, data } = imageData;
  const bounds = clampRectToImage(source, imageData.width, imageData.height);
  let minX = bounds.x + bounds.w;
  let minY = bounds.y + bounds.h;
  let maxX = bounds.x - 1;
  let maxY = bounds.y - 1;

  for (let y = bounds.y; y < bounds.y + bounds.h; y++) {
    for (let x = bounds.x; x < bounds.x + bounds.w; x++) {
      if (isContentPixel(data, (y * width + x) * 4, bg)) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) return bounds;
  return expandRectWithinImage(
    { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
    imageData.width,
    imageData.height,
    padding,
  );
}

function drawCheckerboard(context: CanvasRenderingContext2D, width: number, height: number, background = "#15171c") {
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);
  context.fillStyle = "rgba(255,255,255,0.055)";
  const size = 18;
  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size) {
      if ((x / size + y / size) % 2 === 0) context.fillRect(x, y, size, size);
    }
  }
}

function drawImageContained(context: CanvasRenderingContext2D, image: HTMLImageElement, width: number, height: number) {
  const ratio = Math.min(width / image.width, height / image.height);
  const w = image.width * ratio;
  const h = image.height * ratio;
  context.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
}

function spriteGridCellRect(imageWidth: number, imageHeight: number, cols: number, rows: number, index: number): SpriteRect {
  const col = index % cols;
  const row = Math.floor(index / cols);
  const x = Math.floor((col * imageWidth) / cols);
  const y = Math.floor((row * imageHeight) / rows);
  const nextX = Math.floor(((col + 1) * imageWidth) / cols);
  const nextY = Math.floor(((row + 1) * imageHeight) / rows);
  return { x, y, w: Math.max(1, nextX - x), h: Math.max(1, nextY - y) };
}

function framesForGrid(imageData: ImageData, grid: SpriteGrid): SpriteRect[] {
  if (grid.frames) return grid.frames;
  if (!isUnwrappableSpriteGrid(grid)) return [];
  return Array.from({ length: grid.cols * grid.rows }, (_, index) =>
    spriteGridCellRect(imageData.width, imageData.height, grid.cols, grid.rows, index),
  );
}

function nonEmptyFramesForGrid(imageData: ImageData, grid: SpriteGrid, bg: ReturnType<typeof sampleImageBackground>): SpriteRect[] {
  const frames = framesForGrid(imageData, grid);
  if (grid.frames || frames.length === 0) return frames;
  const integral = buildContentIntegral(imageData, bg);
  const occupiedFrames = frames.filter((rect) => !isEmptyFrameRect(integral, rect));
  return occupiedFrames.length >= 2 ? occupiedFrames : frames;
}

function drawSquareFrameGrid(context: CanvasRenderingContext2D, image: HTMLImageElement, frames: SpriteRect[], size: number) {
  const frameCount = frames.length;
  const maxWidth = Math.max(...frames.map((rect) => rect.w));
  const maxHeight = Math.max(...frames.map((rect) => rect.h));
  let best = { cols: frameCount, rows: 1, score: Infinity };
  for (let cols = 1; cols <= frameCount; cols++) {
    const rows = Math.ceil(frameCount / cols);
    const empty = cols * rows - frameCount;
    const ratio = (cols * maxWidth) / (rows * maxHeight);
    const score = Math.abs(Math.log(ratio)) + empty * 0.08;
    if (score < best.score) best = { cols, rows, score };
  }

  const cellWidth = size / best.cols;
  const cellHeight = size / best.rows;
  for (let index = 0; index < frames.length; index++) {
    const rect = frames[index];
    const scale = Math.min(cellWidth / rect.w, cellHeight / rect.h);
    const w = rect.w * scale;
    const h = rect.h * scale;
    const col = index % best.cols;
    const row = Math.floor(index / best.cols);
    context.drawImage(image, rect.x, rect.y, rect.w, rect.h, col * cellWidth + (cellWidth - w) / 2, row * cellHeight + (cellHeight - h) / 2, w, h);
  }
}

function displaySequenceLabel(sequence: SpriteSequence, index: number): string {
  const rowMatch = sequence.label.match(/^row\s+(\d+)$/i);
  if (rowMatch) return `Animation ${rowMatch[1]}`;
  return sequence.label || `Animation ${index + 1}`;
}

function frameBoxForSource(source: SpriteRect, width: number, height: number): SpriteRect {
  return {
    x: source.x - Math.round((width - source.w) / 2),
    y: source.y - Math.round(height - source.h),
    w: width,
    h: height,
  };
}

function spriteDrawFrames(sources: SpriteRect[], boxes?: SpriteRect[] | null): SpriteDrawFrame[] {
  if (sources.length === 0) return [];
  if (boxes?.length === sources.length) {
    return sources.map((source, index) => ({ source, box: boxes[index] }));
  }

  const width = Math.max(...sources.map((source) => source.w));
  const height = Math.max(...sources.map((source) => source.h));
  return sources.map((source) => ({ source, box: frameBoxForSource(source, width, height) }));
}

function drawSpriteFrameInStage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  frame: SpriteDrawFrame,
  stageWidth: number,
  stageHeight: number,
  width: number,
  height: number,
  offsetX = 0,
  offsetY = 0,
  verticalAlign: "center" | "bottom" = "center",
) {
  const ratio = Math.min(width / stageWidth, height / stageHeight);
  const stageW = stageWidth * ratio;
  const stageH = stageHeight * ratio;
  const stageX = offsetX + (width - stageW) / 2;
  const stageY = offsetY + (height - stageH) / 2;
  const boxX = stageX + ((stageWidth - frame.box.w) / 2) * ratio;
  const boxY =
    stageY +
    (verticalAlign === "bottom" ? stageHeight - frame.box.h : (stageHeight - frame.box.h) / 2) * ratio;
  const w = frame.source.w * ratio;
  const h = frame.source.h * ratio;
  const x = boxX + (frame.source.x - frame.box.x) * ratio;
  const y = boxY + (frame.source.y - frame.box.y) * ratio;
  context.imageSmoothingEnabled = false;
  context.drawImage(image, frame.source.x, frame.source.y, frame.source.w, frame.source.h, x, y, w, h);
}

function SequencePreviewCanvas({
  image,
  frames,
  frameBoxes,
  label,
}: {
  image: HTMLImageElement | null;
  frames: SpriteRect[];
  frameBoxes?: SpriteRect[];
  label: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || !image || frames.length === 0) return;
    const previewCanvas = canvas;
    const previewContext = context;
    const previewImage = image;
    const drawFrames = spriteDrawFrames(frames, frameBoxes);
    const stageWidth = Math.max(1, ...drawFrames.map((frame) => frame.box.w));
    const stageHeight = Math.max(1, ...drawFrames.map((frame) => frame.box.h));

    let raf = 0;
    let lastFrame = 0;
    let frameIndex = 0;

    function tick(time: number) {
      drawCheckerboard(previewContext, previewCanvas.width, previewCanvas.height, "#111318");
      if (time - lastFrame >= 120) {
        frameIndex = (frameIndex + 1) % frames.length;
        lastFrame = time;
      }
      drawSpriteFrameInStage(
        previewContext,
        previewImage,
        drawFrames[frameIndex],
        stageWidth,
        stageHeight,
        previewCanvas.width - 10,
        previewCanvas.height - 10,
        5,
        5,
        "bottom",
      );
      raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [frameBoxes, frames, image]);

  return <canvas ref={canvasRef} width={92} height={58} aria-label={label} />;
}

function SpriteSheetOverview({
  image,
  sequences,
  activeIndex,
  onSelect,
}: {
  image: HTMLImageElement | null;
  sequences: SpriteSequence[];
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mappingRef = useRef({ x: 0, y: 0, ratio: 1 });

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    drawCheckerboard(context, canvas.width, canvas.height, "#111318");
    if (!image) return;

    const ratio = Math.min((canvas.width - 20) / image.width, (canvas.height - 20) / image.height);
    const w = image.width * ratio;
    const h = image.height * ratio;
    const x = (canvas.width - w) / 2;
    const y = (canvas.height - h) / 2;
    mappingRef.current = { x, y, ratio };

    context.imageSmoothingEnabled = false;
    context.drawImage(image, x, y, w, h);

    sequences.forEach((sequence, index) => {
      const active = index === activeIndex;
      const rect = sequence.bounds;
      context.lineWidth = active ? 3 : 1.5;
      context.strokeStyle = active ? "#ffd84d" : "rgba(255,255,255,0.42)";
      context.fillStyle = active ? "rgba(255,216,77,0.14)" : "rgba(255,255,255,0.035)";
      context.fillRect(x + rect.x * ratio, y + rect.y * ratio, rect.w * ratio, rect.h * ratio);
      context.strokeRect(x + rect.x * ratio, y + rect.y * ratio, rect.w * ratio, rect.h * ratio);
    });
  }, [activeIndex, image, sequences]);

  return (
    <canvas
      ref={canvasRef}
      className="sprite-sheet-overview-canvas"
      width={320}
      height={190}
      aria-label="Sprite sheet animation overview"
      onClick={(event) => {
        const canvas = canvasRef.current;
        if (!canvas || !image) return;
        const box = canvas.getBoundingClientRect();
        const { x, y, ratio } = mappingRef.current;
        const canvasX = (event.clientX - box.left) * (canvas.width / box.width);
        const canvasY = (event.clientY - box.top) * (canvas.height / box.height);
        const imageX = (canvasX - x) / ratio;
        const imageY = (canvasY - y) / ratio;
        const nextIndex = sequences.findIndex((sequence) => {
          const rect = sequence.bounds;
          return imageX >= rect.x && imageX <= rect.x + rect.w && imageY >= rect.y && imageY <= rect.y + rect.h;
        });
        if (nextIndex >= 0) onSelect(nextIndex);
      }}
    />
  );
}

function SquareArtPreview({ sample, label }: { sample: ArtSample; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !context) return;

    let cancelled = false;
    let raf = 0;
    let lastFrameTime = 0;
    let frameIndex = 0;

    const drawFrame = (image: HTMLImageElement, rect: SpriteRect, size: number) => {
      context.clearRect(0, 0, size, size);
      context.imageSmoothingEnabled = false;
      const scale = Math.min(size / rect.w, size / rect.h);
      const w = rect.w * scale;
      const h = rect.h * scale;
      const x = (size - w) / 2;
      const y = (size - h) / 2;
      context.drawImage(image, rect.x, rect.y, rect.w, rect.h, x, y, w, h);
    };

    const startAnimation = (image: HTMLImageElement, frames: SpriteRect[], size: number) => {
      drawFrame(image, frames[0], size);
      const tick = (time: number) => {
        if (cancelled) return;
        if (time - lastFrameTime >= 120) {
          frameIndex = (frameIndex + 1) % frames.length;
          drawFrame(image, frames[frameIndex], size);
          lastFrameTime = time;
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    const loadImage = (useCors: boolean) => {
      const image = new Image();
      if (useCors) image.crossOrigin = "anonymous";
      image.onload = () => {
        if (cancelled) return;
        const size = canvas.width;
        context.clearRect(0, 0, size, size);
        context.imageSmoothingEnabled = false;

        try {
          const scratch = document.createElement("canvas");
          scratch.width = image.naturalWidth || image.width;
          scratch.height = image.naturalHeight || image.height;
          const scratchContext = scratch.getContext("2d", { willReadFrequently: true });
          if (!scratchContext) {
            drawImageContained(context, image, size, size);
            return;
          }
          scratchContext.drawImage(image, 0, 0);
          const imageData = scratchContext.getImageData(0, 0, scratch.width, scratch.height);
          const sheetLike =
            sample.animated || isLikelySpriteSheetPath(sample.path) || isLikelyTextureAtlasPath(sample.path);
          const grid = detectGridFromImageData(imageData, { requireCleanGutters: !sheetLike });
          const allFrames = framesForGrid(imageData, grid);
          const bg = sampleImageBackground(imageData);
          const integral = buildContentIntegral(imageData, bg);
          const usableFrames = allFrames.length > 1 ? allFrames.filter((rect) => !isEmptyFrameRect(integral, rect)) : allFrames;
          const animationFrames = usableFrames.length >= 2 ? usableFrames : allFrames;

          if (sample.animated && animationFrames.length >= 2) {
            startAnimation(image, animationFrames, size);
            return;
          }
          if (
            !sample.animated &&
            animationFrames.length >= 6 &&
            Math.max(imageData.width / imageData.height, imageData.height / imageData.width) >= 4
          ) {
            drawSquareFrameGrid(context, image, animationFrames, size);
            return;
          }
          drawImageContained(context, image, size, size);
        } catch {
          drawImageContained(context, image, size, size);
        }
      };
      image.onerror = () => {
        if (cancelled) return;
        if (useCors) {
          loadImage(false);
          return;
        }
        context.clearRect(0, 0, canvas.width, canvas.height);
      };
      image.src = sample.src;
    };
    loadImage(true);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [sample.animated, sample.path, sample.src]);

  return <canvas ref={canvasRef} width={128} height={128} role="img" aria-label={label} />;
}

function MultiFileSequencePreview({ srcs, label }: { srcs: readonly string[]; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !context) return;
    if (srcs.length === 0) return;

    let cancelled = false;
    let raf = 0;
    let frameIndex = 0;
    let lastFrameTime = 0;

    const drawFrame = (image: HTMLImageElement, source: SpriteRect, size: number) => {
      context.clearRect(0, 0, size, size);
      context.imageSmoothingEnabled = false;
      const scale = Math.min(size / source.w, size / source.h);
      const w = source.w * scale;
      const h = source.h * scale;
      const x = (size - w) / 2;
      const y = (size - h) / 2;
      context.drawImage(image, source.x, source.y, source.w, source.h, x, y, w, h);
    };

    const loadFrame = (src: string): Promise<{ image: HTMLImageElement; source: SpriteRect } | null> =>
      new Promise((resolve) => {
        const load = (useCors: boolean) => {
          const image = new Image();
          if (useCors) image.crossOrigin = "anonymous";
          image.onload = () => {
            const width = image.naturalWidth || image.width;
            const height = image.naturalHeight || image.height;
            let source: SpriteRect = { x: 0, y: 0, w: width, h: height };
            try {
              const scratch = document.createElement("canvas");
              scratch.width = width;
              scratch.height = height;
              const scratchCtx = scratch.getContext("2d", { willReadFrequently: true });
              if (scratchCtx) {
                scratchCtx.drawImage(image, 0, 0);
                const imageData = scratchCtx.getImageData(0, 0, width, height);
                source = computeTrimRect(imageData, source, sampleImageBackground(imageData), 2);
              }
            } catch {
              source = { x: 0, y: 0, w: width, h: height };
            }
            resolve({ image, source });
          };
          image.onerror = () => {
            if (useCors) load(false);
            else resolve(null);
          };
          image.src = src;
        };
        load(true);
      });

    Promise.all(srcs.map(loadFrame)).then((results) => {
      if (cancelled) return;
      const frames = results.filter((item): item is { image: HTMLImageElement; source: SpriteRect } => Boolean(item));
      if (frames.length === 0) return;
      const size = canvas.width;
      drawFrame(frames[0].image, frames[0].source, size);
      if (frames.length < 2) return;
      const tick = (time: number) => {
        if (cancelled) return;
        if (time - lastFrameTime >= 120) {
          frameIndex = (frameIndex + 1) % frames.length;
          const frame = frames[frameIndex];
          drawFrame(frame.image, frame.source, size);
          lastFrameTime = time;
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [srcs]);

  return <canvas ref={canvasRef} width={128} height={128} role="img" aria-label={label} />;
}

function ArtSamplePreview({ sample, sequenceSrcs }: { sample: ArtSample; sequenceSrcs?: readonly string[] }) {
  if (sequenceSrcs && sequenceSrcs.length >= 2) {
    return <MultiFileSequencePreview srcs={sequenceSrcs} label={sample.label} />;
  }
  if (isGifSample(sample)) return <img src={sample.src} alt="" loading="lazy" decoding="async" />;
  if (isSpriteSheetCandidate(sample)) return <SquareArtPreview sample={sample} label={sample.label} />;
  return <img src={sample.src} alt="" loading="lazy" decoding="async" />;
}

function GifInspector({ sample }: { sample: ArtSample }) {
  return (
    <div className="art-runner">
      <div className="art-runner-stage">
        <img className="art-gif-stage" src={sample.src} alt={sample.label} />
      </div>
      <div className="runner-controls">
        <small>Animated GIF · browser playback (no frame controls)</small>
      </div>
    </div>
  );
}

function ArtCanvasRunner({ pack, sample }: { pack: ArtPack; sample?: ArtSample }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef(0);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [columns, setColumns] = useState(4);
  const [rows, setRows] = useState(1);
  const [autoDetect, setAutoDetect] = useState(true);
  const [detectedGrid, setDetectedGrid] = useState<SpriteGrid | null>(null);
  const [layoutFrames, setLayoutFrames] = useState<SpriteRect[] | null>(null);
  const [layoutFrameBoxes, setLayoutFrameBoxes] = useState<SpriteRect[] | null>(null);
  const [sequenceIndex, setSequenceIndex] = useState(0);
  const [flip, setFlip] = useState(false);
  const [loadedImage, setLoadedImage] = useState<LoadedSpriteImage | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const background = "#15171c";

  useEffect(() => {
    setPlaying(Boolean(sample?.animated && isLikelySpriteSheetPath(sample.path)));
    frameRef.current = 0;
    setFrame(0);
    setColumns(1);
    setRows(1);
    setAutoDetect(true);
    setDetectedGrid(null);
    setLayoutFrames(null);
    setLayoutFrameBoxes(null);
    setSequenceIndex(0);
    setLoadedImage(null);
    setLoadFailed(false);
  }, [sample?.animated, sample?.path, sample?.src]);

  useEffect(() => {
    let cancelled = false;
    const loadImage = (useCors: boolean) => {
      const image = new Image();
      if (useCors) image.crossOrigin = "anonymous";
      image.onload = () => {
        if (cancelled) return;
        let imageData: ImageData | null = null;
        let bgSample: ReturnType<typeof sampleImageBackground> | null = null;
        try {
          const scratch = document.createElement("canvas");
          scratch.width = image.naturalWidth || image.width;
          scratch.height = image.naturalHeight || image.height;
          const scratchCtx = scratch.getContext("2d", { willReadFrequently: true });
          if (scratchCtx) {
            scratchCtx.drawImage(image, 0, 0);
            imageData = scratchCtx.getImageData(0, 0, scratch.width, scratch.height);
            bgSample = sampleImageBackground(imageData);
          }
        } catch {
          imageData = null;
          bgSample = null;
        }
        setLoadFailed(false);
        setLoadedImage({ src: sample?.src ?? "", image, imageData, bgSample });
      };
      image.onerror = () => {
        if (cancelled) return;
        if (useCors) {
          loadImage(false);
          return;
        }
        setLoadedImage(null);
        setLoadFailed(true);
      };
      image.src = sample?.src ?? "";
    };
    if (sample?.src) loadImage(true);
    else setLoadFailed(true);

    return () => {
      cancelled = true;
    };
  }, [sample?.src]);

  const resolvedGrid = useMemo(() => {
    if (!sample || !loadedImage?.image) return null;
    const image = loadedImage.image;
    const imageData = loadedImage.imageData;
    const imageWidth = image.naturalWidth || image.width;
    const imageHeight = image.naturalHeight || image.height;
    const hybridAtlas = isLikelyHybridSpriteAtlasPath(sample.path);
    const sequenceMode: SpriteSequenceMode = hybridAtlas
      ? "hybrid-atlas"
      : isLikelySpriteSequencePackPath(sample.path)
        ? "sequence-pack"
        : "off";
    const pureAtlas = isLikelyTextureAtlas(sample.path, sample.inspection) && !hybridAtlas;
    const sheetLike =
      sample.animated || isLikelySpriteSheet(sample.path, sample.inspection) || pureAtlas || hybridAtlas;
    const requireCleanGutters = !sheetLike;
    const fallbackSequenceGrid = sheetLike ? fallbackSequenceGridFromImage(sample.path, imageWidth, imageHeight) : null;
    const fallbackStaticGrid = sheetLike ? fallbackStaticSheetGridFromImage(sample, imageWidth, imageHeight) : null;
    if (!imageData) {
      return pureAtlas
        ? fallbackSequenceGrid ?? fallbackStaticGrid ?? { cols: 1, rows: 1, confidence: 0.9, mode: "atlas" as const }
        : fallbackSequenceGrid ?? fallbackStaticGrid;
    }
    const detectedFromPixels = detectGridFromImageData(imageData, { sequenceMode, requireCleanGutters });
    const canAnimateSample =
      sample.animated && isLikelySpriteSheet(sample.path, sample.inspection) && !pureAtlas;
    const hintedLayout = canAnimateSample
      ? parseSpriteSizeHint(sample.path, imageData.width, imageData.height) ?? parseGridHint(sample.path, imageData.width, imageData.height)
      : null;
    if (pureAtlas) {
      if (isUnwrappableSpriteGrid(detectedFromPixels)) return { ...detectedFromPixels, mode: "atlas" as const };
      if (fallbackSequenceGrid) return { ...fallbackSequenceGrid, mode: "atlas" as const };
      if (fallbackStaticGrid) return { ...fallbackStaticGrid, mode: "atlas" as const };
      return { cols: 1, rows: 1, confidence: 0.9, mode: "atlas" as const };
    }
    if (detectedFromPixels.sequences && isUsableSpriteGrid(detectedFromPixels)) return detectedFromPixels;
    if (fallbackSequenceGrid && sequenceMode === "sequence-pack" && !detectedFromPixels.sequences) return fallbackSequenceGrid;
    if (hintedLayout) return hintedLayout;
    if (!canAnimateSample || isUsableSpriteGrid(detectedFromPixels)) return detectedFromPixels;
    const wide = Math.round(imageData.width / imageData.height);
    if (wide >= 2 && wide <= 32) return { cols: wide, rows: 1, confidence: 0.55, mode: "grid" as const };
    const tall = Math.round(imageData.height / imageData.width);
    if (tall >= 2 && tall <= 32) return { cols: 1, rows: tall, confidence: 0.55, mode: "grid" as const };
    return detectedFromPixels;
  }, [loadedImage, sample]);

  const canAnimateSample = Boolean(
    sample?.animated &&
      isLikelySpriteSheet(sample.path, sample.inspection) &&
      !(
        isLikelyTextureAtlas(sample.path, sample.inspection) &&
        !isLikelyHybridSpriteAtlasPath(sample.path)
      ),
  );
  useEffect(() => {
    setDetectedGrid(resolvedGrid);
    const shouldUseFrameLayout =
      resolvedGrid && ((canAnimateSample && isUsableSpriteGrid(resolvedGrid)) || (!canAnimateSample && isUnwrappableSpriteGrid(resolvedGrid)));
    if (autoDetect && shouldUseFrameLayout && resolvedGrid) {
      const selectedSequence = resolvedGrid.sequences?.[Math.min(sequenceIndex, resolvedGrid.sequences.length - 1)];
      const detectedFrames =
        loadedImage?.imageData && loadedImage.bgSample ? nonEmptyFramesForGrid(loadedImage.imageData, resolvedGrid, loadedImage.bgSample) : resolvedGrid.frames ?? [];
      const selectedFrames =
        selectedSequence?.frames ??
        (detectedFrames.length > 0 && detectedFrames.length !== resolvedGrid.cols * resolvedGrid.rows ? detectedFrames : resolvedGrid.frames ?? null);
      setColumns(Math.max(1, selectedFrames?.length ?? resolvedGrid.cols));
      setRows(selectedFrames ? 1 : resolvedGrid.rows);
      setLayoutFrames(selectedFrames);
      setLayoutFrameBoxes(selectedSequence?.frameBoxes ?? null);
      setPlaying(canAnimateSample);
    } else if (autoDetect) {
      setColumns(1);
      setRows(1);
      setLayoutFrames(null);
      setLayoutFrameBoxes(null);
      setPlaying(false);
    }
  }, [autoDetect, canAnimateSample, loadedImage?.bgSample, loadedImage?.imageData, resolvedGrid, sequenceIndex]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const drawingCanvas = canvas;
    const context = ctx;

    let raf = 0;
    let lastFrame = 0;
    const image = loadedImage?.image ?? null;
    const imageData = loadedImage?.imageData ?? null;
    const bgSample = loadedImage?.bgSample ?? null;
    const frames = autoDetect ? layoutFrames : null;
    const frameBoxes = autoDetect ? layoutFrameBoxes : null;
    const totalFrames = Math.max(1, frames?.length ?? columns * rows);
    const usesFrameLayout = Boolean(totalFrames > 1 && (sample?.animated || (detectedGrid && isUnwrappableSpriteGrid(detectedGrid))));
    const imageWidth = image ? image.naturalWidth || image.width : 0;
    const imageHeight = image ? image.naturalHeight || image.height : 0;
    const frameSources: SpriteRect[] =
      image && imageWidth > 0 && imageHeight > 0
        ? Array.from({ length: totalFrames }, (_, index) =>
            usesFrameLayout && frames
              ? clampRectToImage(frames[index % frames.length], imageWidth, imageHeight)
              : usesFrameLayout
                ? spriteGridCellRect(imageWidth, imageHeight, columns, rows, index)
                : { x: 0, y: 0, w: imageWidth, h: imageHeight },
          )
        : [];
    const sourceBoxes =
      image && imageWidth > 0 && imageHeight > 0
        ? frameSources.map((source, index) =>
            usesFrameLayout && frameBoxes?.length
              ? clampRectToImage(frameBoxes[index % frameBoxes.length], imageWidth, imageHeight)
              : source,
          )
        : [];
    const drawFrames = spriteDrawFrames(
      frameSources.map((source, index) => {
        if (!imageData || !bgSample || !usesFrameLayout) return source;
        const sourcePadding =
          frames ? Math.min(16, Math.max(2, Math.ceil(Math.max(source.w, source.h) * 0.04))) : 0;
        const trimSource = expandRectWithinImage(sourceBoxes[index] ?? source, imageData.width, imageData.height, sourcePadding);
        return computeTrimRect(imageData, trimSource, bgSample, 2);
      }),
      sourceBoxes,
    );
    const stageWidth = Math.max(1, ...drawFrames.map((source) => source.box.w));
    const stageHeight = Math.max(1, ...drawFrames.map((source) => source.box.h));

    function drawPlaceholder() {
      context.fillStyle = "rgba(255,255,255,0.07)";
      context.fillRect(drawingCanvas.width / 2 - 48, drawingCanvas.height / 2 - 48, 96, 96);
      context.strokeStyle = "rgba(255,216,77,0.65)";
      context.lineWidth = 2;
      context.strokeRect(drawingCanvas.width / 2 - 48, drawingCanvas.height / 2 - 48, 96, 96);
      context.fillStyle = "rgba(255,255,255,0.82)";
      context.font = "600 18px system-ui";
      context.textAlign = "center";
      context.fillText(initials(pack.title) || "2D", drawingCanvas.width / 2, drawingCanvas.height / 2 + 6);
    }

    function tick(time: number) {
      drawCheckerboard(context, drawingCanvas.width, drawingCanvas.height, background);
      if (playing && sample?.animated && time - lastFrame >= 1000 / (10 * speed)) {
        frameRef.current = (frameRef.current + 1) % totalFrames;
        setFrame(frameRef.current);
        lastFrame = time;
      }
      const currentFrame = Math.min(frameRef.current, totalFrames - 1);

      if (image && !loadFailed && drawFrames.length > 0) {
        context.imageSmoothingEnabled = false;
        const drawFrame = drawFrames[currentFrame % drawFrames.length];
        const ratio = Math.min(
          (drawingCanvas.width * 0.92) / stageWidth,
          (drawingCanvas.height * 0.86) / stageHeight,
        );
        const stageW = stageWidth * ratio;
        const stageH = stageHeight * ratio;
        const w = drawFrame.source.w * ratio;
        const h = drawFrame.source.h * ratio;
        const stageX = (drawingCanvas.width - stageW) / 2;
        const stageY = (drawingCanvas.height - stageH) / 2;
        const boxX = stageX + ((stageWidth - drawFrame.box.w) / 2) * ratio;
        const boxY = stageY + (stageHeight - drawFrame.box.h) * ratio;
        const x = boxX + (drawFrame.source.x - drawFrame.box.x) * ratio;
        const y = boxY + (drawFrame.source.y - drawFrame.box.y) * ratio;
        context.save();
        if (flip) {
          context.translate(drawingCanvas.width, 0);
          context.scale(-1, 1);
          context.drawImage(image, drawFrame.source.x, drawFrame.source.y, drawFrame.source.w, drawFrame.source.h, drawingCanvas.width - x - w, y, w, h);
        } else {
          context.drawImage(image, drawFrame.source.x, drawFrame.source.y, drawFrame.source.w, drawFrame.source.h, x, y, w, h);
        }
        context.restore();
      } else {
        drawPlaceholder();
      }

      context.fillStyle = "rgba(255,255,255,0.62)";
      context.font = "12px system-ui";
      context.textAlign = "left";
      const status = totalFrames > 1 ? `${sample?.animated ? "frame" : "piece"} ${currentFrame + 1}/${totalFrames}` : "static";
      context.fillText(`${sample?.label ?? "No sample"} · ${status}`, 16, drawingCanvas.height - 18);
      raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [autoDetect, columns, detectedGrid, flip, layoutFrameBoxes, layoutFrames, loadFailed, loadedImage, pack.title, playing, rows, sample?.animated, sample?.label, speed]);

  const detectionLabel = detectedGrid
    ? detectedGrid.mode === "atlas"
        ? isUnwrappableSpriteGrid(detectedGrid)
          ? `atlas ${detectedGrid.frames?.length ?? detectedGrid.cols * detectedGrid.rows} pieces (${Math.round(detectedGrid.confidence * 100)}%)`
          : "atlas"
        : detectedGrid.mode === "hybrid-atlas"
          ? `hybrid ${detectedGrid.sequences?.length ?? 0} rows (${Math.round(detectedGrid.confidence * 100)}%)`
          : detectedGrid.mode === "sequence-pack"
            ? `sequences ${detectedGrid.sequences?.length ?? 0} rows (${Math.round(detectedGrid.confidence * 100)}%)`
            : detectedGrid.frames
              ? `auto ${detectedGrid.frames.length} frames (${Math.round(detectedGrid.confidence * 100)}%)`
              : `auto ${detectedGrid.cols}x${detectedGrid.rows} (${Math.round(detectedGrid.confidence * 100)}%)`
    : "auto";

  const sequences = detectedGrid?.sequences ?? [];
  const activeSequenceIndex = Math.min(sequenceIndex, Math.max(0, sequences.length - 1));
  const activeSequence = sequences[activeSequenceIndex];
  const canPlaySample = canAnimateSample && Math.max(1, (autoDetect ? layoutFrames?.length : undefined) ?? columns * rows) > 1;

  function selectSequence(nextIndex: number) {
    const nextSequence = sequences[nextIndex];
    setSequenceIndex(nextIndex);
    if (nextSequence) {
      setAutoDetect(true);
      setColumns(nextSequence.frames.length);
      setRows(1);
      setLayoutFrames(nextSequence.frames);
      setLayoutFrameBoxes(nextSequence.frameBoxes ?? null);
    }
    frameRef.current = 0;
    setFrame(0);
    setPlaying(Boolean(nextSequence));
  }

  return (
    <div className="art-runner">
      <div className="art-runner-stage">
        <canvas ref={canvasRef} width={960} height={540} />
        {sequences.length > 1 && (
          <aside className="animation-overview" aria-label="Detected animations">
            <div className="animation-overview-head">
              <span>{sequences.length} animations</span>
              <strong>{activeSequence ? displaySequenceLabel(activeSequence, activeSequenceIndex) : "Auto"}</strong>
            </div>
            <SpriteSheetOverview
              image={loadedImage?.image ?? null}
              sequences={sequences}
              activeIndex={activeSequenceIndex}
              onSelect={selectSequence}
            />
            <div className="animation-list">
              {sequences.map((sequence, index) => {
                const active = index === activeSequenceIndex;
                const label = displaySequenceLabel(sequence, index);
                return (
                  <button
                    key={`${sequence.label}-${index}`}
                    type="button"
                    className={active ? "active" : ""}
                    aria-pressed={active}
                    onClick={() => selectSequence(index)}
                  >
                    <SequencePreviewCanvas
                      image={loadedImage?.image ?? null}
                      frames={sequence.frames}
                      frameBoxes={sequence.frameBoxes}
                      label={label}
                    />
                    <span>
                      <strong>{label}</strong>
                      <small>{sequence.frames.length} frames</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>
        )}
      </div>
      <div className="runner-controls">
        <button type="button" onClick={() => setPlaying((value) => !value)} disabled={!canPlaySample}>
          {playing ? "Pause" : "Play"}
        </button>
        <label className="frame-control">
          Frame
          <input
            aria-label="Animation frame"
            type="range"
            min="0"
            max={Math.max(1, (autoDetect ? layoutFrames?.length : undefined) ?? columns * rows) - 1}
            value={Math.min(frame, Math.max(1, (autoDetect ? layoutFrames?.length : undefined) ?? columns * rows) - 1)}
            onChange={(event) => {
              const nextFrame = Number(event.target.value);
              frameRef.current = nextFrame;
              setFrame(nextFrame);
              setPlaying(false);
            }}
          />
          <span>{Math.min(frame, Math.max(1, (autoDetect ? layoutFrames?.length : undefined) ?? columns * rows) - 1) + 1}/{Math.max(1, (autoDetect ? layoutFrames?.length : undefined) ?? columns * rows)}</span>
        </label>
        <label>
          Speed
          <input
            aria-label="Animation speed"
            type="range"
            min="0.25"
            max="3"
            step="0.25"
            value={speed}
            onChange={(event) => setSpeed(Number(event.target.value))}
          />
          <span>{speed.toFixed(2)}x</span>
        </label>
        <label className="inline-check">
          <input type="checkbox" checked={autoDetect} onChange={(event) => setAutoDetect(event.target.checked)} />
          Auto-detect grid <small>({detectionLabel})</small>
        </label>
        {sequences.length > 1 && (
          <label>
            Sequence
            <select
              value={activeSequenceIndex}
              onChange={(event) => selectSequence(Number(event.target.value))}
            >
              {sequences.map((sequence, index) => (
                <option key={`${sequence.label}-${index}`} value={index}>
                  {displaySequenceLabel(sequence, index)} · {sequence.frames.length} frames
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Columns
          <input
            aria-label="Sprite sheet columns"
            type="range"
            min="1"
            max={Math.max(40, detectedGrid?.cols ?? columns)}
            value={columns}
            onChange={(event) => {
              setAutoDetect(false);
              setColumns(Number(event.target.value));
            }}
          />
          <span>{columns}</span>
        </label>
        <label>
          Rows
          <input
            aria-label="Sprite sheet rows"
            type="range"
            min="1"
            max={Math.max(8, detectedGrid?.rows ?? rows)}
            value={rows}
            onChange={(event) => {
              setAutoDetect(false);
              setRows(Number(event.target.value));
            }}
          />
          <span>{rows}</span>
        </label>
        <label className="inline-check">
          <input type="checkbox" checked={flip} onChange={(event) => setFlip(event.target.checked)} />
          Flip
        </label>
      </div>
    </div>
  );
}

function loadSequenceFrame(sample: ArtSample): Promise<LoadedSequenceFrame | null> {
  return new Promise((resolve) => {
    const loadImage = (useCors: boolean) => {
      const image = new Image();
      if (useCors) image.crossOrigin = "anonymous";
      image.onload = () => {
        const width = image.naturalWidth || image.width;
        const height = image.naturalHeight || image.height;
        let source = { x: 0, y: 0, w: width, h: height };
        try {
          const scratch = document.createElement("canvas");
          scratch.width = width;
          scratch.height = height;
          const context = scratch.getContext("2d", { willReadFrequently: true });
          if (context) {
            context.drawImage(image, 0, 0);
            const imageData = context.getImageData(0, 0, width, height);
            source = computeTrimRect(imageData, source, sampleImageBackground(imageData), 2);
          }
        } catch {
          source = { x: 0, y: 0, w: width, h: height };
        }
        resolve({ sample, image, source });
      };
      image.onerror = () => {
        if (useCors) {
          loadImage(false);
          return;
        }
        resolve(null);
      };
      image.src = sample.src;
    };
    loadImage(true);
  });
}

function FrameSequenceRunner({ pack, group }: { pack: ArtPack; group: ArtSampleGroup }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef(0);
  const [loadedFrames, setLoadedFrames] = useState<LoadedSequenceFrame[]>([]);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [flip, setFlip] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const background = "#15171c";

  useEffect(() => {
    frameRef.current = 0;
    setFrame(0);
    setPlaying(true);
    setLoadedFrames([]);
    setLoadFailed(false);
  }, [group.id]);

  useEffect(() => {
    let cancelled = false;
    Promise.all(group.samples.map(loadSequenceFrame)).then((frames) => {
      if (cancelled) return;
      const loaded = frames.filter((item): item is LoadedSequenceFrame => Boolean(item));
      setLoadedFrames(loaded);
      setLoadFailed(loaded.length === 0);
    });
    return () => {
      cancelled = true;
    };
  }, [group.samples]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const drawingCanvas = canvas;
    const drawingContext = context;
    let raf = 0;
    let lastFrame = 0;
    const totalFrames = Math.max(1, loadedFrames.length);
    const stageWidth = Math.max(1, ...loadedFrames.map((item) => item.source.w));
    const stageHeight = Math.max(1, ...loadedFrames.map((item) => item.source.h));

    function drawPlaceholder() {
      drawingContext.fillStyle = "rgba(255,255,255,0.07)";
      drawingContext.fillRect(drawingCanvas.width / 2 - 48, drawingCanvas.height / 2 - 48, 96, 96);
      drawingContext.strokeStyle = "rgba(255,216,77,0.65)";
      drawingContext.lineWidth = 2;
      drawingContext.strokeRect(drawingCanvas.width / 2 - 48, drawingCanvas.height / 2 - 48, 96, 96);
      drawingContext.fillStyle = "rgba(255,255,255,0.82)";
      drawingContext.font = "600 18px system-ui";
      drawingContext.textAlign = "center";
      drawingContext.fillText(initials(pack.title) || "2D", drawingCanvas.width / 2, drawingCanvas.height / 2 + 6);
    }

    function tick(time: number) {
      drawCheckerboard(drawingContext, drawingCanvas.width, drawingCanvas.height, background);
      if (playing && loadedFrames.length > 1 && time - lastFrame >= 1000 / (10 * speed)) {
        frameRef.current = (frameRef.current + 1) % totalFrames;
        setFrame(frameRef.current);
        lastFrame = time;
      }
      const currentFrame = Math.min(frameRef.current, totalFrames - 1);
      const loadedFrame = loadedFrames[currentFrame];

      if (loadedFrame && !loadFailed) {
        const source = loadedFrame.source;
        const ratio = Math.min(
          (drawingCanvas.width * 0.92) / stageWidth,
          (drawingCanvas.height * 0.86) / stageHeight,
        );
        const stageW = stageWidth * ratio;
        const stageH = stageHeight * ratio;
        const w = source.w * ratio;
        const h = source.h * ratio;
        const stageX = (drawingCanvas.width - stageW) / 2;
        const stageY = (drawingCanvas.height - stageH) / 2;
        const x = stageX + (stageW - w) / 2;
        const y = stageY + stageH - h;
        drawingContext.imageSmoothingEnabled = false;
        drawingContext.save();
        if (flip) {
          drawingContext.translate(drawingCanvas.width, 0);
          drawingContext.scale(-1, 1);
          drawingContext.drawImage(
            loadedFrame.image,
            source.x,
            source.y,
            source.w,
            source.h,
            drawingCanvas.width - x - w,
            y,
            w,
            h,
          );
        } else {
          drawingContext.drawImage(loadedFrame.image, source.x, source.y, source.w, source.h, x, y, w, h);
        }
        drawingContext.restore();
      } else {
        drawPlaceholder();
      }

      drawingContext.fillStyle = "rgba(255,255,255,0.62)";
      drawingContext.font = "12px system-ui";
      drawingContext.textAlign = "left";
      drawingContext.fillText(`${group.label} · frame ${currentFrame + 1}/${totalFrames}`, 16, drawingCanvas.height - 18);
      raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [flip, group.label, loadFailed, loadedFrames, pack.title, playing, speed]);

  const frameCount = Math.max(1, loadedFrames.length || group.samples.length);

  return (
    <div className="art-runner">
      <div className="art-runner-stage sequence-stage">
        <canvas ref={canvasRef} width={960} height={540} />
        <aside className="animation-overview" aria-label="Frame sequence files">
          <div className="animation-overview-head">
            <span>{group.samples.length} files</span>
            <strong>{group.label}</strong>
          </div>
          <div className="sequence-file-list">
            {group.samples.map((sample, index) => (
              <button
                key={sample.path}
                type="button"
                className={index === Math.min(frame, group.samples.length - 1) ? "active" : ""}
                onClick={() => {
                  frameRef.current = index;
                  setFrame(index);
                  setPlaying(false);
                }}
              >
                <span>{index + 1}</span>
                <strong>{sampleFileName(sample.path)}</strong>
              </button>
            ))}
          </div>
        </aside>
      </div>
      <div className="runner-controls">
        <button type="button" onClick={() => setPlaying((value) => !value)} disabled={frameCount <= 1}>
          {playing ? "Pause" : "Play"}
        </button>
        <label className="frame-control">
          Frame
          <input
            aria-label="Animation frame"
            type="range"
            min="0"
            max={frameCount - 1}
            value={Math.min(frame, frameCount - 1)}
            onChange={(event) => {
              const nextFrame = Number(event.target.value);
              frameRef.current = nextFrame;
              setFrame(nextFrame);
              setPlaying(false);
            }}
          />
          <span>{Math.min(frame, frameCount - 1) + 1}/{frameCount}</span>
        </label>
        <label>
          Speed
          <input
            aria-label="Animation speed"
            type="range"
            min="0.25"
            max="3"
            step="0.25"
            value={speed}
            onChange={(event) => setSpeed(Number(event.target.value))}
          />
          <span>{speed.toFixed(2)}x</span>
        </label>
        <label className="inline-check">
          <input type="checkbox" checked={flip} onChange={(event) => setFlip(event.target.checked)} />
          Flip
        </label>
      </div>
    </div>
  );
}

function ArtSampleGroupPreview({ group }: { group: ArtSampleGroup }) {
  const sequenceSrcs = group.sequence ? group.samples.map((sample) => sample.src) : undefined;
  return (
    <div className="sample-group-thumb">
      <ArtSamplePreview sample={group.primary} sequenceSrcs={sequenceSrcs} />
      {group.sequence && <span>{group.samples.length}</span>}
    </div>
  );
}

function ArtSampleBrowser({
  groups,
  activeId,
  onSelect,
}: {
  groups: ArtSampleGroup[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  if (groups.length <= 1) return null;
  return (
    <div className="sample-browser" aria-label="Pack files">
      <div className="sample-browser-head">
        <span>{groups.length} visible items</span>
        <strong>{groups.reduce((total, group) => total + group.samples.length, 0)} files</strong>
      </div>
      <div className="sample-group-grid">
        {groups.map((group) => (
          <button
            key={group.id}
            type="button"
            className={group.id === activeId ? "active" : ""}
            aria-pressed={group.id === activeId}
            onClick={() => onSelect(group.id)}
          >
            <ArtSampleGroupPreview group={group} />
            <span>
              <strong>{group.label}</strong>
              <small>{group.layout}</small>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

const artPackCache = new Map<string, ArtPack>();

function useArtPack(folder: string): { pack: ArtPack | undefined; loading: boolean; error: string | undefined } {
  const cached = artPackCache.get(folder);
  const [pack, setPack] = useState<ArtPack | undefined>(cached);
  const [loading, setLoading] = useState<boolean>(!cached);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    const hit = artPackCache.get(folder);
    if (hit) {
      setPack(hit);
      setLoading(false);
      setError(undefined);
      return;
    }
    let cancelled = false;
    setPack(undefined);
    setLoading(true);
    setError(undefined);
    fetch(`/api/media/art/${encodeURIComponent(folder)}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
      .then((data: ArtPack) => {
        if (cancelled) return;
        artPackCache.set(folder, data);
        setPack(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [folder]);

  return { pack, loading, error };
}

function PackSubjectTabs({
  subjects,
  activeSubject,
  onSelect,
}: {
  subjects: PackSubjectGroup[];
  activeSubject: string;
  onSelect: (subject: string) => void;
}) {
  if (subjects.length <= 1) return null;
  return (
    <div className="pack-subject-tabs" role="tablist" aria-label="Pack subjects">
      {subjects.map((subject) => {
        const active = subject.subject === activeSubject;
        return (
          <button
            key={subject.subject}
            type="button"
            role="tab"
            aria-selected={active}
            className={active ? "active" : ""}
            onClick={() => onSelect(subject.subject)}
          >
            <strong>{subject.subject}</strong>
            <small>{subject.samples.length} files</small>
          </button>
        );
      })}
    </div>
  );
}

function ArtWorkbench({ summary }: { summary: ArtPackSummary }) {
  const { pack, loading, error } = useArtPack(summary.folder);
  const materialSamples = useMemo(() => (pack ? materialSamplesFor(pack) : []), [pack]);
  const subjects = useMemo(() => (pack ? packSubjectGroups(materialSamples) : []), [materialSamples, pack]);
  const [activeSubject, setActiveSubject] = useState("");
  const resolvedSubject =
    subjects.find((subject) => subject.subject === activeSubject) ?? subjects[0];
  const subjectSamples = resolvedSubject?.samples ?? materialSamples;
  const groups = useMemo(() => (pack ? artSampleGroups(subjectSamples) : []), [pack, subjectSamples]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const selectedGroup = groups.find((group) => group.id === selectedGroupId) ?? groups[0];
  const selectedSample = selectedGroup?.primary;
  const materialCount = pack ? materialSamples.length : summary.materialSampleCount;
  const reportUrl = brokenAssetIssueUrl({
    id: summary.folder,
    name: summary.title,
    kind: "sprite",
    license: summary.license_class,
    sourceUrl: summary.url,
    catalogPath: "/media?view=art&type=all",
  });

  useEffect(() => {
    if (!subjects.some((subject) => subject.subject === activeSubject)) {
      setActiveSubject(subjects[0]?.subject ?? "");
    }
  }, [activeSubject, subjects]);

  useEffect(() => {
    if (!groups.some((group) => group.id === selectedGroupId)) {
      setSelectedGroupId(groups[0]?.id ?? "");
    }
  }, [groups, selectedGroupId]);

  return (
    <section className="art-workbench">
      <div className="workbench-main">
        <div className="workbench-title">
          <div>
            <div className="vendor-tag">{summary.theme}</div>
            <h3>{summary.title}</h3>
            <p className="workbench-description">{summary.description}</p>
          </div>
          <div className="workbench-credit-grid">
            <div>
              <span>Creator</span>
              {summary.author_url ? (
                <a href={summary.author_url} target="_blank" rel="noreferrer">
                  {summary.author}
                </a>
              ) : (
                <strong>{summary.author}</strong>
              )}
            </div>
            <div>
              <span>License</span>
              <LicenseLink
                license={summary.license_class}
                fallbackUrl={summary.url}
                label={licenseBucket(summary.license_class)}
                title={summary.license_class}
              />
            </div>
            {summary.url && (
              <a className="source-link" href={summary.url} target="_blank" rel="noreferrer">
                Source pack
              </a>
            )}
            <a className="source-link" href={reportUrl} target="_blank" rel="noreferrer">
              Report broken asset
            </a>
            <small>{materialCount} material files</small>
          </div>
        </div>
        {error ? (
          <div className="empty-preview">Failed to load samples: {error}</div>
        ) : !pack ? (
          <div className="empty-preview">{loading ? "Loading samples…" : "No samples"}</div>
        ) : (
          <>
            <PackSubjectTabs
              subjects={subjects}
              activeSubject={resolvedSubject?.subject ?? ""}
              onSelect={setActiveSubject}
            />
            <ArtSampleBrowser groups={groups} activeId={selectedGroup?.id ?? ""} onSelect={setSelectedGroupId} />
            {selectedGroup?.sequence ? (
              <FrameSequenceRunner pack={pack} group={selectedGroup} />
            ) : selectedSample && isGifSample(selectedSample) ? (
              <GifInspector sample={selectedSample} />
            ) : (
              <ArtCanvasRunner pack={pack} sample={selectedSample} />
            )}
          </>
        )}
      </div>
    </section>
  );
}

function ArtPackCard({
  pack,
  active,
  onSelect,
}: {
  pack: ArtPackSummary;
  active: boolean;
  onSelect: () => void;
}) {
  const preview = pack.preview;
  const materialCount = pack.materialSampleCount;
  return (
    <article className={`art-card ${active ? "active" : ""}`}>
      <button type="button" onClick={onSelect}>
        <div className="art-thumb">
          {preview ? (
            <ArtSamplePreview sample={previewSampleStub(pack, preview)} sequenceSrcs={preview.sequenceSrcs} />
          ) : (
            <span>{initials(pack.title)}</span>
          )}
        </div>
        <div className="art-card-body">
          <strong>{pack.title}</strong>
          <span>{pack.theme} · {materialCount} materials</span>
          <small>{pack.tags.slice(0, 3).join(" · ")}</small>
        </div>
      </button>
      <div className="art-card-credit">
        <div>
          <span>Creator</span>
          <strong>{pack.author}</strong>
        </div>
        <div>
          <span>License</span>
          <LicenseLink
            license={pack.license_class}
            fallbackUrl={pack.url}
            label={licenseBucket(pack.license_class)}
            title={pack.license_class}
          />
        </div>
      </div>
      <div className="media-actions">
        <span>{pack.attribution}</span>
        {pack.author_url && (
          <a href={pack.author_url} target="_blank" rel="noreferrer">
            creator
          </a>
        )}
        {pack.url && (
          <a href={pack.url} target="_blank" rel="noreferrer">
            source
          </a>
        )}
      </div>
    </article>
  );
}

type AudioSelection = { start: number; end: number };

function AudioPlayer({
  src,
  title,
  detail,
  volume = 0.8,
  rate = 1,
  loop = false,
  playSignal = 0,
  compact = false,
  audio,
  selection,
  onSelectionChange,
  onDurationChange,
}: {
  src: string | undefined;
  title: string;
  detail?: ReactNode;
  volume?: number;
  rate?: number;
  loop?: boolean;
  playSignal?: number;
  compact?: boolean;
  audio?: AudioAnalysis;
  selection?: AudioSelection;
  onSelectionChange?: (next: AudioSelection) => void;
  onDurationChange?: (duration: number) => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveformShellRef = useRef<HTMLDivElement | null>(null);
  const waveformClipId = `audio-waveform-${useId().replace(/:/g, "")}`;
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const waveBucketCount = compact ? 160 : 224;
  const loudnessEnvelope = useLoudnessEnvelope(`${src ?? ""}|${title}`, waveBucketCount, audio);
  const waveform = useMemo(() => waveformPath(loudnessEnvelope), [loudnessEnvelope]);
  const progress = duration > 0 ? clamp((currentTime / duration) * 100, 0, 100) : 0;
  const progressStyle = { "--progress": `${progress}%` } as CSSProperties;
  const waveformClipWidth = (progress / 100) * 1000;

  const hasSelection = Boolean(selection && onSelectionChange);
  const effectiveSelection = useMemo<AudioSelection | null>(() => {
    if (!hasSelection || !selection || duration <= 0) return null;
    const start = clamp(selection.start, 0, duration);
    const end = clamp(selection.end > start ? selection.end : duration, start, duration);
    return { start, end };
  }, [hasSelection, selection, duration]);
  const selectionStartPct = effectiveSelection && duration > 0 ? (effectiveSelection.start / duration) * 100 : 0;
  const selectionEndPct = effectiveSelection && duration > 0 ? (effectiveSelection.end / duration) * 100 : 100;

  function setMediaDuration(value: number) {
    const next = Number.isFinite(value) && value > 0 ? value : 0;
    setDuration(next);
    if (next > 0) onDurationChange?.(next);
  }

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.playbackRate = rate;
    audio.loop = false;
  }, [rate, volume]);

  useEffect(() => {
    setCurrentTime(0);
    setDuration(0);
    setPlaying(false);
  }, [src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !src || playSignal === 0) return;
    audio.currentTime = effectiveSelection?.start ?? 0;
    const playPromise = audio.play();
    void playPromise?.catch(() => setPlaying(false));
  }, [playSignal, src, effectiveSelection?.start]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const audio = audioRef.current;
      if (!audio || audio.paused || audio.ended) return;
      const target = audio.currentTime || 0;
      if (effectiveSelection && target >= effectiveSelection.end - 0.005) {
        if (loop) {
          audio.currentTime = effectiveSelection.start;
          setCurrentTime(effectiveSelection.start);
        } else {
          audio.pause();
          setCurrentTime(effectiveSelection.end);
          return;
        }
      } else if (!effectiveSelection && loop && duration > 0 && target >= duration - 0.005) {
        audio.currentTime = 0;
        setCurrentTime(0);
      } else {
        setCurrentTime((previous) => {
          if (!Number.isFinite(previous) || Math.abs(target - previous) > 0.35) return target;
          const eased = previous + (target - previous) * 0.45;
          return Math.abs(eased - target) < 0.004 ? target : eased;
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, effectiveSelection, loop, duration]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio || !src) return;
    if (audio.paused) {
      if (effectiveSelection) {
        const t = audio.currentTime;
        if (t < effectiveSelection.start || t >= effectiveSelection.end - 0.005) {
          audio.currentTime = effectiveSelection.start;
        }
      }
      void audio.play().catch(() => setPlaying(false));
    } else {
      audio.pause();
    }
  }

  function seek(value: number) {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(duration)) return;
    audio.currentTime = value;
    setCurrentTime(value);
  }

  function beginHandleDrag(which: "start" | "end") {
    return (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!effectiveSelection || !onSelectionChange || !waveformShellRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      const shell = waveformShellRef.current;
      const target = event.currentTarget;
      try {
        target.setPointerCapture(event.pointerId);
      } catch {
        // ignore
      }
      const updateFromClientX = (clientX: number) => {
        const rect = shell.getBoundingClientRect();
        const ratio = clamp((clientX - rect.left) / Math.max(rect.width, 1), 0, 1);
        const value = ratio * duration;
        const minGap = Math.min(0.1, duration * 0.01);
        if (which === "start") {
          const next = clamp(value, 0, effectiveSelection.end - minGap);
          onSelectionChange({ start: next, end: effectiveSelection.end });
        } else {
          const next = clamp(value, effectiveSelection.start + minGap, duration);
          onSelectionChange({ start: effectiveSelection.start, end: next });
        }
      };
      updateFromClientX(event.clientX);
      const move = (ev: PointerEvent) => updateFromClientX(ev.clientX);
      const up = () => {
        try {
          target.releasePointerCapture(event.pointerId);
        } catch {
          // ignore
        }
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    };
  }

  return (
    <div className={`audio-player ${compact ? "compact" : ""} ${playing ? "playing" : ""} ${effectiveSelection ? "has-selection" : ""}`}>
      <audio
        ref={audioRef}
        preload="none"
        src={src}
        onDurationChange={(event) => setMediaDuration(event.currentTarget.duration)}
        onLoadedMetadata={(event) => setMediaDuration(event.currentTarget.duration)}
        onPlay={(event) => {
          setCurrentTime(event.currentTarget.currentTime || 0);
          setPlaying(true);
        }}
        onPause={(event) => {
          setCurrentTime(event.currentTarget.currentTime || 0);
          setPlaying(false);
        }}
        onEnded={() => {
          setPlaying(false);
          setCurrentTime(0);
        }}
        onTimeUpdate={(event) => {
          if (!playing) setCurrentTime(event.currentTarget.currentTime || 0);
        }}
      />
      <button className="transport-button" type="button" onClick={togglePlay} disabled={!src} aria-label={playing ? "Pause audio" : "Play audio"}>
        <span className={playing ? "pause-glyph" : "play-glyph"} aria-hidden="true" />
      </button>
      <div className="audio-main">
        <div className="audio-meta">
          <div>
            <span>{playing ? "Playing" : "Ready"}</span>
            <strong>{title}</strong>
            {detail && <small>{detail}</small>}
          </div>
          <div className="audio-time">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>
        </div>
        <div className="audio-strip">
          <div className="audio-waveform-shell" style={progressStyle} ref={waveformShellRef}>
            <svg className="audio-waveform" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <clipPath id={waveformClipId}>
                  <rect x="0" y="0" width={waveformClipWidth} height="100" />
                </clipPath>
              </defs>
              <line className="audio-waveform-midline" x1="0" y1="50" x2="1000" y2="50" />
              <path className="audio-waveform-path audio-waveform-base" d={waveform} />
              <path className="audio-waveform-path audio-waveform-played" clipPath={`url(#${waveformClipId})`} d={waveform} />
            </svg>
            {effectiveSelection && (
              <>
                <div className="audio-selection-mask audio-selection-mask-left" style={{ width: `${selectionStartPct}%` }} aria-hidden="true" />
                <div
                  className="audio-selection-mask audio-selection-mask-right"
                  style={{ left: `${selectionEndPct}%`, width: `${100 - selectionEndPct}%` }}
                  aria-hidden="true"
                />
                <div
                  className="audio-selection-region"
                  style={{ left: `${selectionStartPct}%`, width: `${selectionEndPct - selectionStartPct}%` }}
                  aria-hidden="true"
                />
              </>
            )}
            <input
              aria-label={`Seek ${title}`}
              className="audio-seeker"
              type="range"
              min="0"
              max={duration || 0}
              step="0.01"
              value={duration ? currentTime : 0}
              onChange={(event) => seek(Number(event.target.value))}
              disabled={!src || duration <= 0}
            />
            {effectiveSelection && (
              <>
                <div
                  className="audio-selection-handle audio-selection-handle-start"
                  style={{ left: `${selectionStartPct}%` }}
                  role="slider"
                  aria-label="Selection start"
                  aria-valuemin={0}
                  aria-valuemax={duration}
                  aria-valuenow={effectiveSelection.start}
                  tabIndex={0}
                  onPointerDown={beginHandleDrag("start")}
                  onKeyDown={(event) => {
                    if (!onSelectionChange) return;
                    const step = event.shiftKey ? 1 : 0.1;
                    if (event.key === "ArrowLeft") {
                      event.preventDefault();
                      onSelectionChange({
                        start: clamp(effectiveSelection.start - step, 0, effectiveSelection.end - 0.1),
                        end: effectiveSelection.end,
                      });
                    } else if (event.key === "ArrowRight") {
                      event.preventDefault();
                      onSelectionChange({
                        start: clamp(effectiveSelection.start + step, 0, effectiveSelection.end - 0.1),
                        end: effectiveSelection.end,
                      });
                    }
                  }}
                >
                  <span className="audio-selection-handle-label">{formatTime(effectiveSelection.start)}</span>
                </div>
                <div
                  className="audio-selection-handle audio-selection-handle-end"
                  style={{ left: `${selectionEndPct}%` }}
                  role="slider"
                  aria-label="Selection end"
                  aria-valuemin={0}
                  aria-valuemax={duration}
                  aria-valuenow={effectiveSelection.end}
                  tabIndex={0}
                  onPointerDown={beginHandleDrag("end")}
                  onKeyDown={(event) => {
                    if (!onSelectionChange) return;
                    const step = event.shiftKey ? 1 : 0.1;
                    if (event.key === "ArrowLeft") {
                      event.preventDefault();
                      onSelectionChange({
                        start: effectiveSelection.start,
                        end: clamp(effectiveSelection.end - step, effectiveSelection.start + 0.1, duration),
                      });
                    } else if (event.key === "ArrowRight") {
                      event.preventDefault();
                      onSelectionChange({
                        start: effectiveSelection.start,
                        end: clamp(effectiveSelection.end + step, effectiveSelection.start + 0.1, duration),
                      });
                    }
                  }}
                >
                  <span className="audio-selection-handle-label">{formatTime(effectiveSelection.end)}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MusicTrackRow({ track }: { track: MusicTrack }) {
  const packId = musicTrackPackId(track);
  const reportUrl = brokenAssetIssueUrl({
    id: track.path,
    name: cleanAudioLabel(track.title),
    kind: "music",
    license: track.license,
    sourceUrl: track.url,
    catalogPath: mediaPackHref("music", packId),
  });

  return (
    <article className="track-row">
      <div className="media-row-kicker">
        <span className="sound-org sound-org-music">Music</span>
        <span>{track.source}</span>
        {track.packTitle && <span>{track.packTitle}</span>}
      </div>
      <AudioPlayer
        src={track.src}
        title={cleanAudioLabel(track.title)}
        detail={
          <>
            {track.source} ·{" "}
            <LicenseLink
              license={track.license}
              source={track.source}
              fallbackUrl={track.url}
              className="inline-license-link"
              fallbackElement="span"
            />
          </>
        }
        compact
        audio={track.audio}
      />
      <p>{track.description}</p>
      <div className="media-actions">
        <Link href={mediaPackHref("music", packId)}>{track.packTitle ? "pack" : "group"}</Link>
        {track.url && (
          <a href={track.url} target="_blank" rel="noreferrer">
            source
          </a>
        )}
        <a href={reportUrl} target="_blank" rel="noreferrer">
          Report broken asset
        </a>
      </div>
      <div className="inline-tags">
        {uniqueTags(track.tags).slice(0, 5).map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
    </article>
  );
}

function SoundPad({ collection, initialSamplePath }: { collection: SoundCollection; initialSamplePath?: string }) {
  const [sample, setSample] = useState<SoundSample | undefined>(
    collection.samples.find((item) => item.path === initialSamplePath) ?? collection.samples[0],
  );
  const [volume, setVolume] = useState(0.8);
  const [rate, setRate] = useState(1);
  const [loop, setLoop] = useState(false);
  const [playSignal, setPlaySignal] = useState(0);
  const [selection, setSelection] = useState<AudioSelection | null>(null);
  const [sampleDuration, setSampleDuration] = useState(0);
  const [downloadFormat, setDownloadFormat] = useState<AudioExportFormat>("mp3");
  const [exportBusy, setExportBusy] = useState(false);
  const [exportProgress, setExportProgress] = useState<AudioExportProgress | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const exportAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setSample(collection.samples.find((item) => item.path === initialSamplePath) ?? collection.samples[0]);
    setPlaySignal(0);
    setSelection(null);
    setSampleDuration(0);
  }, [collection.id, collection.samples, initialSamplePath]);

  useEffect(() => {
    setSelection(null);
    setSampleDuration(0);
    setExportError(null);
    setExportProgress(null);
  }, [sample?.src]);

  useEffect(() => {
    return () => {
      exportAbortRef.current?.abort();
    };
  }, []);

  function play(next: SoundSample | undefined = sample) {
    if (!next) return;
    setSample(next);
    setPlaySignal((value) => value + 1);
  }

  function handleDurationChange(value: number) {
    setSampleDuration(value);
    setSelection((current) => current ?? { start: 0, end: value });
  }

  function clearSelection() {
    setSelection(null);
  }

  async function handleDownload() {
    if (!sample?.src || sampleDuration <= 0 || exportBusy) return;
    setExportError(null);
    setExportBusy(true);
    const controller = new AbortController();
    exportAbortRef.current = controller;
    const selectionStart = selection?.start ?? 0;
    const selectionEnd = selection?.end ?? sampleDuration;
    try {
      const result = await exportAudioSelection({
        src: sample.src,
        format: downloadFormat,
        selectionStart,
        selectionEnd,
        speed: rate,
        signal: controller.signal,
        onProgress: (progress) => setExportProgress(progress),
      });
      const url = URL.createObjectURL(result.blob);
      const baseLabel = (sample.label || sample.path.split("/").pop() || "sample").replace(/\.[^.]+$/, "");
      const safeLabel = baseLabel.replace(/[^a-z0-9-_]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "sample";
      const speedTag = rate !== 1 ? `-${rate.toFixed(2)}x` : "";
      const trimTag = selection ? `-${Math.round(selectionStart * 1000)}-${Math.round(selectionEnd * 1000)}ms` : "";
      const filename = `${safeLabel}${trimTag}${speedTag}.${downloadFormat}`;
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      trackAudioExport({ format: downloadFormat });
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (error) {
      if ((error as DOMException)?.name === "AbortError") {
        // ignore — user-initiated
      } else {
        setExportError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (exportAbortRef.current === controller) exportAbortRef.current = null;
      setExportBusy(false);
      setExportProgress(null);
    }
  }

  function cancelDownload() {
    exportAbortRef.current?.abort();
  }

  const selectionDuration = selection ? Math.max(0, selection.end - selection.start) : sampleDuration;
  const exportDuration = rate > 0 ? selectionDuration / rate : selectionDuration;
  const hasNonTrivialSelection =
    Boolean(selection) && sampleDuration > 0 && (selection!.start > 0.01 || selection!.end < sampleDuration - 0.01);
  const canDownload = Boolean(sample?.src) && sampleDuration > 0 && selectionDuration > 0.05;
  const reportUrl = brokenAssetIssueUrl({
    id: sample?.path ?? collection.id,
    name: sample ? cleanAudioLabel(sample.label) : collection.title,
    kind: "sound",
    license: collection.license,
    sourceUrl: collection.url,
    catalogPath: mediaPackHref("sound", collection.id),
  });
  const progressLabel = exportProgress
    ? `${exportProgress.message ?? exportProgress.stage} · ${Math.round(exportProgress.ratio * 100)}%`
    : null;
  const progressBarValue = exportProgress
    ? exportProgress.stage === "decode"
      ? exportProgress.ratio * 0.25
      : exportProgress.stage === "render"
        ? 0.25 + exportProgress.ratio * 0.25
        : 0.5 + exportProgress.ratio * 0.5
    : 0;

  return (
    <section className="sound-pad">
      <div className="sound-pad-head">
        <div>
          <h3>{collection.title}</h3>
          <div className="media-detail">
            {collection.organizationLabel} · {collection.source} ·{" "}
            <LicenseLink
              license={collection.license}
              source={collection.source}
              fallbackUrl={collection.url}
              className="inline-license-link"
              fallbackElement="span"
            />{" "}
            · <Link href={mediaPackHref("sound", collection.id)}>Pack page</Link>{" "}
            ·{" "}
            <a href={reportUrl} target="_blank" rel="noreferrer">
              Report broken asset
            </a>
          </div>
        </div>
      </div>
      <AudioPlayer
        src={sample?.src}
        title={sample ? cleanAudioLabel(sample.label) : "No sample selected"}
        detail={sample ? `${sample.kind} · ${sample.path.split("/").pop()}` : undefined}
        volume={volume}
        rate={rate}
        loop={loop}
        playSignal={playSignal}
        audio={sample?.audio}
        selection={selection ?? undefined}
        onSelectionChange={setSelection}
        onDurationChange={handleDurationChange}
      />
      <div className="sound-controls">
        <label>
          Volume
          <input type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => setVolume(Number(event.target.value))} />
        </label>
        <label>
          Speed
          <input type="range" min="0.5" max="1.5" step="0.05" value={rate} onChange={(event) => setRate(Number(event.target.value))} />
        </label>
        <label className="inline-check">
          <input type="checkbox" checked={loop} onChange={(event) => setLoop(event.target.checked)} />
          Loop
        </label>
        {sampleDuration > 0 && (
          <div className="sound-selection-info">
            <span>Selection</span>
            <strong>
              {formatTime(selection?.start ?? 0)} – {formatTime(selection?.end ?? sampleDuration)}
              <small>
                {" "}({selectionDuration.toFixed(2)}s
                {rate !== 1 ? ` · ${exportDuration.toFixed(2)}s @ ${rate.toFixed(2)}x` : ""})
              </small>
            </strong>
            <button
              type="button"
              className="sound-selection-reset"
              onClick={clearSelection}
              disabled={!hasNonTrivialSelection}
            >
              Reset selection
            </button>
          </div>
        )}
      </div>
      {sample?.src && (
        <div className="sound-download">
          <div className="sound-download-head">
            <div className="sound-download-summary">
              <span>Download selection</span>
              <strong>
                {selectionDuration > 0 ? `${exportDuration.toFixed(2)}s` : "—"}
                {rate !== 1 && <small> @ {rate.toFixed(2)}x</small>}
              </strong>
            </div>
            <div className="sound-download-actions">
              <label className="sound-download-format">
                Format
                <select
                  value={downloadFormat}
                  onChange={(event) => setDownloadFormat(event.target.value as AudioExportFormat)}
                  disabled={exportBusy}
                >
                  <option value="mp3">MP3</option>
                  <option value="wav">WAV (lossless)</option>
                </select>
              </label>
              {exportBusy ? (
                <button type="button" className="sound-download-button danger" onClick={cancelDownload}>
                  Cancel
                </button>
              ) : (
                <button
                  type="button"
                  className="sound-download-button primary"
                  onClick={handleDownload}
                  disabled={!canDownload}
                >
                  Download {downloadFormat.toUpperCase()}
                </button>
              )}
            </div>
          </div>
          {(exportBusy || exportProgress || exportError) && (
            <div className="sound-download-progress" role="status" aria-live="polite">
              {exportBusy && (
                <>
                  <div className="sound-download-bar">
                    <div
                      className="sound-download-bar-fill"
                      style={{ width: `${Math.round(progressBarValue * 100)}%` }}
                    />
                  </div>
                  <span className="sound-download-stage">
                    {progressLabel ?? "Preparing…"}
                  </span>
                </>
              )}
              {!exportBusy && exportError && (
                <span className="sound-download-error">Export failed: {exportError}</span>
              )}
            </div>
          )}
          <p className="sound-download-hint">
            MP3 encoding happens in a background worker so the UI stays responsive. WAV is lossless but larger.
            Source audio is unchanged — re-select to export a different range.
          </p>
        </div>
      )}
      <div className="sound-buttons">
        {collection.samples.length > 0 ? (
          collection.samples.map((item) => (
            <button key={item.path} type="button" className={item.path === sample?.path ? "active" : ""} onClick={() => play(item)}>
              <span>{item.kind}</span>
              {cleanAudioLabel(item.label)}
            </button>
          ))
        ) : (
          <div className="empty-preview">No sample files in preview manifest.</div>
        )}
      </div>
    </section>
  );
}

export function MediaExplorer({
  soundCollections,
  musicTracks,
  artPacks,
  sourceMappings,
  artCreators,
  initialView = "sounds",
  initialArtType = "all",
  initialSpriteSubject = "all",
  initialSpriteMotion = "all",
  initialSoundType = "all",
}: MediaExplorerProps) {
  const [view, setView] = useState<View>(initialView);
  const [query, setQuery] = useState("");
  const lastNoResultsKey = useRef("");
  const [licenseFilter, setLicenseFilter] = useState("all");
  const [creatorFilter, setCreatorFilter] = useState("all");
  const [groupMode, setGroupMode] = useState<GroupMode>("type");
  const [artTypeFilter, setArtTypeFilter] = useState<ArtTypeFilter>(initialArtType);
  const [spriteSubjectFilter, setSpriteSubjectFilter] = useState<SpriteSubjectFilter>(initialSpriteSubject);
  const [spriteMotionFilter, setSpriteMotionFilter] = useState<SpriteMotionFilter>(initialSpriteMotion);
  const [soundTypeFilter, setSoundTypeFilter] = useState<SoundTypeFilter>(initialSoundType);
  const [soundCategoryFilter, setSoundCategoryFilter] = useState("all");
  const [soundSubcategoryFilter, setSoundSubcategoryFilter] = useState("all");
  const [soundSortMode, setSoundSortMode] = useState<SoundSortMode>("shuffle");
  const [selectedArtFolder, setSelectedArtFolder] = useState(artPacks[0]?.folder ?? "");
  const [selectedSoundPath, setSelectedSoundPath] = useState(
    soundCollections.find((item) => item.samples.length > 0)?.samples[0]?.path ?? "",
  );

  useEffect(() => {
    setView(initialView);
  }, [initialView]);

  useEffect(() => {
    setArtTypeFilter(initialArtType);
    setSpriteSubjectFilter(initialSpriteSubject);
    setSpriteMotionFilter(initialSpriteMotion);
  }, [initialArtType, initialSpriteMotion, initialSpriteSubject]);

  useEffect(() => {
    setSoundTypeFilter(initialSoundType);
  }, [initialSoundType]);

  const soundEffectCollections = useMemo(
    () => soundCollections.filter((collection) => collection.category !== "music" && collection.samples.length > 0),
    [soundCollections],
  );

  const soundEffectItems = useMemo<SoundEffectItem[]>(
    () =>
      soundEffectCollections.flatMap((collection) =>
        collection.samples.map((sample) => ({
          ...sample,
          collection,
          source: collection.source,
          license: collection.license,
          organization: collection.organization,
          organizationLabel: collection.organizationLabel,
          packHref: mediaPackHref("sound", collection.id),
          attribution: resolveSoundAttribution(sample, collection, sourceMappings),
        })),
      ),
    [soundEffectCollections, sourceMappings],
  );

  const soundCategories = useMemo(
    () => ["all", ...Array.from(new Set(soundEffectItems.map((item) => item.category))).sort(compareSoundCategories)],
    [soundEffectItems],
  );

  useEffect(() => {
    if (!soundCategories.includes(soundCategoryFilter)) {
      setSoundCategoryFilter("all");
    }
  }, [soundCategories, soundCategoryFilter]);

  const soundSubcategories = useMemo(() => {
    if (soundCategoryFilter === "all") return ["all"] as string[];
    const present = new Set(
      soundEffectItems
        .filter((item) => item.category === soundCategoryFilter)
        .map((item) => item.subcategory)
        .filter((value): value is string => Boolean(value)),
    );
    const ordered = (SOUND_SUBCATEGORIES[soundCategoryFilter] ?? []).filter((sub) => present.has(sub));
    const extras = Array.from(present).filter((sub) => !ordered.includes(sub)).sort();
    return ["all", ...ordered, ...extras];
  }, [soundCategoryFilter, soundEffectItems]);

  useEffect(() => {
    if (!soundSubcategories.includes(soundSubcategoryFilter)) {
      setSoundSubcategoryFilter("all");
    }
  }, [soundSubcategories, soundSubcategoryFilter]);

  const artLicenses = useMemo(
    () => ["all", ...Array.from(new Set(artPacks.map((p) => licenseBucket(p.license_class))))],
    [artPacks],
  );

  const filteredSounds = useMemo(() => {
    if (soundTypeFilter === "music") return [];
    const q = query.trim().toLowerCase();
    return soundEffectItems.filter((item) => {
      if (soundCategoryFilter !== "all" && item.category !== soundCategoryFilter) return false;
      if (soundSubcategoryFilter !== "all" && item.subcategory !== soundSubcategoryFilter) return false;
      return searchMatches(`${item.searchText} ${item.collection.searchText}`.toLowerCase(), q);
    });
  }, [query, soundCategoryFilter, soundSubcategoryFilter, soundEffectItems, soundTypeFilter]);

  const allSoundResults = useMemo<SoundResult[]>(
    () => [
      ...soundEffectItems.map((item) => ({
        kind: "sfx" as const,
        key: `sfx:${item.path}`,
        sortLabel: item.label.toLowerCase(),
        item,
      })),
      ...musicTracks.map((track) => ({
        kind: "music" as const,
        key: `music:${track.path}`,
        sortLabel: track.title.toLowerCase(),
        track,
      })),
    ],
    [musicTracks, soundEffectItems],
  );

  const shuffleOrder = useMemo(() => {
    const order = new Map<string, number>();
    for (const result of allSoundResults) order.set(result.key, stableShuffleScore(result.key));
    return order;
  }, [allSoundResults]);

  const filteredSoundResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = allSoundResults.filter((result) => {
      if (result.kind === "sfx") {
        if (soundTypeFilter === "music") return false;
        const { item } = result;
        if (soundCategoryFilter !== "all" && item.category !== soundCategoryFilter) return false;
        return searchMatches(`${item.searchText} ${item.collection.searchText}`.toLowerCase(), q);
      }
      if (soundTypeFilter === "sfx") return false;
      if (soundCategoryFilter !== "all") return false;
      const { track } = result;
      return searchMatches(track.searchText, q);
    });
    if (soundSortMode === "alpha") {
      return [...filtered].sort((a, b) => a.sortLabel.localeCompare(b.sortLabel));
    }
    return [...filtered].sort(
      (a, b) => (shuffleOrder.get(a.key) ?? 0) - (shuffleOrder.get(b.key) ?? 0),
    );
  }, [allSoundResults, query, shuffleOrder, soundCategoryFilter, soundSortMode, soundTypeFilter]);

  const filteredArt = useMemo(() => {
    const q = query.trim().toLowerCase();
    return artPacks.filter((pack) => {
      if (licenseFilter !== "all" && licenseBucket(pack.license_class) !== licenseFilter) return false;
      if (creatorFilter !== "all" && pack.author !== creatorFilter) return false;
      if (artTypeFilter !== "all" && pack.artType !== artTypeFilter) return false;
      if (pack.artType === "spritesheets") {
        if (spriteSubjectFilter !== "all" && pack.spriteSubject !== spriteSubjectFilter) return false;
        if (spriteMotionFilter !== "all" && pack.spriteMotion !== spriteMotionFilter) return false;
      }
      return searchMatches(pack.searchText, q);
    });
  }, [artPacks, artTypeFilter, creatorFilter, licenseFilter, query, spriteMotionFilter, spriteSubjectFilter]);

  const groupedArt = useMemo(() => {
    const labels =
      groupMode === "type"
        ? ART_TAXONOMY_ORDER
        : Array.from(new Set(filteredArt.map((pack) => pack.author))).sort();
    return labels
      .map((label) => {
        const packs = filteredArt.filter((pack) => (groupMode === "type" ? artTaxonomyLabel(pack) === label : pack.author === label));
        return {
          label,
          packs,
          creatorUrl: groupMode === "creator" ? creatorUrlForPacks(packs) : undefined,
        };
      })
      .filter((group) => group.packs.length > 0);
  }, [filteredArt, groupMode]);

  const soundList = useInfiniteList({
    total: filteredSoundResults.length,
    pageSize: SOUND_LIST_PAGE_SIZE,
    resetKey: ["sounds", query, soundCategoryFilter, soundSubcategoryFilter, soundTypeFilter, soundSortMode].join("|"),
  });

  const visibleSoundResults = useMemo(
    () => filteredSoundResults.slice(0, soundList.visibleCount),
    [filteredSoundResults, soundList.visibleCount],
  );

  const musicPackCount = useMemo(() => new Set(musicTracks.map((track) => musicTrackPackId(track))).size, [musicTracks]);

  useEffect(() => {
    if (!filteredArt.some((pack) => pack.folder === selectedArtFolder)) {
      setSelectedArtFolder(filteredArt[0]?.folder ?? "");
    }
  }, [filteredArt, selectedArtFolder]);

  useEffect(() => {
    if (!filteredSounds.some((item) => item.path === selectedSoundPath)) {
      setSelectedSoundPath(filteredSounds[0]?.path ?? "");
    }
  }, [filteredSounds, selectedSoundPath]);

  const textureMappings = useMemo(
    () => sourceMappings.filter((mapping) => mapping.medium === "texture" || mapping.category === "texture"),
    [sourceMappings],
  );
  const textureGroupLabel = `${textureMappings.length} texture ${textureMappings.length === 1 ? "group" : "groups"}`;

  const filteredTextureMappings = useMemo(() => {
    const q = query.trim().toLowerCase();
    return textureMappings.filter((mapping) => searchMatches(mapping.searchText, q));
  }, [query, textureMappings]);
  const textureList = useInfiniteList({
    total: filteredTextureMappings.length,
    pageSize: TEXTURE_LIST_PAGE_SIZE,
    resetKey: `sources:${query}`,
  });
  const visibleTextureMappings = filteredTextureMappings.slice(0, textureList.visibleCount);

  const artList = useInfiniteList({
    total: filteredArt.length,
    pageSize: ART_LIST_PAGE_SIZE,
    resetKey: ["art", query, artTypeFilter, creatorFilter, groupMode, licenseFilter, spriteMotionFilter, spriteSubjectFilter].join("|"),
  });
  const visibleGroupedArt = useMemo(() => {
    let remaining = artList.visibleCount;
    return groupedArt.flatMap((group) => {
      if (remaining <= 0) return [];
      const packs = group.packs.slice(0, remaining);
      remaining -= packs.length;
      return packs.length > 0 ? [{ ...group, packs }] : [];
    });
  }, [artList.visibleCount, groupedArt]);

  const activeAssetGroup: NavKey = view === "sounds" ? "sounds" : view === "sources" ? "packs" : "art";
  const selectedArt = filteredArt.find((pack) => pack.folder === selectedArtFolder) ?? filteredArt[0] ?? artPacks[0];
  const selectedSound = filteredSounds.find((item) => item.path === selectedSoundPath) ?? filteredSounds[0] ?? soundEffectItems[0];
  const selectedSoundCollection = selectedSound?.collection;
  const normalizedQuery = query.trim().toLowerCase();

  useEffect(() => {
    if (!normalizedQuery) return;
    const resultCount =
      view === "sounds"
        ? filteredSoundResults.length
        : view === "sources"
          ? filteredTextureMappings.length
          : filteredArt.length;
    if (resultCount > 0) return;
    const type = view === "art" ? "2d" : view;
    const key = `${type}:${normalizedQuery}`;
    if (lastNoResultsKey.current === key) return;
    lastNoResultsKey.current = key;
    trackSearchNoResults({ query: normalizedQuery, type });
  }, [filteredArt.length, filteredSoundResults.length, filteredTextureMappings.length, normalizedQuery, view]);

  function selectArtType(value: ArtTypeFilter) {
    setArtTypeFilter(value);
    if (value !== "spritesheets") {
      setSpriteSubjectFilter("all");
      setSpriteMotionFilter("all");
    }
  }

  function selectSoundType(value: SoundTypeFilter) {
    setSoundTypeFilter(value);
    if (value === "all") {
      setSoundCategoryFilter("all");
      setSoundSubcategoryFilter("all");
    }
  }

  function selectSoundCategory(value: string) {
    setSoundCategoryFilter(value);
    setSoundSubcategoryFilter("all");
  }

  return (
    <div className="media-page">
      <SiteHeader
        active={activeAssetGroup}
        meta={
          <>
            {artPacks.length} 2D sets · {textureGroupLabel} · {soundEffectItems.length} SFX previews ·{" "}
            {musicTracks.length} music tracks · {soundEffectCollections.length + musicPackCount} audio packs
          </>
        }
      />

      <section className="media-hero">
        <div>
          <div className="landing-kicker">GameDev Asset Library</div>
          <h2>Browse the library by asset type: 3D, 2D, and sounds.</h2>
        </div>
        <nav className="asset-section-nav top-nav" aria-label="Asset type">
          {navGroups.map((group) => (
            <NavDrawer key={group.key} label={group.label} active={activeAssetGroup === group.key} ariaLabel={`${group.label} assets`}>
              {group.items.map((child) => (
                <Link key={child.href} href={child.href}>
                  {child.label}
                </Link>
              ))}
            </NavDrawer>
          ))}
        </nav>
      </section>

      <section className="media-tools" aria-label="Catalog filters">
        <input
          type="search"
          placeholder={
            view === "sounds"
              ? "Search sounds, music, moods, folders, licenses"
              : view === "sources"
                ? "Search texture sets, materials, sources"
                : "Search 2D assets, creators, themes, use cases"
          }
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {view === "sources" ? (
          <span className="catalog-result-count">Textures live in the 3D group as material and surface sources.</span>
        ) : view === "sounds" ? (
          <>
            <SelectDropdown<SoundTypeFilter>
              ariaLabel="Sound type"
              value={soundTypeFilter}
              onChange={selectSoundType}
              options={[
                { value: "all", label: "All sounds" },
                { value: "sfx", label: "Sound effects" },
                { value: "music", label: "Music" },
              ]}
            />
            {soundTypeFilter !== "music" && (
              <>
                <SelectDropdown
                  ariaLabel="Sound category"
                  value={soundCategoryFilter}
                  onChange={selectSoundCategory}
                  options={soundCategories.map((category) => ({
                    value: category,
                    label: category === "all" ? "All SFX categories" : soundCategoryLabel(category),
                  }))}
                />
                {soundCategoryFilter !== "all" && soundSubcategories.length > 1 && (
                  <SelectDropdown
                    ariaLabel="Sound subcategory"
                    value={soundSubcategoryFilter}
                    onChange={setSoundSubcategoryFilter}
                    options={soundSubcategories.map((sub) => ({
                      value: sub,
                      label:
                        sub === "all"
                          ? `All ${soundCategoryLabel(soundCategoryFilter)} types`
                          : SOUND_SUBCATEGORY_LABELS[sub] ?? sub,
                    }))}
                  />
                )}
              </>
            )}
            <SelectDropdown<SoundSortMode>
              ariaLabel="Sound sort"
              value={soundSortMode}
              onChange={setSoundSortMode}
              options={[
                { value: "shuffle", label: "Shuffle" },
                { value: "alpha", label: "Name (A–Z)" },
              ]}
            />
          </>
        ) : (
          <>
            <SelectDropdown<ArtTypeFilter>
              ariaLabel="2D type"
              value={artTypeFilter}
              onChange={selectArtType}
              options={[
                { value: "all", label: "All 2D" },
                { value: "ui-icons", label: "UI / Icons" },
                { value: "spritesheets", label: "Spritesheets" },
              ]}
            />
            {artTypeFilter !== "ui-icons" && (
              <>
                <SelectDropdown<SpriteSubjectFilter>
                  ariaLabel="Sprite subject"
                  value={spriteSubjectFilter}
                  onChange={setSpriteSubjectFilter}
                  options={[
                    { value: "all", label: "All sprite subjects" },
                    { value: "characters", label: "Characters" },
                    { value: "environments", label: "Environments" },
                    { value: "effects-items", label: "Effects & items" },
                    { value: "other", label: "Other spritesheets" },
                  ]}
                />
                <SelectDropdown<SpriteMotionFilter>
                  ariaLabel="Sprite motion"
                  value={spriteMotionFilter}
                  onChange={setSpriteMotionFilter}
                  options={[
                    { value: "all", label: "Animated + static" },
                    { value: "animated", label: "Animated" },
                    { value: "static", label: "Static" },
                  ]}
                />
              </>
            )}
            <SelectDropdown
              ariaLabel="Art license"
              value={licenseFilter}
              onChange={setLicenseFilter}
              options={artLicenses.map((license) => ({
                value: license,
                label: license === "all" ? "All licenses" : license,
              }))}
            />
            <SelectDropdown
              ariaLabel="Art creator"
              value={creatorFilter}
              onChange={setCreatorFilter}
              options={[{ value: "all", label: "All creators" }, ...artCreators.map((creator) => ({ value: creator, label: creator }))]}
            />
            <div className="media-tabs compact" role="tablist" aria-label="Grouping">
              <button
                type="button"
                role="tab"
                aria-selected={groupMode === "type"}
                className={groupMode === "type" ? "active" : ""}
                onClick={() => setGroupMode("type")}
              >
                Types
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={groupMode === "creator"}
                className={groupMode === "creator" ? "active" : ""}
                onClick={() => setGroupMode("creator")}
              >
                Creators
              </button>
            </div>
          </>
        )}
      </section>

      {view === "sources" ? (
        <div className="media-single-column">
          <section className="media-panel">
            <div className="panel-heading">
              <h3>Textures</h3>
              <span>{filteredTextureMappings.length} {filteredTextureMappings.length === 1 ? "group" : "groups"}</span>
            </div>
            <div className="media-list">
              {visibleTextureMappings.map((mapping) => (
                <article className="media-row" key={mapping.id}>
                  <div>
                    <div className="media-title">{mapping.title}</div>
                    <div className="media-detail">{mapping.source} · {mapping.pathPattern}</div>
                    <p>{mapping.description}</p>
                  </div>
                  <div className="media-actions">
                    {mapping.license && (
                      <LicenseLink
                        license={mapping.license}
                        source={mapping.source}
                        fallbackUrl={mapping.url}
                        className="inline-license-link"
                        fallbackElement="span"
                      />
                    )}
                    {mapping.url && (
                      <a href={mapping.url} target="_blank" rel="noreferrer">
                        source
                      </a>
                    )}
                  </div>
                </article>
              ))}
              <InfiniteListSentinel
                className="media-list-sentinel"
                hasMore={textureList.hasMore}
                label="Loading textures"
                onLoadMore={textureList.loadMore}
                pageSize={TEXTURE_LIST_PAGE_SIZE}
                remaining={textureList.remaining}
                sentinelRef={textureList.sentinelRef}
              />
            </div>
          </section>
        </div>
      ) : view === "sounds" ? (
        <div className={soundTypeFilter === "music" ? "media-single-column" : "media-columns"}>
          <section className="media-panel">
            <div className="panel-heading">
              <h3>Sounds</h3>
              <span>
                {filteredSoundResults.length} {filteredSoundResults.length === 1 ? "result" : "results"}
              </span>
            </div>
            <div className="media-list">
              {visibleSoundResults.map((result) =>
                result.kind === "sfx" ? (
                  <article
                    className={`media-row ${result.item.path === selectedSoundPath ? "active" : ""}`}
                    key={result.key}
                  >
                    <button
                      type="button"
                      className="row-button"
                      onClick={() => setSelectedSoundPath(result.item.path)}
                    >
                      <div>
                        <div className="media-row-kicker">
                          <span className="sound-org sound-org-user-collection">
                            {soundCategoryLabel(result.item.category)}
                          </span>
                          {result.item.subcategory && (
                            <span>{SOUND_SUBCATEGORY_LABELS[result.item.subcategory] ?? result.item.subcategory}</span>
                          )}
                          <span>{result.item.attribution.source}</span>
                          <span
                            className="sound-org sound-org-license"
                            title={
                              result.item.attribution.attributionRequired
                                ? `${result.item.attribution.license} — attribution required`
                                : result.item.attribution.notes ?? result.item.attribution.license
                            }
                          >
                            <LicenseLink
                              license={result.item.attribution.license}
                              source={result.item.attribution.source}
                              fallbackUrl={result.item.attribution.fallbackUrl}
                              label={licenseBucket(result.item.attribution.license)}
                              title={
                                result.item.attribution.attributionRequired
                                  ? `${result.item.attribution.license} — attribution required`
                                  : result.item.attribution.license
                              }
                              className="inline-license-link"
                              fallbackElement="span"
                            />
                          </span>
                        </div>
                        <div className="media-title">{cleanAudioLabel(result.item.label)}</div>
                        <div className="media-detail">{result.item.collection.title}</div>
                        <p>{result.item.description}</p>
                      </div>
                    </button>
                    <div className="media-actions media-actions-attribution">
                      {result.item.attribution.creator && (
                        result.item.attribution.creatorUrl ? (
                          <a
                            href={result.item.attribution.creatorUrl}
                            target="_blank"
                            rel="noreferrer"
                            title={`${result.item.attribution.creator} on ${result.item.attribution.source}`}
                          >
                            {result.item.attribution.creator}
                          </a>
                        ) : (
                          <span title={result.item.attribution.creator}>{result.item.attribution.creator}</span>
                        )
                      )}
                      {(result.item.attribution.sourceUrl ?? result.item.attribution.fallbackUrl) && (
                        <a
                          href={result.item.attribution.sourceUrl ?? result.item.attribution.fallbackUrl}
                          target="_blank"
                          rel="noreferrer"
                          title={
                            result.item.attribution.sourceUrl
                              ? `Original sound on ${result.item.attribution.source}`
                              : `${result.item.attribution.source} pack page`
                          }
                        >
                          {result.item.attribution.sourceUrl ? "original" : "source"}
                        </a>
                      )}
                      {result.item.attribution.attributionRequired && (
                        <span
                          className="attribution-required"
                          title="License requires creator attribution when redistributing"
                        >
                          credit required
                        </span>
                      )}
                    </div>
                  </article>
                ) : (
                  <MusicTrackRow key={result.key} track={result.track} />
                ),
              )}
              <InfiniteListSentinel
                className="media-list-sentinel"
                hasMore={soundList.hasMore}
                label="Loading sounds"
                onLoadMore={soundList.loadMore}
                pageSize={SOUND_LIST_PAGE_SIZE}
                remaining={soundList.remaining}
                sentinelRef={soundList.sentinelRef}
              />
              {filteredSoundResults.length === 0 && (
                <div className="empty-preview">No sounds match.</div>
              )}
            </div>
          </section>

          {soundTypeFilter !== "music" && (
            <section className="media-panel sticky-panel">
              {selectedSoundCollection && <SoundPad collection={selectedSoundCollection} initialSamplePath={selectedSound?.path} />}
            </section>
          )}
        </div>
      ) : view === "art" ? (
        <div className="art-layout">
          {selectedArt && <ArtWorkbench summary={selectedArt} />}
          <section className="media-panel">
            <div className="panel-heading">
              <h3>2D asset sets</h3>
              <span>{filteredArt.length} sets</span>
            </div>
            <div className="art-groups">
              {visibleGroupedArt.map((group) => (
                <section className="art-group" key={group.label}>
                  <div className="art-group-heading">
                    <h4>{group.label}</h4>
                    {group.creatorUrl && (
                      <a href={group.creatorUrl} target="_blank" rel="noreferrer">
                        Creator page
                      </a>
                    )}
                  </div>
                  <div className="art-card-grid">
                    {group.packs.map((pack) => (
                      <ArtPackCard
                        key={pack.folder}
                        pack={pack}
                        active={pack.folder === selectedArtFolder}
                        onSelect={() => setSelectedArtFolder(pack.folder)}
                      />
                    ))}
                  </div>
                </section>
              ))}
              <InfiniteListSentinel
                className="media-list-sentinel"
                hasMore={artList.hasMore}
                label="Loading 2D sets"
                onLoadMore={artList.loadMore}
                pageSize={ART_LIST_PAGE_SIZE}
                remaining={artList.remaining}
                sentinelRef={artList.sentinelRef}
              />
              {groupedArt.length === 0 && <div className="empty-preview">No 2D sets match.</div>}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
