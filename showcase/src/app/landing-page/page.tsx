import type { Metadata } from "next";
import Link from "next/link";
import {
  LandingModelBackdrop,
  type LandingModelPreviewItem,
} from "@/components/LandingModelBackdrop";
import { manifest } from "@/lib/manifest";
import { catalog, mediaStats } from "@/lib/media";

export const metadata: Metadata = {
  title: "GameDev Asset Library",
  description:
    "Browse a curated, one-stop catalog of free community-made game assets with previews, source links, and credits.",
};

const LANDING_ASSET_BASE_URL = (
  process.env.NEXT_PUBLIC_LANDING_ASSETS_BASE_URL ?? "https://assets.gamedev.trebeljahr.com"
).replace(/\/+$/, "");
const GITHUB_URL = "https://github.com/trebeljahr/gamedev";
const CREDITS_URL = `${GITHUB_URL}/blob/main/CREDITS.md`;

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

const modelPicks = [
  {
    packId: "quaternius/spaceships-by-quaternius",
    name: "Spaceship3",
    variant: "ship",
    position: [0.6, 0.92, -0.3],
    rotation: [-0.1, -0.75, 0.1],
    scale: 0.22,
  },
  {
    packId: "kaykit/medieval-builder-pack",
    name: "castle",
    variant: "castle",
    position: [-1.5, -0.68, -0.2],
    rotation: [0, 0.52, 0],
    scale: 0.86,
  },
  {
    packId: "quaternius/animated-robot-oct-2018",
    name: "Robot",
    variant: "robot",
    position: [1.78, -0.72, 0.55],
    rotation: [0, -0.35, 0],
    scale: 0.32,
  },
] satisfies Array<{
  packId: string;
  name: string;
  variant: LandingModelPreviewItem["variant"];
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
}>;

const featuredModels: LandingModelPreviewItem[] = modelPicks.flatMap((pick) => {
  const pack = manifest.packs.find((item) => item.id === pick.packId);
  const model = pack?.models.find((item) => item.name === pick.name);
  if (!model) return [];

  return {
    label: model.label,
    variant: pick.variant,
    position: pick.position,
    rotation: pick.rotation,
    scale: pick.scale,
  };
});

const workflow = [
  {
    step: "Discover",
    title: "Browse by intent",
    text: "Search across individual models, sprites, textures, sounds, and music without knowing which creator folder to open first.",
  },
  {
    step: "Preview",
    title: "Look before downloading",
    text: "Open a single 3D model, scan sprite sheets, audition sounds, and compare options in the browser.",
  },
  {
    step: "Credit",
    title: "Follow the source",
    text: "Original creator links, license notes, and source mappings stay close so attribution is easier later.",
  },
];

const sourceCredits = [
  { label: "Kenney", href: "https://kenney.nl/" },
  { label: "Quaternius", href: "https://quaternius.com/" },
  { label: "KayKit", href: "https://kaylousberg.com/" },
  { label: "Poly Pizza", href: "https://poly.pizza/" },
  { label: "itch.io creators", href: "https://itch.io/game-assets/free" },
  { label: "Poly Haven", href: "https://polyhaven.com/" },
  { label: "Freesound", href: "https://freesound.org/" },
  { label: "Pixabay", href: "https://pixabay.com/" },
  { label: "Kevin MacLeod / incompetech", href: "https://incompetech.com/" },
  { label: "Mixamo", href: "https://www.mixamo.com/" },
  { label: "CMU Mocap", href: "http://mocap.cs.cmu.edu/" },
  { label: "Sketchfab artists", href: "https://sketchfab.com/" },
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
          <LandingModelBackdrop models={featuredModels} />
          <div className="landing-image-field">
            {featuredArt.map((item, index) => (
              <figure key={`${item.title}-${index}`} className={`landing-art art-${index + 1}`}>
                <img src={item.src} alt="" />
                <figcaption>{item.theme}</figcaption>
              </figure>
            ))}
          </div>
        </div>
        <nav className="landing-orbit" aria-label="Asset shortcuts">
          <Link href="/#3d-packs">3D</Link>
          <Link href="/media?view=art">2D</Link>
          <Link href="/media?view=sounds">Sounds</Link>
        </nav>

        <div className="landing-hero-copy">
          <Link className="landing-brand" href="/">
            GameDev Asset Library
          </Link>
          <h1 id="landing-title">Free community-made game assets, gathered into one browser.</h1>
          <p>
            A one-stop catalog of models, sprites, textures, sound effects, and music made by
            other people in the game-dev community. I pre-selected the things I found and liked,
            then organized them for quick browsing, previewing, and credit checking.
          </p>
          <div className="landing-actions" aria-label="Primary actions">
            <Link className="landing-button primary" href="/">
              Browse library
            </Link>
            <a className="landing-button secondary" href={CREDITS_URL} target="_blank" rel="noreferrer">
              View credits
            </a>
            <a className="landing-button secondary" href={GITHUB_URL} target="_blank" rel="noreferrer">
              GitHub
            </a>
          </div>
        </div>

        <dl className="landing-stats" aria-label="Library stats">
          <div>
            <dt>{totalModels.toLocaleString()}</dt>
            <dd>3D models</dd>
          </div>
          <div>
            <dt>{mediaStats.artPackCount}</dt>
            <dd>2D sets</dd>
          </div>
          <div>
            <dt>{totalCollections}</dt>
            <dd>media collections</dd>
          </div>
        </dl>
      </section>

      <section className="landing-proof" aria-labelledby="proof-title">
        <div>
          <p className="landing-kicker">What this is</p>
          <h2 id="proof-title">A curated doorway into free assets from the wider community.</h2>
        </div>
        <p>
          Not a marketplace, not a claim of authorship, and not a replacement for each creator's
          source page. This is a convenience layer: assets I liked, grouped so you can explore
          them fast and then follow the credits back to the original people and places.
        </p>
      </section>

      <section className="landing-showcase" aria-label="Library coverage">
        <div className="landing-showcase-text">
          <p className="landing-kicker">Coverage</p>
          <h2>One doorway for models, sprites, sounds, and credits.</h2>
          <Link href="/media">Explore media catalog</Link>
        </div>
        <div className="landing-coverage" aria-label="Asset coverage summary">
          <div>
            <strong>{manifest.packs.length}</strong>
            <span>3D collections</span>
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
        <h2 id="workflow-title">Built for quick creative rummaging.</h2>
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

      <section className="landing-credits" aria-labelledby="credits-title">
        <div>
          <p className="landing-kicker">Sources & credits</p>
          <h2 id="credits-title">Everything here points back to the people who made it.</h2>
        </div>
        <div className="landing-credit-copy">
          <p>
            The library pulls from free community asset sources and creator pages, with licenses
            tracked as closely as the archive allows. Always check the original source before
            shipping, especially for Sketchfab and Freesound items where terms can vary per asset.
          </p>
          <div className="landing-credit-links" aria-label="Asset sources">
            {sourceCredits.map((source) => (
              <a key={source.label} href={source.href} target="_blank" rel="noreferrer">
                {source.label}
              </a>
            ))}
          </div>
          <a className="landing-inline-link" href={CREDITS_URL} target="_blank" rel="noreferrer">
            Open the full credits and license notes
          </a>
        </div>
      </section>

      <section className="landing-final" aria-labelledby="final-title">
        <div>
          <p className="landing-kicker">Start browsing</p>
          <h2 id="final-title">Open the one-stop shop and find something worth building around.</h2>
        </div>
        <Link className="landing-button primary" href="/">
          Enter library
        </Link>
      </section>

      <footer className="landing-footer">
        <div>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer">
            GitHub
          </a>
          <span aria-hidden="true">/</span>
          <a href={CREDITS_URL} target="_blank" rel="noreferrer">
            Credits
          </a>
        </div>
        <p>
          Built with{" "}
          <svg
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="landing-heart"
          >
            <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 0 1-.383-.218 25.18 25.18 0 0 1-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0 1 12 5.052 5.5 5.5 0 0 1 16.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 0 1-4.244 3.17 15.247 15.247 0 0 1-.383.219l-.022.012-.007.004-.003.001a.752.752 0 0 1-.704 0l-.003-.001z" />
          </svg>{" "}
          by{" "}
          <a href="https://portfolio.trebeljahr.com" target="_blank" rel="noreferrer">
            Rico Trebeljahr
          </a>
          .
        </p>
      </footer>
    </main>
  );
}
