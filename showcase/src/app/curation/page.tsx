import Link from "next/link";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { suggestPackIssueUrl } from "@/lib/github-issue";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Curation Criteria for Hand-Picked Game Assets",
  description:
    "How the GameDev Asset Library decides which free game assets qualify for inclusion, rejection, and follow-up review.",
  pathname: "/curation",
});

const inclusionCriteria = [
  {
    title: "Permissive license required",
    body:
      "Assets need a clear license that allows reuse in games, including commercial projects. Attribution-required licenses can qualify when the creator, source, and license terms can be surfaced beside the download.",
  },
  {
    title: "Quality threshold",
    body:
      "Each pack should be useful in a prototype without heavy repair: coherent style, source traceability, working previews, sane naming, and enough production value to save a developer time.",
  },
  {
    title: "Format availability",
    body:
      "Catalog entries need usable downloadable formats. For 3D, browser-friendly GLB or glTF is preferred alongside source formats; for 2D and audio, files must be inspectable and usable outside a single locked toolchain.",
  },
] as const;

const rejectionCriteria = [
  {
    title: "NSFW or unsafe content",
    body:
      "Adult, exploitative, hateful, or otherwise unsafe material is excluded even when the license is technically usable.",
  },
  {
    title: "Non-permissive or unclear license",
    body:
      "Packs are rejected when the terms block game use, commercial use, modification, redistribution, or when the license trail cannot be verified.",
  },
  {
    title: "Broken source or downloads",
    body:
      "Dead links, corrupt archives, missing core files, unusable previews, or entries that cannot be downloaded reliably stay out until fixed.",
  },
  {
    title: "Duplicate material",
    body:
      "Mirrors, reuploads, and duplicate files are skipped when the original creator or an already indexed source covers the same asset better.",
  },
] as const;

export default function CurationPage() {
  const suggestPackUrl = suggestPackIssueUrl();

  return (
    <>
      <SiteHeader compact active="library" />
      <main className="curation-page">
        <section className="curation-hero" aria-labelledby="curation-heading">
          <div className="curation-hero-copy">
            <div className="landing-kicker">Curation criteria</div>
            <h2 id="curation-heading">Hand-picked means the catalog has rules.</h2>
            <p>
              GameDev Asset Library includes free assets only when they clear
              repeatable license, quality, and format checks. The goal is a
              smaller catalog that earns trust instead of a larger one that
              sends you back into cleanup work.
            </p>
            <div className="library-actions">
              <Link className="landing-button primary" href="/models">
                Browse catalog
              </Link>
              <Link className="landing-button secondary" href="/media?view=art&type=all">
                Search 2D and audio
              </Link>
              <a className="landing-button secondary" href={suggestPackUrl} target="_blank" rel="noreferrer">
                Suggest a pack
              </a>
            </div>
          </div>
          <ol className="curation-flow" aria-label="Curation workflow">
            <li>
              <span>01</span>
              <strong>License first</strong>
              <p>No clear permission, no listing.</p>
            </li>
            <li>
              <span>02</span>
              <strong>Usability check</strong>
              <p>Preview, download, inspect, and reject broken entries.</p>
            </li>
            <li>
              <span>03</span>
              <strong>Catalog with context</strong>
              <p>Keep source, creator, license, and formats visible.</p>
            </li>
          </ol>
        </section>

        <div className="curation-content">
          <section className="curation-section" aria-labelledby="included-heading">
            <div className="curation-section-heading">
              <span className="landing-kicker">Required for inclusion</span>
              <h2 id="included-heading">What has to be true</h2>
            </div>
            <div className="curation-rule-list">
              {inclusionCriteria.map((criterion) => (
                <article key={criterion.title}>
                  <h3>{criterion.title}</h3>
                  <p>{criterion.body}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="curation-section" aria-labelledby="rejected-heading">
            <div className="curation-section-heading">
              <span className="landing-kicker">Rejected from the catalog</span>
              <h2 id="rejected-heading">What stays out</h2>
            </div>
            <div className="curation-rule-list rejection">
              {rejectionCriteria.map((criterion) => (
                <article key={criterion.title}>
                  <h3>{criterion.title}</h3>
                  <p>{criterion.body}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="curation-section common-omissions" aria-labelledby="common-omissions-heading">
            <div className="curation-section-heading">
              <span className="landing-kicker">Post-launch feedback</span>
              <h2 id="common-omissions-heading">Common omissions</h2>
            </div>
            {/* <!-- TODO: Rico fills in with the 3–5 most-asked-about omissions once they emerge from launch feedback --> */}
            <p>
              This space is reserved for the assets people ask about most after
              launch, with a short note on whether each omission is licensing,
              quality, format, or backlog related.
            </p>
          </section>
        </div>
      </main>
    </>
  );
}
