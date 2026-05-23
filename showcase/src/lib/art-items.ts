import type { ArtMotion, ArtPack, ArtSample, ArtSubject, ArtType } from "./media";
import {
  dropFramesCoveredBySheet,
  groupSequenceFrames,
  isLikelyMarketingPreviewPath,
  isLikelyPromoArt,
  sortByFrameNumber,
} from "./media-inference";
import { artPackSlug } from "./art-routing";

/**
 * One catalogable 2D asset. A pack is exploded into items so search and the
 * detail pages address individual sprites/images instead of the whole pack.
 * Animation frame runs are collapsed into a single animated item carrying its
 * `sequenceSrcs`; everything else is one item per file. `src`/`sequenceSrcs`
 * are the raw `/path.png` form as stored on disk — resolve through `assetUrl`
 * before rendering.
 */
export type ArtItem = {
  id: string;
  packFolder: string;
  label: string;
  kind: ArtSample["kind"];
  animated: boolean;
  primaryPath: string;
  paths: string[];
  src: string;
  sequenceSrcs?: string[];
  description: string;
  themes: string[];
  useCases: string[];
  tags: string[];
};

/**
 * Rich per-item record the 2D explorer renders, produced by
 * `expandArtItemIndex`. `src` is raw (`/folder/file.png`) — resolve through
 * `assetUrl` before rendering. `searchText` already folds in the parent pack's
 * tokens so a single `searchMatches` call covers item and pack text.
 */
export type ArtItemSummary = {
  id: string;
  packFolder: string;
  packSlug: string;
  packTitle: string;
  author: string;
  author_url?: string;
  theme: string;
  license_class: string;
  artType: ArtType;
  spriteSubject: ArtSubject;
  spriteMotion: ArtMotion;
  kind: ArtSample["kind"];
  animated: boolean;
  label: string;
  src: string;
  searchText: string;
};

function materialSamples(samples: ArtSample[]): ArtSample[] {
  const filtered = samples.filter(
    (sample) =>
      !sample.promo &&
      !sample.inspection?.promoBackground &&
      !isLikelyPromoArt(sample.path, sample.inspection),
  );
  if (filtered.length > 0) return filtered;
  const lighter = samples.filter((sample) => !isLikelyMarketingPreviewPath(sample.path));
  return lighter.length > 0 ? lighter : samples;
}

function humanize(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function slugifyId(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "item"
  );
}

function sequenceLabel(samples: ArtSample[]): string {
  const first = samples[0];
  const labelBase = first.label.replace(/\s*(?:frame\s*)?\d{1,5}$/i, "").trim();
  if (labelBase && !/^\d+$/.test(labelBase)) return labelBase;
  const folder = first.path.split("/").slice(0, -1).pop() ?? first.label;
  return humanize(folder) || "Frames";
}

const SUBJECT_CHARACTERS_RE =
  /(character|characters|enemy|enemies|animal|creature|hero|knight|warrior|mage|archer|monster|dino)/;
const SUBJECT_ENVIRONMENTS_RE =
  /(environment|environments|tile|tileset|terrain|forest|dungeon|platform|ground|wall|props|nature|town)/;
const SUBJECT_EFFECTS_RE = /(effect|fx|icon|item|inventory|weapon|coin|pickup|potion|spell|magic)/;

function itemSubject(pack: ArtPack, item: ArtItem): ArtSubject {
  const text = [pack.theme, pack.title, item.label, item.primaryPath, item.kind, item.tags.join(" ")]
    .join(" ")
    .toLowerCase();
  if (SUBJECT_CHARACTERS_RE.test(text)) return "characters";
  if (SUBJECT_ENVIRONMENTS_RE.test(text)) return "environments";
  if (SUBJECT_EFFECTS_RE.test(text)) return "effects-items";
  return "other";
}

function itemType(pack: ArtPack, item: ArtItem): ArtType {
  if (item.kind === "ui" || item.kind === "icon") return "ui-icons";
  if (pack.theme === "UI" || pack.theme === "Icons & Items") return "ui-icons";
  return "spritesheets";
}

/**
 * Explode a full pack into catalog items. Pure and deterministic over
 * `pack.samples` order, so the build-time index and the on-demand detail-page
 * resolution agree on every `id`.
 */
export function packArtItems(pack: ArtPack): ArtItem[] {
  const material = dropFramesCoveredBySheet(materialSamples(pack.samples));
  const groups = groupSequenceFrames(material);
  const grouped = new Set<string>();
  for (const group of groups) for (const sample of group) grouped.add(sample.path);

  const usedIds = new Set<string>();
  const assignId = (raw: string): string => {
    const base = slugifyId(raw);
    if (!usedIds.has(base)) {
      usedIds.add(base);
      return base;
    }
    let suffix = 2;
    while (usedIds.has(`${base}-${suffix}`)) suffix += 1;
    const id = `${base}-${suffix}`;
    usedIds.add(id);
    return id;
  };
  const relativePath = (path: string): string =>
    path.startsWith(`${pack.folder}/`) ? path.slice(pack.folder.length + 1) : path;

  const items: ArtItem[] = [];

  const sequences = groups
    .map((group) => sortByFrameNumber(group))
    .sort((a, b) => a[0].path.localeCompare(b[0].path));
  for (const frames of sequences) {
    const primary = frames[0];
    items.push({
      id: assignId(relativePath(primary.path).replace(/\.[^.]+$/, "")),
      packFolder: pack.folder,
      label: sequenceLabel(frames),
      kind: primary.kind,
      animated: true,
      primaryPath: primary.path,
      paths: frames.map((frame) => frame.path),
      src: primary.src,
      sequenceSrcs: frames.map((frame) => frame.src),
      description: primary.description,
      themes: primary.themes,
      useCases: primary.useCases,
      tags: primary.tags,
    });
  }

  for (const sample of material) {
    if (grouped.has(sample.path)) continue;
    items.push({
      id: assignId(relativePath(sample.path).replace(/\.[^.]+$/, "")),
      packFolder: pack.folder,
      label: sample.label,
      kind: sample.kind,
      animated: sample.animated,
      primaryPath: sample.path,
      paths: [sample.path],
      src: sample.src,
      description: sample.description,
      themes: sample.themes,
      useCases: sample.useCases,
      tags: sample.tags,
    });
  }

  return items;
}

/**
 * Wire format for `art-items.json`. Normalized + short-keyed: pack fields live
 * once in `packs`, items reference them by index. Enums are single chars. At
 * ~40k items the verbose shape was ~30 MB; this keeps the lazily-fetched index
 * an order of magnitude smaller. Reconstruct with `expandArtItemIndex`.
 */
export type ArtItemIndexPack = {
  f: string; // folder
  s: string; // slug
  t: string; // title
  a: string; // author
  u?: string; // author_url
  h: string; // theme
  l: string; // license_class
  q: string; // pack search tokens
};

export type ArtItemIndexEntry = {
  i: string; // id
  p: number; // pack index
  l: string; // label
  k: string; // kind code
  a: 0 | 1; // animated
  t: string; // artType code
  s: string; // spriteSubject code
  m: string; // spriteMotion code
  r: string; // src relative to pack folder
  q: string; // item search tokens
};

export type ArtItemIndex = {
  packs: ArtItemIndexPack[];
  items: ArtItemIndexEntry[];
};

const KIND_CODES: Record<ArtSample["kind"], string> = {
  character: "c",
  sprite: "s",
  icon: "i",
  tile: "t",
  effect: "e",
  ui: "u",
  image: "m",
};
const KIND_BY_CODE = Object.fromEntries(
  Object.entries(KIND_CODES).map(([kind, code]) => [code, kind as ArtSample["kind"]]),
) as Record<string, ArtSample["kind"]>;

const TYPE_CODES: Record<ArtType, string> = { "ui-icons": "u", spritesheets: "s" };
const TYPE_BY_CODE: Record<string, ArtType> = { u: "ui-icons", s: "spritesheets" };

const SUBJECT_CODES: Record<ArtSubject, string> = {
  characters: "c",
  environments: "e",
  "effects-items": "f",
  other: "o",
};
const SUBJECT_BY_CODE: Record<string, ArtSubject> = {
  c: "characters",
  e: "environments",
  f: "effects-items",
  o: "other",
};

function relativeSrc(folder: string, src: string): string {
  const prefix = `/${folder}/`;
  return src.startsWith(prefix) ? src.slice(prefix.length) : src.replace(/^\//, "");
}

function searchTokens(values: string[]): string {
  return Array.from(new Set(values.flatMap((value) => value.split(/\s+/)).filter(Boolean)))
    .join(" ")
    .toLowerCase();
}

/** Build the normalized client search index from full packs. */
export function buildArtItemIndex(packs: ArtPack[]): ArtItemIndex {
  const indexPacks: ArtItemIndexPack[] = [];
  const items: ArtItemIndexEntry[] = [];
  packs.forEach((pack, packIndex) => {
    indexPacks.push({
      f: pack.folder,
      s: artPackSlug(pack.folder),
      t: pack.title,
      a: pack.author,
      u: pack.author_url,
      h: pack.theme,
      l: pack.license_class,
      q: searchTokens([pack.title, pack.author, pack.theme, ...pack.tags, ...pack.themes, ...pack.useCases]),
    });
    for (const item of packArtItems(pack)) {
      const rel = relativeSrc(pack.folder, item.src);
      items.push({
        i: item.id,
        p: packIndex,
        l: item.label,
        k: KIND_CODES[item.kind],
        a: item.animated ? 1 : 0,
        t: TYPE_CODES[itemType(pack, item)],
        s: SUBJECT_CODES[itemSubject(pack, item)],
        m: item.animated ? "a" : "s",
        r: rel,
        // Item-distinctive tokens only; pack-level tags/themes live once in
        // pack.q and the label is folded back in at expand time.
        q: searchTokens([rel.replace(/\.[^.]+$/, "").replace(/[\\/]+/g, " "), item.kind]),
      });
    }
  });
  return { packs: indexPacks, items };
}

/** Reconstruct rich, render-ready records (raw srcs) from the wire index. */
export function expandArtItemIndex(index: ArtItemIndex): ArtItemSummary[] {
  return index.items.map((entry) => {
    const pack = index.packs[entry.p];
    return {
      id: entry.i,
      packFolder: pack.f,
      packSlug: pack.s,
      packTitle: pack.t,
      author: pack.a,
      author_url: pack.u,
      theme: pack.h,
      license_class: pack.l,
      artType: TYPE_BY_CODE[entry.t] ?? "spritesheets",
      spriteSubject: SUBJECT_BY_CODE[entry.s] ?? "other",
      spriteMotion: entry.m === "a" ? "animated" : "static",
      kind: KIND_BY_CODE[entry.k] ?? "image",
      animated: entry.a === 1,
      label: entry.l,
      src: `/${pack.f}/${entry.r}`,
      searchText: `${entry.l} ${entry.q} ${pack.q}`.toLowerCase(),
    };
  });
}
