import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { manifest } from "@/lib/manifest";
import { catalog, mediaStats } from "@/lib/media";
import { CatalogSearch } from "@/components/CatalogSearch";

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

export default function HomePage() {
  const totalModels = manifest.packs.reduce((n, p) => n + p.count, 0);
  const totalMediaCollections =
    mediaStats.soundCollectionCount + mediaStats.musicTrackCount + mediaStats.artPackCount;

  return (
    <>
      <SiteHeader
        meta={
          <>
            {manifest.packs.length} 3D packs · {totalModels.toLocaleString()} models ·{" "}
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
              3D models, pixel art, sound effects, music, licenses, and source links
              share one catalog language.
            </p>
            <div className="library-actions" aria-label="Primary catalog actions">
              <Link className="landing-button primary" href="#3d-packs">
                Browse 3D packs
              </Link>
              <Link className="landing-button secondary" href="/media?view=art">
                Explore 2D and audio
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
            <Link className="asset-type-main" href="#3d-packs">
              <span>3D</span>
              <strong id="nav-3d">{totalModels.toLocaleString()} models</strong>
              <small>{manifest.packs.length} packs grouped by creator</small>
            </Link>
            <div className="asset-subnav" aria-label="3D creators">
              <Link href="#creator-kaykit">KayKit</Link>
              <Link href="#creator-kenney">Kenney</Link>
              <Link href="#creator-quaternius">Quaternius</Link>
            </div>
          </section>
          <section className="asset-type-link" aria-labelledby="nav-2d">
            <Link className="asset-type-main" href="/media?view=art">
              <span>2D</span>
              <strong id="nav-2d">{mediaStats.artPackCount} art packs</strong>
              <small>UI, icons, spritesheets, characters, environments, and effects</small>
            </Link>
            <div className="asset-subnav" aria-label="2D categories">
              <Link href="/media?view=art&type=ui-icons">UI / Icons</Link>
              <Link href="/media?view=art&type=spritesheets&subject=characters&motion=animated">Animated characters</Link>
              <Link href="/media?view=art&type=spritesheets&subject=environments">Environments</Link>
            </div>
          </section>
          <section className="asset-type-link" aria-labelledby="nav-sounds">
            <Link className="asset-type-main" href="/media?view=sounds">
              <span>Sounds</span>
              <strong id="nav-sounds">
                {mediaStats.soundCollectionCount} groups · {mediaStats.musicTrackCount} tracks
              </strong>
              <small>Music separated from sound effects, with category filters</small>
            </Link>
            <div className="asset-subnav" aria-label="Sound categories">
              <Link href="/media?view=sounds&type=sfx">Sound effects</Link>
              <Link href="/media?view=sounds&type=music">Music</Link>
              <Link href="/media?view=sounds&type=all">All audio</Link>
            </div>
          </section>
        </nav>

        <section className="catalog-heading" id="3d-packs" aria-labelledby="packs-heading">
          <div>
            <div className="landing-kicker">3D catalog</div>
            <h2 id="packs-heading">Model packs</h2>
          </div>
          <Link href="/all">Open all-model viewer</Link>
        </section>

        <CatalogSearch manifest={manifest} showHeader={false} />
      </main>
    </>
  );
}
