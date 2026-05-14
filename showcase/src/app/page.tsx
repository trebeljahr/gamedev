import Link from "next/link";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { manifest } from "@/lib/manifest";
import { catalog, mediaStats, sourceMappings } from "@/lib/media";
import { CatalogSearch } from "@/components/CatalogSearch";
import { navGroups } from "@/lib/navigation";
import { pageMetadata } from "@/lib/seo";
import {
  LibraryHeroShowreel,
  type LibrarySoundPreview,
  type LibrarySpritePreview,
} from "@/components/LibraryHeroShowreel";
import { isLikelySpriteSheetPath } from "@/lib/media-inference";
import type { ArtPack, ArtSample, ArtTheme } from "@/lib/media";

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

function landingSpriteScore(pack: ArtPack, sample: ArtSample): number {
  const text = `${pack.title} ${pack.theme} ${sample.label} ${sample.path}`.toLowerCase();
  let score = 0;
  if (sample.animated) score += 60;
  if (isLikelySpriteSheetPath(sample.path)) score += 30;
  if (/\.png($|[?#])/i.test(sample.path)) score += 20;
  if (/strip[\s_-]*\d{1,2}/i.test(sample.path)) score += 28;
  if (/\b(idle|walk|run|attack|move|loop|death|coin|fire|vfx|impact|explosion)\b/i.test(text)) score += 18;
  if (sample.kind === "effect" || sample.kind === "icon") score += 8;
  if (/preview|sample|all free|all animations|all attacks/i.test(text)) score -= 24;
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

function selectFeaturedSounds(): LibrarySoundPreview[] {
  const soundSamples = catalog.soundCollections
    .filter((collection) => collection.samples.length > 0)
    .flatMap((collection) =>
      collection.samples.map((sample) => ({
        title: collection.title,
        label: sample.label,
        kind: sample.kind,
        category: collection.category,
        searchText: `${collection.title} ${collection.category} ${sample.kind} ${sample.label}`.toLowerCase(),
      })),
    );
  const picks = [
    soundSamples.find((sample) => /combat|impact|spell|explosion|hit/.test(sample.searchText)),
    soundSamples.find((sample) => /movement|footstep|jump|land/.test(sample.searchText)),
    soundSamples.find((sample) => /ui|coin|positive|click|menu/.test(sample.searchText)),
    catalog.musicTracks[0]
      ? {
          title: "Music",
          label: catalog.musicTracks[0].title,
          kind: "music",
          category: "music",
          searchText: "music",
        }
      : undefined,
  ].filter(Boolean) as LibrarySoundPreview[];

  const seen = new Set<string>();
  return picks.filter((sample) => {
    const key = `${sample.kind}:${sample.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const modelParam = firstParam(params?.model);
  const modelMotion = modelParam === "animated" || modelParam === "static" ? modelParam : "all";
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
          <LibraryHeroShowreel sprites={featuredSprites} sounds={featuredSounds} />
        </section>

        <nav className="asset-type-nav" aria-label="Asset library navigation">
          {navGroups.map((group) => (
            <details key={group.key} className="nav-drawer">
              <summary className="nav-trigger" data-active={group.key === "packs" ? "" : undefined}>
                <span>{group.label}</span>
                <span className="nav-chevron" aria-hidden="true" />
              </summary>
              <div className="nav-panel">
                {group.items.map((child) => (
                  <Link key={child.href} href={child.href}>
                    {child.label}
                  </Link>
                ))}
              </div>
            </details>
          ))}
          <span className="asset-nav-note">
            {totalModels.toLocaleString()} models · {textureGroupLabel} · {totalMediaCollections} media collections
          </span>
        </nav>

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
