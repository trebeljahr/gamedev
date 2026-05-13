import type { Metadata } from "next";
import Link from "next/link";
import { manifest } from "@/lib/manifest";
import { catalog, mediaStats } from "@/lib/media";

export const metadata: Metadata = {
  title: "GameDev Asset Library",
  description:
    "Search, preview, and download game-ready 3D models, pixel art, sound effects, and source metadata.",
};

const LANDING_ASSET_BASE_URL = (
  process.env.NEXT_PUBLIC_LANDING_ASSETS_BASE_URL ?? "https://assets.gamedev.trebeljahr.com"
).replace(/\/+$/, "");

function landingAssetUrl(src: string) {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(src)) return src;
  return `${LANDING_ASSET_BASE_URL}${src.startsWith("/") ? src : `/${src}`}`;
}

const featuredArt = catalog.artPacks
  .filter((pack) => pack.samples.length > 0)
  .slice(0, 8)
  .map((pack) => ({
    title: pack.title,
    theme: pack.theme,
    src: landingAssetUrl(pack.samples[0].src),
  }));

const workflow = [
  {
    step: "Search",
    title: "Start with intent",
    text: "Filter by theme, creator, license, asset type, and in-game use case.",
  },
  {
    step: "Preview",
    title: "Inspect in context",
    text: "Open 3D packs, scan sprite sheets, audition sounds, and compare candidates fast.",
  },
  {
    step: "Ship",
    title: "Keep provenance close",
    text: "Source links, license buckets, and raw path mappings stay beside the asset.",
  },
];

export default function LandingPage() {
  const totalModels = manifest.packs.reduce((n, pack) => n + pack.count, 0);
  const categories = new Set(manifest.packs.flatMap((pack) => pack.categories));
  const vendorCount = new Set(manifest.packs.map((pack) => pack.vendor)).size;
  const totalCollections =
    mediaStats.artPackCount + mediaStats.soundCollectionCount + mediaStats.musicTrackCount;

  return (
    <main className="landing-page">
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero-shade" />
        <div className="landing-visual" aria-hidden="true">
          <div className="landing-image-field">
            {featuredArt.map((item, index) => (
              <figure key={`${item.title}-${index}`} className={`landing-art art-${index + 1}`}>
                <img src={item.src} alt="" />
                <figcaption>{item.theme}</figcaption>
              </figure>
            ))}
          </div>
          <div className="landing-orbit">
            <span>3D</span>
            <span>2D</span>
            <span>SFX</span>
          </div>
        </div>

        <div className="landing-hero-copy">
          <Link className="landing-brand" href="/">
            GameDev Asset Library
          </Link>
          <h1 id="landing-title">Find game-ready assets without digging through folders.</h1>
          <p>
            A searchable showcase for 3D models, pixel art, sound effects, music, licenses,
            and source links in one place.
          </p>
          <div className="landing-actions" aria-label="Primary actions">
            <Link className="landing-button primary" href="/">
              Browse library
            </Link>
            <Link className="landing-button secondary" href="/all">
              View all 3D models
            </Link>
          </div>
        </div>

        <dl className="landing-stats" aria-label="Library stats">
          <div>
            <dt>{totalModels.toLocaleString()}</dt>
            <dd>3D models</dd>
          </div>
          <div>
            <dt>{mediaStats.artPackCount}</dt>
            <dd>2D packs</dd>
          </div>
          <div>
            <dt>{totalCollections}</dt>
            <dd>media collections</dd>
          </div>
        </dl>
      </section>

      <section className="landing-proof" aria-labelledby="proof-title">
        <div>
          <p className="landing-kicker">What it does</p>
          <h2 id="proof-title">Turns a mixed asset archive into a playable catalog.</h2>
        </div>
        <p>
          Jump from a broad idea to a previewable pack, then keep the boring but essential
          details, like source, license, and file path, attached to the decision.
        </p>
      </section>

      <section className="landing-showcase" aria-label="Library coverage">
        <div className="landing-showcase-text">
          <p className="landing-kicker">Coverage</p>
          <h2>One doorway for models, sprites, sounds, and attribution.</h2>
          <Link href="/media">Explore media catalog</Link>
        </div>
        <div className="landing-coverage" aria-label="Asset coverage summary">
          <div>
            <strong>{manifest.packs.length}</strong>
            <span>3D packs</span>
          </div>
          <div>
            <strong>{categories.size}</strong>
            <span>model categories</span>
          </div>
          <div>
            <strong>{mediaStats.soundSampleCount}</strong>
            <span>sound samples</span>
          </div>
          <div>
            <strong>{mediaStats.sourceMappingCount}</strong>
            <span>source mappings</span>
          </div>
          <div>
            <strong>{vendorCount}</strong>
            <span>3D vendors</span>
          </div>
          <div>
            <strong>{mediaStats.artSampleCount}</strong>
            <span>art previews</span>
          </div>
        </div>
      </section>

      <section className="landing-workflow" aria-labelledby="workflow-title">
        <p className="landing-kicker">Workflow</p>
        <h2 id="workflow-title">Built for quick creative triage.</h2>
        <div className="landing-steps">
          {workflow.map((item) => (
            <article key={item.step}>
              <span>{item.step}</span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-final" aria-labelledby="final-title">
        <div>
          <p className="landing-kicker">Start browsing</p>
          <h2 id="final-title">Open the catalog and pick something worth building around.</h2>
        </div>
        <Link className="landing-button primary" href="/">
          Enter library
        </Link>
      </section>
    </main>
  );
}
