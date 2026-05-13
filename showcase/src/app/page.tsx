import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { manifest } from "@/lib/manifest";
import { catalog, mediaStats, sourceMappings } from "@/lib/media";
import { CatalogSearch } from "@/components/CatalogSearch";

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
              3D models, 2D sprites, textures, icons, sound effects, and music
              each get their own searchable asset entry.
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
          <section className="asset-type-link primary" aria-labelledby="nav-3d">
            <Link className="asset-type-main" href="/models">
              <span>3D Models</span>
              <strong id="nav-3d">{totalModels.toLocaleString()} models</strong>
              <small>Flat asset search with creator, license, and pack context visible</small>
            </Link>
            <div className="asset-subnav" aria-label="3D creators">
              <Link href="/models">All models</Link>
              <Link href="#3d-collections">Pack collections</Link>
              <Link href="#creator-kaykit">KayKit</Link>
              <Link href="#creator-kenney">Kenney</Link>
              <Link href="#creator-quaternius">Quaternius</Link>
            </div>
          </section>
          <section className="asset-type-link" aria-labelledby="nav-sprites">
            <Link className="asset-type-main" href="/media?view=art&type=all">
              <span>2D Art</span>
              <strong id="nav-sprites">{mediaStats.artPackCount} packs</strong>
              <small>Spritesheets, characters, tiles, FX, icons, and UI art in one search</small>
            </Link>
            <div className="asset-subnav" aria-label="2D sprite categories">
              <Link href="/media?view=art&type=all">All 2D</Link>
              <Link href="/media?view=art&type=spritesheets">Sprites</Link>
              <Link href="/media?view=art&type=ui-icons">UI / Icons</Link>
              <Link href="/media?view=art&type=spritesheets&subject=characters&motion=animated">Animated characters</Link>
              <Link href="/media?view=art&type=spritesheets&subject=environments">Environments</Link>
            </div>
          </section>
          <section className="asset-type-link" aria-labelledby="nav-textures">
            <Link className="asset-type-main" href="/media?view=textures">
              <span>Textures</span>
              <strong id="nav-textures">{textureSourceCount || 1} groups</strong>
              <small>Material and surface sets kept separate from sprites</small>
            </Link>
            <div className="asset-subnav" aria-label="Texture categories">
              <Link href="/media?view=textures">Texture library</Link>
            </div>
          </section>
          <section className="asset-type-link" aria-labelledby="nav-icons">
            <Link className="asset-type-main" href="/media?view=art&type=ui-icons">
              <span>Icons & UI</span>
              <strong id="nav-icons">{iconPackCount} packs</strong>
              <small>Icons, controls, buttons, GUI sheets, pickups, and item art</small>
            </Link>
            <div className="asset-subnav" aria-label="Icon and UI categories">
              <Link href="/media?view=art&type=ui-icons">UI / Icons</Link>
            </div>
          </section>
          <section className="asset-type-link" aria-labelledby="nav-sfx">
            <Link className="asset-type-main" href="/media?view=sounds&type=all">
              <span>Sounds</span>
              <strong id="nav-sfx">{mediaStats.soundCollectionCount + mediaStats.musicTrackCount} items</strong>
              <small>Sound effects and music tracks together in one searchable page</small>
            </Link>
            <div className="asset-subnav" aria-label="Sound effect categories">
              <Link href="/media?view=sounds&type=all">All sounds</Link>
              <Link href="/media?view=sounds&type=sfx">Browse SFX</Link>
              <Link href="/media?view=sounds&type=music">Music</Link>
            </div>
          </section>
          <section className="asset-type-link" aria-labelledby="nav-music">
            <Link className="asset-type-main" href="/media?view=sounds&type=music">
              <span>Music</span>
              <strong id="nav-music">{mediaStats.musicTrackCount} tracks</strong>
              <small>Playable loops, ambient beds, and credited background music</small>
            </Link>
            <div className="asset-subnav" aria-label="Music categories">
              <Link href="/media?view=sounds&type=music">Play music</Link>
            </div>
          </section>
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
