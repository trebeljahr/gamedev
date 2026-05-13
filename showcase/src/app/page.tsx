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
          <Link className="asset-type-link primary" href="#3d-packs">
            <span>3D</span>
            <strong>{totalModels.toLocaleString()} models</strong>
            <small>{manifest.packs.length} packs grouped by vendor</small>
          </Link>
          <Link className="asset-type-link" href="/media?view=art">
            <span>2D</span>
            <strong>{mediaStats.artPackCount} art packs</strong>
            <small>Filter by theme, creator, and license</small>
          </Link>
          <Link className="asset-type-link" href="/media?view=sounds">
            <span>Sounds</span>
            <strong>
              {mediaStats.soundCollectionCount} groups · {mediaStats.musicTrackCount} tracks
            </strong>
            <small>Preview sound effects and music</small>
          </Link>
          <Link className="asset-type-link" href="/media?view=sources">
            <span>Sources</span>
            <strong>{mediaStats.sourceMappingCount} mappings</strong>
            <small>Search textures, path groups, licenses, and origins</small>
          </Link>
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
