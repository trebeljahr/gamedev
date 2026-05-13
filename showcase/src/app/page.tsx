import Link from "next/link";
import { manifest } from "@/lib/manifest";
import { mediaStats } from "@/lib/media";
import { CatalogSearch } from "@/components/CatalogSearch";

export default function HomePage() {
  const totalModels = manifest.packs.reduce((n, p) => n + p.count, 0);
  const totalMediaCollections =
    mediaStats.soundCollectionCount + mediaStats.musicTrackCount + mediaStats.artPackCount;

  return (
    <>
      <header className="app-header">
        <h1>3D Assets Showcase</h1>
        <div className="meta">
          {manifest.packs.length} 3D packs · {totalModels.toLocaleString()} models ·{" "}
          {totalMediaCollections} media collections
        </div>
      </header>

      <main>
        <section className="library-hero" aria-labelledby="library-heading">
          <div>
            <div className="vendor-tag">Asset library</div>
            <h2 id="library-heading">Browse by asset type</h2>
            <p>
              3D models, 2D art, and sounds now sit at the same level so each
              library is one obvious step from the front page.
            </p>
          </div>
          <Link className="all-link" href="/all">
            Walk through every 3D model
          </Link>
        </section>

        <nav className="asset-type-nav" aria-label="Asset type navigation">
          <article className="asset-type-link primary">
            <span>3D</span>
            <strong>{totalModels.toLocaleString()} models</strong>
            <small>{manifest.packs.length} packs grouped by creator</small>
            <div className="asset-subnav" aria-label="3D creators">
              <Link href="#creator-kaykit">KayKit</Link>
              <Link href="#creator-kenney">Kenney</Link>
              <Link href="#creator-quaternius">Quaternius</Link>
            </div>
          </article>
          <article className="asset-type-link">
            <span>2D</span>
            <strong>{mediaStats.artPackCount} art packs</strong>
            <small>UI / Icons, then spritesheets by subject and motion</small>
            <div className="asset-subnav" aria-label="2D categories">
              <Link href="/media?view=art&type=ui-icons">UI / Icons</Link>
              <Link href="/media?view=art&type=spritesheets&subject=characters&motion=animated">Animated characters</Link>
              <Link href="/media?view=art&type=spritesheets&subject=environments">Environments</Link>
            </div>
          </article>
          <article className="asset-type-link">
            <span>Sounds</span>
            <strong>
              {mediaStats.soundCollectionCount} groups · {mediaStats.musicTrackCount} tracks
            </strong>
            <small>Music separated from sound effects, with SFX category filters</small>
            <div className="asset-subnav" aria-label="Sound categories">
              <Link href="/media?view=sounds&type=sfx">Sound effects</Link>
              <Link href="/media?view=sounds&type=music">Music</Link>
              <Link href="/media?view=sounds&type=sfx">Search SFX</Link>
            </div>
          </article>
        </nav>

        <section className="catalog-heading" id="3d-packs" aria-labelledby="packs-heading">
          <div>
            <div className="vendor-tag">3D catalog</div>
            <h2 id="packs-heading">Model packs</h2>
          </div>
          <Link href="/all">Open all-model viewer</Link>
        </section>

        <CatalogSearch manifest={manifest} showHeader={false} />
      </main>
    </>
  );
}
