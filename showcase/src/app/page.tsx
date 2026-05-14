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

const FEATURED_SPRITE_THEMES: ArtTheme[] = [
  "Characters",
  "Enemies",
  "Effects",
  "Vehicles & Sci-Fi",
  "Icons & Items",
  "Environments",
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

function landingSpriteScore(pack: ArtPack, sample: ArtSample): number {
  const text = `${pack.title} ${pack.theme} ${sample.label} ${sample.path}`.toLowerCase();
  let score = 0;
  if (sample.animated) score += 60;
  if (isLikelySpriteSheetPath(sample.path)) score += 30;
  if (/\.png($|[?#])/i.test(sample.path)) score += 20;
  if (/strip[\s_-]*\d{1,2}/i.test(sample.path)) score += 28;
  if (/\b(idle|walk|run|attack|move|loop|death|coin|fire|vfx|impact|explosion)\b/i.test(text)) score += 18;
  if (sample.kind === "effect" || sample.kind === "icon") score += 8;
  if (isLikelyMarketingPreviewPath(sample.path) || /all free|all animations|all attacks/i.test(text)) score -= 50;
  if (/\.gif($|[?#])/i.test(sample.path)) score -= 12;
  return score;
}

function selectFeaturedSprites(): LibrarySpritePreview[] {
  const selected: LibrarySpritePreview[] = [];
  const usedPacks = new Set<string>();

  for (const theme of FEATURED_SPRITE_THEMES) {
    const candidates = catalog.artPacks
      .filter((pack) => pack.theme === theme)
      .flatMap((pack) =>
        pack.samples
          .filter((sample) => sample.animated && isLikelySpriteSheetPath(sample.path))
          .map((sample) => ({ pack, sample, score: landingSpriteScore(pack, sample) })),
      )
      .sort((a, b) => b.score - a.score || a.sample.path.localeCompare(b.sample.path));
    const candidate =
      candidates.find((item) => !usedPacks.has(item.pack.folder)) ?? candidates[0];
    if (!candidate) continue;

    usedPacks.add(candidate.pack.folder);
    selected.push({
      title: candidate.pack.title,
      theme: candidate.pack.theme,
      label: candidate.sample.label,
      kind: candidate.sample.kind,
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
