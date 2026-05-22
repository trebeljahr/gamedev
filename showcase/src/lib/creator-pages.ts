import fs from "node:fs";
import path from "node:path";
import { creatorSlug } from "@/lib/creator-routing";
import { exactLicenseUrlFor, licenseForVendor } from "@/lib/license";
import {
  artPackSummaries,
  mediaPacks,
  sourceMappings,
  type ArtPackSummary,
  type MediaPack,
  type SourceMapping,
} from "@/lib/media";
import {
  displayPackTitle,
  manifest,
  type Model,
  type Pack,
} from "@/lib/manifest";
import { modelHref, modelRouteRefForModel } from "@/lib/model-routes";

export type CreatorMetadata = {
  slug: string;
  name: string;
  upstreamUrl: string;
  patreonUrl?: string;
  tipUrl?: string;
  notes?: string;
  fromMarkdown: boolean;
};

export type CreatorAsset = {
  id: string;
  kind: "model" | "art" | "audio" | "source";
  title: string;
  subtitle: string;
  href?: string;
  thumbnailSrc?: string;
  modelFile?: string;
  license: string;
  licenseUrl?: string;
  sourceUrl?: string;
  tags: string[];
};

export type CreatorPageData = {
  metadata: CreatorMetadata;
  assets: CreatorAsset[];
  counts: {
    models: number;
    art: number;
    audio: number;
    source: number;
  };
};

type CreatorFrontmatter = {
  name?: string;
  upstreamUrl?: string;
  patreonUrl?: string;
  tipUrl?: string;
  notes?: string;
};

const CREATOR_DATA_DIR = path.join(process.cwd(), "..", "data", "creators");
const GENERIC_UPSTREAMS: Record<string, string> = {
  "poly-pizza": "https://poly.pizza/",
  pixabay: "https://pixabay.com/",
  freesound: "https://freesound.org/",
};

function parseFrontmatter(raw: string): CreatorFrontmatter {
  const match = raw.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return {};

  const data: CreatorFrontmatter = {};
  for (const line of match[1].split("\n")) {
    const entry = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!entry) continue;
    const key = entry[1] as keyof CreatorFrontmatter;
    const value = entry[2].trim().replace(/^["']|["']$/g, "");
    if (key in data || ["name", "upstreamUrl", "patreonUrl", "tipUrl", "notes"].includes(key)) {
      data[key] = value;
    }
  }
  return data;
}

function metadataOverride(slug: string): CreatorFrontmatter | undefined {
  const file = path.join(CREATOR_DATA_DIR, `${slug}.md`);
  try {
    return parseFrontmatter(fs.readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
}

function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function splitCreatorNames(value: string): string[] {
  if (/mixed sources/i.test(value)) return [value];
  return value.split(", ").map((item) => item.trim()).filter(Boolean);
}

function creatorNamesForSourceMapping(mapping: SourceMapping): string[] {
  const creator = mapping.likelyCreator ?? mapping.source;
  if (/\bor\b/i.test(creator)) return [];
  return [creator];
}

function matchesCreator(slug: string, creators: string[]): boolean {
  return creators.some((creator) => creatorSlug(creator) === slug);
}

function creatorLabelForPack(pack: Pack): string {
  const credit = licenseForVendor(pack.vendor);
  return credit.vendorLabel || pack.source || pack.vendor;
}

function creatorNamesForPack(pack: Pack): string[] {
  return [pack.source, pack.vendor, creatorLabelForPack(pack)];
}

function creatorNamesForArtPack(pack: ArtPackSummary): string[] {
  return [pack.author];
}

function creatorNamesForMediaPack(pack: MediaPack): string[] {
  return splitCreatorNames(pack.source);
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function allCreatorNames(): string[] {
  return uniqueSorted([
    ...manifest.packs.flatMap(creatorNamesForPack),
    ...artPackSummaries.flatMap(creatorNamesForArtPack),
    ...mediaPacks.flatMap(creatorNamesForMediaPack),
    ...sourceMappings.flatMap(creatorNamesForSourceMapping),
  ]);
}

export function getCreatorSlugs(): string[] {
  return uniqueSorted(allCreatorNames().map(creatorSlug));
}

function inferredCreatorName(slug: string): string {
  const match = allCreatorNames().find((name) => creatorSlug(name) === slug);
  if (!match) return titleFromSlug(slug);
  const vendor = manifest.packs.find((pack) => matchesCreator(slug, creatorNamesForPack(pack)));
  if (vendor) return creatorLabelForPack(vendor);
  return match;
}

function inferredUpstreamUrl(slug: string, name: string): string {
  const vendorPack = manifest.packs.find((pack) => matchesCreator(slug, creatorNamesForPack(pack)));
  if (vendorPack) {
    const credit = licenseForVendor(vendorPack.vendor);
    if (credit.vendorUrl) return credit.vendorUrl;
  }

  const artPack = artPackSummaries.find((pack) => matchesCreator(slug, creatorNamesForArtPack(pack)));
  if (artPack?.author_url) return artPack.author_url;

  const mapping = sourceMappings.find((item) => matchesCreator(slug, creatorNamesForSourceMapping(item)));
  if (mapping && GENERIC_UPSTREAMS[creatorSlug(mapping.source)]) return GENERIC_UPSTREAMS[creatorSlug(mapping.source)];

  return `https://itch.io/search?q=${encodeURIComponent(name)}`;
}

export function getCreatorMetadata(slug: string): CreatorMetadata {
  const override = metadataOverride(slug);
  const inferredName = inferredCreatorName(slug);
  const name = override?.name ?? inferredName;
  return {
    slug,
    name,
    upstreamUrl: override?.upstreamUrl ?? inferredUpstreamUrl(slug, name),
    patreonUrl: override?.patreonUrl,
    tipUrl: override?.tipUrl,
    notes: override?.notes,
    fromMarkdown: !!override,
  };
}

function licenseUrl(license: string, source: string, fallbackUrl?: string): string | undefined {
  return exactLicenseUrlFor(license, { source, fallbackUrl });
}

function modelAssetsForCreator(slug: string): CreatorAsset[] {
  const assets: CreatorAsset[] = [];
  for (const pack of manifest.packs) {
    if (!matchesCreator(slug, creatorNamesForPack(pack))) continue;
    const credit = licenseForVendor(pack.vendor);
    const license = pack.license || credit.license;
    const packTitle = displayPackTitle(pack);
    for (const model of pack.models) {
      const ref = modelRouteRefForModel(pack, model as Model);
      assets.push({
        id: `model:${model.file}`,
        kind: "model",
        title: model.title,
        subtitle: packTitle,
        href: modelHref(pack, ref ?? model),
        modelFile: model.file,
        license,
        licenseUrl: licenseUrl(license, credit.vendorLabel, credit.licenseUrl),
        tags: [model.category, model.subcategory, ...model.themes, ...model.style, ...model.tags].slice(0, 8),
      });
    }
  }
  return assets;
}

function artAssetsForCreator(slug: string): CreatorAsset[] {
  return artPackSummaries
    .filter((pack) => matchesCreator(slug, creatorNamesForArtPack(pack)))
    .map((pack) => ({
      id: `art:${pack.folder}`,
      kind: "art" as const,
      title: pack.title,
      subtitle: `${pack.sampleCount.toLocaleString("en-US")} sprites and images`,
      href: `/media?view=art&pack=${encodeURIComponent(pack.folder)}`,
      thumbnailSrc: pack.preview?.src,
      license: pack.license_class,
      licenseUrl: licenseUrl(pack.license_class, pack.author, pack.url),
      sourceUrl: pack.url,
      tags: [pack.category, pack.theme, ...pack.themes, ...pack.useCases, ...pack.tags].slice(0, 8),
    }));
}

function mediaAssetsForCreator(slug: string): CreatorAsset[] {
  return mediaPacks
    .filter((pack) => matchesCreator(slug, creatorNamesForMediaPack(pack)))
    .map((pack) => ({
      id: `media:${pack.kind}:${pack.id}`,
      kind: "audio" as const,
      title: pack.title,
      subtitle: `${pack.itemCount.toLocaleString("en-US")} ${pack.kind === "music" ? "music tracks" : "sound files"}`,
      href: `/media/packs/${pack.slug}`,
      license: pack.license,
      licenseUrl: licenseUrl(pack.license, pack.source, pack.url),
      sourceUrl: pack.url,
      tags: [pack.kind, pack.category, ...pack.themes, ...pack.useCases, ...pack.tags].slice(0, 8),
    }));
}

function sourceAssetsForCreator(slug: string): CreatorAsset[] {
  return sourceMappings
    .filter((mapping) => matchesCreator(slug, creatorNamesForSourceMapping(mapping)))
    .map((mapping) => ({
      id: `source:${mapping.id}`,
      kind: "source" as const,
      title: mapping.title,
      subtitle: mapping.pathPattern,
      license: mapping.license ?? "See source metadata",
      licenseUrl: licenseUrl(mapping.license ?? "See source metadata", mapping.source),
      tags: [mapping.medium, mapping.category, ...mapping.themes, ...mapping.useCases, ...mapping.tags].slice(0, 8),
    }));
}

export function getCreatorPageData(slug: string): CreatorPageData {
  const assets = [
    ...modelAssetsForCreator(slug),
    ...artAssetsForCreator(slug),
    ...mediaAssetsForCreator(slug),
    ...sourceAssetsForCreator(slug),
  ].sort((a, b) => a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title));

  return {
    metadata: getCreatorMetadata(slug),
    assets,
    counts: {
      models: assets.filter((asset) => asset.kind === "model").length,
      art: assets.filter((asset) => asset.kind === "art").length,
      audio: assets.filter((asset) => asset.kind === "audio").length,
      source: assets.filter((asset) => asset.kind === "source").length,
    },
  };
}
