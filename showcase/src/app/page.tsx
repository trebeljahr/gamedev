import Link from "next/link";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { downloadsForModel, manifest } from "@/lib/manifest";
import audioAnalysisData from "@/lib/audio-analysis.json";
import { catalog, mediaStats, sourceMappings } from "@/lib/media";
import { CatalogSearch } from "@/components/CatalogSearch";
import { AssetTypeNav } from "@/components/AssetTypeNav";
import { pageMetadata } from "@/lib/seo";
import {
  LibraryHeroShowreel,
  type LibraryModelPreview,
  type LibrarySoundPreview,
  type LibrarySpritePreview,
} from "@/components/LibraryHeroShowreel";
import { isLikelyMarketingPreviewPath, isLikelySpriteSheetPath } from "@/lib/media-inference";
import type { ArtPack, ArtSample, ArtTheme, MusicTrack } from "@/lib/media";

type HomePageProps = {
  searchParams?: Promise<{
    model?: string | string[];
  }>;
};

export const metadata: Metadata = pageMetadata({
  title: "Free Game Assets Library for Prototypes",
  description:
    "Search 7,000+ free game-ready 3D models, pixel art, sounds, music, textures, license notes, and creator credits in one fast browser catalog.",
  pathname: "/",
});

const LANDING_ASSET_BASE_URL = (
  process.env.NEXT_PUBLIC_LANDING_ASSETS_BASE_URL ?? "https://assets.gamedev.trebeljahr.com"
).replace(/\/+$/, "");

function assetUrl(src: string) {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(src)) return src;
  return `${LANDING_ASSET_BASE_URL}${src.startsWith("/") ? src : `/${src}`}`;
}

type FeaturedSpriteCategory = "character" | "environment" | "icons";

const FEATURED_SPRITE_SLOTS: Array<{
  category: FeaturedSpriteCategory;
  themes: ArtTheme[];
  label: string;
  requireAnimated: boolean;
  preferKinds?: ArtSample["kind"][];
}> = [
  {
    category: "character",
    themes: ["Characters"],
    label: "Character",
    requireAnimated: true,
    preferKinds: ["character", "sprite"],
  },
  {
    category: "environment",
    themes: ["Environments"],
    label: "Environment",
    requireAnimated: false,
    preferKinds: ["tile", "sprite", "image"],
  },
  {
    category: "icons",
    themes: ["Icons & Items", "UI"],
    label: "Icons & UI",
    requireAnimated: false,
    preferKinds: ["icon", "ui"],
  },
];

const audioAnalysisItems = (audioAnalysisData as {
  items?: Record<string, { duration?: number; loudness?: number[] }>;
}).items ?? {};

const FEATURED_MODEL_PICKS = [
  {
    packId: "kaykit/medieval-builder-pack",
    name: "castle",
    position: [-1.2, -0.74, -0.08],
    rotation: [0, 0.5, 0],
    scale: 0.62,
  },
  {
    packId: "quaternius/spaceships-by-quaternius",
    name: "Spaceship3",
    position: [0.82, 0.44, -0.3],
    rotation: [-0.12, -0.72, 0.08],
    scale: 0.16,
  },
  {
    packId: "quaternius/animated-robot-oct-2018",
    name: "Robot",
    position: [1.38, -0.74, 0.48],
    rotation: [0, -0.35, 0],
    scale: 0.27,
  },
] satisfies Array<{
  packId: string;
  name: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
}>;

const FEATURED_MUSIC_TITLES = [
  "Bittersweet",
  "Black Vortex",
  "Comfortable Mystery 2",
];

function selectFeaturedModels(): LibraryModelPreview[] {
  return FEATURED_MODEL_PICKS.flatMap((pick) => {
    const pack = manifest.packs.find((item) => item.id === pick.packId);
    const model = pack?.models.find((item) => item.name === pick.name);
    if (!pack || !model) return [];
    const optimized = downloadsForModel(model).find((download) => download.optimized);

    return {
      label: model.label,
      file: optimized?.file ?? model.file,
      source: pack.source,
      minY: model.minY,
      position: pick.position,
      rotation: pick.rotation,
      scale: pick.scale,
    };
  });
}

function landingSpriteScore(
  pack: ArtPack,
  sample: ArtSample,
  slot: (typeof FEATURED_SPRITE_SLOTS)[number],
): number {
  const text = `${pack.title} ${pack.theme} ${sample.label} ${sample.path}`.toLowerCase();
  let score = 0;
  if (slot.requireAnimated && !sample.animated) return -Infinity;
  if (sample.animated) score += 40;
  if (slot.preferKinds?.includes(sample.kind)) score += 50;
  if (slot.category === "character") {
    if (isLikelySpriteSheetPath(sample.path)) score += 40;
    if (/strip[\s_-]*\d{1,2}/i.test(sample.path)) score += 24;
    if (/\b(idle|walk|run|hero|knight|archer|warrior|character)\b/i.test(text)) score += 18;
  }
  if (slot.category === "environment") {
    if (/\b(background|parallax|tileset|tilemap|scene|biome|plains|forest|cave|mine|mountain|island|town|city)\b/i.test(text))
      score += 40;
    if (/\b(front|mid|midground|foreground)\b/i.test(text)) score += 30;
    if (/back[\s_-]?\d.*(front|mid)/i.test(sample.path)) score += 20;
    if (/\b(sky|cloud|stars|moon)\b/i.test(text)) score -= 18;
    if (/preview|sprite|animation|attack|idle|walk|run|jump|crouch|hurt|roll/i.test(text)) score -= 30;
    if (/coupon|sale|promo|trap|pedestal|supplies|object|item|prop|full\.png/i.test(text)) score -= 40;
    if (sample.animated) score -= 18;
    if (/\.gif($|[?#])/i.test(sample.path)) score -= 30;
  }
  if (slot.category === "icons") {
    if (/\b(icon|coin|gem|diamond|heart|potion|key|item|inventory|hud|button)\b/i.test(text))
      score += 22;
    if (/\.gif($|[?#])/i.test(sample.path)) score += 8;
  }
  if (/\.png($|[?#])/i.test(sample.path)) score += 12;
  if (isLikelyMarketingPreviewPath(sample.path) || /all free|all animations|all attacks/i.test(text))
    score -= 50;
  return score;
}

function selectFeaturedSprites(): LibrarySpritePreview[] {
  const selected: LibrarySpritePreview[] = [];
  const usedPacks = new Set<string>();

  for (const slot of FEATURED_SPRITE_SLOTS) {
    const candidates = catalog.artPacks
      .filter((pack) => slot.themes.includes(pack.theme))
      .flatMap((pack) =>
        pack.samples.map((sample) => ({ pack, sample, score: landingSpriteScore(pack, sample, slot) })),
      )
      .filter((item) => Number.isFinite(item.score))
      .sort((a, b) => b.score - a.score || a.sample.path.localeCompare(b.sample.path));
    const candidate =
      candidates.find((item) => !usedPacks.has(item.pack.folder)) ?? candidates[0];
    if (!candidate) continue;

    usedPacks.add(candidate.pack.folder);
    const rawLabel = candidate.sample.label?.trim() ?? "";
    const isGenericLabel = /^(sprite\s*sheet|spritesheet|character[\s_-]*spritesheet|tiles?|assets?|full|sheet)$/i.test(rawLabel);
    const displayLabel = isGenericLabel || rawLabel.length === 0 ? candidate.pack.title : rawLabel;
    selected.push({
      category: slot.category,
      categoryLabel: slot.label,
      title: candidate.pack.title,
      theme: candidate.pack.theme,
      label: displayLabel,
      kind: candidate.sample.kind,
      animated: candidate.sample.animated,
      path: candidate.sample.path,
      src: assetUrl(candidate.sample.src),
    });
  }

  return selected;
}

function soundPreviewForTrack(track: MusicTrack): LibrarySoundPreview | undefined {
  const audio = audioAnalysisItems[track.path];
  if (!audio?.loudness?.length) return undefined;

  return {
    title: track.title,
    source: track.source,
    path: track.path,
    duration: audio.duration ?? 0,
    loudness: audio.loudness,
  };
}

function selectFeaturedSounds(): LibrarySoundPreview[] {
  const byTitle = new Map(catalog.musicTracks.map((track) => [track.title, track]));
  const picks = FEATURED_MUSIC_TITLES
    .map((title) => byTitle.get(title))
    .filter(Boolean)
    .map((track) => soundPreviewForTrack(track as MusicTrack))
    .filter(Boolean) as LibrarySoundPreview[];

  if (picks.length < 3) {
    for (const track of catalog.musicTracks) {
      if (picks.some((pick) => pick.path === track.path)) continue;
      const preview = soundPreviewForTrack(track);
      if (!preview) continue;
      picks.push(preview);
      if (picks.length === 3) break;
    }
  }

  const seen = new Set<string>();
  return picks.filter((sample) => {
    const key = sample.path;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 3);
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const modelParam = firstParam(params?.model);
  const modelMotion = modelParam === "animated" || modelParam === "static" ? modelParam : "all";
  const featuredModels = selectFeaturedModels();
  const featuredSprites = selectFeaturedSprites();
  const featuredSounds = selectFeaturedSounds();
  const totalModels = manifest.packs.reduce((n, p) => n + p.count, 0);
  const iconPackCount = catalog.artPacks.filter((pack) => pack.theme === "UI" || pack.theme === "Icons & Items").length;
  const spritePackCount = Math.max(mediaStats.artPackCount - iconPackCount, 0);
  const textureSourceCount = sourceMappings.filter((mapping) => mapping.medium === "texture").length;
  const textureGroupCount = textureSourceCount || 1;
  const textureGroupLabel = `${textureGroupCount} texture ${textureGroupCount === 1 ? "group" : "groups"}`;
  const totalMediaCollections =
    spritePackCount +
    iconPackCount +
    textureSourceCount +
    mediaStats.soundCollectionCount +
    mediaStats.musicTrackCount;

  return (
    <>
      <SiteHeader
        meta={
          <>
            {totalModels.toLocaleString()} models · {manifest.packs.length} pack collections ·{" "}
            {totalMediaCollections} media collections
          </>
        }
      />

      <main className="library-page">
        <section className="library-hero" aria-labelledby="library-heading">
          <div className="library-hero-copy">
            <div className="landing-kicker">GameDev Asset Library</div>
            <h2 id="library-heading">Search the whole asset archive from one place.</h2>
            <p>
              3D models and textures, animated 2D sprite sheets, sound effects,
              music, and VFX share the same compact navigation.
            </p>
            <div className="library-actions" aria-label="Primary catalog actions">
              <Link className="landing-button primary" href="/models">
                Search every model
              </Link>
              <Link className="landing-button secondary" href="/media">
                Explore media
              </Link>
              <Link className="landing-button secondary" href="#3d-collections">
                Browse pack collections
              </Link>
            </div>
          </div>
          <LibraryHeroShowreel models={featuredModels} sprites={featuredSprites} sounds={featuredSounds} />
        </section>

        <AssetTypeNav note={`${totalModels.toLocaleString()} models · ${textureGroupLabel} · ${totalMediaCollections} media collections`} />

        <section className="catalog-heading" id="3d-collections" aria-labelledby="packs-heading">
          <div>
            <div className="landing-kicker">3D catalog</div>
            <h2 id="packs-heading">Pack collections</h2>
          </div>
          <div className="catalog-heading-actions">
            <Link href="/models">Search every model</Link>
            <Link href="/all">Open world viewer</Link>
          </div>
        </section>

        <CatalogSearch manifest={manifest} showHeader={false} modelMotion={modelMotion} />
      </main>
    </>
  );
}
