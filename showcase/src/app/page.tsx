import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { manifest } from "@/lib/manifest";
import { catalog, mediaStats, sourceMappings } from "@/lib/media";
import { CatalogSearch } from "@/components/CatalogSearch";
import { navGroups } from "@/lib/navigation";

type HomePageProps = {
  searchParams?: Promise<{
    model?: string | string[];
  }>;
};

const LANDING_ASSET_BASE_URL = (
  process.env.NEXT_PUBLIC_LANDING_ASSETS_BASE_URL ?? "https://assets.gamedev.trebeljahr.com"
).replace(/\/+$/, "");

function assetUrl(src: string) {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(src)) return src;
  return `${LANDING_ASSET_BASE_URL}${src.startsWith("/") ? src : `/${src}`}`;
}

const featuredArt = catalog.artPacks
  .filter((pack) => pack.samples.length > 0)
  .slice(0, 6)
  .map((pack) => ({
    title: pack.title,
    theme: pack.theme,
    src: assetUrl(pack.samples[0].src),
  }));

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const modelParam = firstParam(params?.model);
  const modelMotion = modelParam === "animated" || modelParam === "static" ? modelParam : "all";
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
              3D models and textures, 2D sprites and icons, sound effects, and music
              share the same compact navigation.
            </p>
            <div className="library-actions" aria-label="Primary catalog actions">
              <Link className="landing-button primary" href="/models">
                Search every model
              </Link>
              <Link className="landing-button secondary" href="#3d-collections">
                Browse pack collections
              </Link>
            </div>
          </div>
          <div className="library-visual" aria-hidden="true">
            {featuredArt.map((item, index) => (
              <figure key={`${item.title}-${index}`} className="library-art">
                <img src={item.src} alt="" />
                <figcaption>{item.theme}</figcaption>
              </figure>
            ))}
          </div>
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
            <div className="landing-kicker">Secondary context</div>
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
