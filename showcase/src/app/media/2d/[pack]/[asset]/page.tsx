import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArtItemThumb, ArtItemViewer } from "@/components/ArtItemMedia";
import { LicenseLink } from "@/components/LicenseLink";
import { SiteHeader } from "@/components/SiteHeader";
import { artItemHref, artPackHref, folderFromArtPackSlug } from "@/lib/art-routing";
import { packArtItems, type ArtItem } from "@/lib/art-items";
import { brokenAssetIssueUrl } from "@/lib/github-issue";
import { assetUrl } from "@/lib/manifest";
import { artPackSummaries, findArtPack } from "@/lib/media";
import { pageMetadata } from "@/lib/seo";

type Art2DAssetPageProps = {
  params: Promise<{ pack: string; asset: string }>;
};

function resolve(slug: string, assetId: string) {
  const folder = folderFromArtPackSlug(slug);
  const summary = artPackSummaries.find((pack) => pack.folder === folder);
  const pack = findArtPack(folder);
  if (!summary || !pack) return undefined;
  const items = packArtItems(pack);
  const item = items.find((candidate) => candidate.id === assetId);
  if (!item) return undefined;
  return { folder, summary, items, item };
}

export async function generateMetadata({ params }: Art2DAssetPageProps): Promise<Metadata> {
  const { pack: slug, asset } = await params;
  const found = resolve(slug, asset);
  if (!found) notFound();
  const { summary, item } = found;
  return pageMetadata({
    title: `${item.label} — ${summary.title} 2D Asset`,
    description: `${item.label} is a ${item.animated ? "animated " : ""}2D ${item.kind} from ${summary.title} by ${summary.author}. ${summary.license_class} license.`,
    pathname: artItemHref(summary.folder, item.id),
  });
}

export default async function Art2DAssetPage({ params }: Art2DAssetPageProps) {
  const { pack: slug, asset } = await params;
  const found = resolve(slug, asset);
  if (!found) notFound();
  const { summary, items, item } = found;

  const viewerSequence = item.sequenceSrcs?.map(assetUrl);
  const related = items
    .filter((candidate) => candidate.id !== item.id)
    .slice(0, 24)
    .map((candidate: ArtItem) => ({
      id: candidate.id,
      label: candidate.label,
      src: assetUrl(candidate.src),
      href: artItemHref(summary.folder, candidate.id),
    }));

  const reportUrl = brokenAssetIssueUrl({
    id: item.primaryPath,
    name: `${item.label} (${summary.title})`,
    kind: "sprite",
    license: summary.license_class,
    sourceUrl: summary.url,
    catalogPath: artItemHref(summary.folder, item.id),
  });

  return (
    <div className="media-page">
      <SiteHeader
        active="art"
        meta={
          <>
            2D asset · {summary.title} · {summary.author}
          </>
        }
      />

      <section className="media-hero">
        <div>
          <div className="landing-kicker">2D Asset</div>
          <h2>{item.label}</h2>
          <p className="workbench-description">
            Part of{" "}
            <Link href={artPackHref(summary.folder)}>{summary.title}</Link> by {summary.author}
          </p>
        </div>
        <nav className="asset-section-nav top-nav" aria-label="2D navigation">
          <Link href={artPackHref(summary.folder)}>Back to pack</Link>
          <Link href="/media?view=art&type=all">All 2D</Link>
        </nav>
      </section>

      <div className="art-detail-layout">
        <section className="media-panel">
          <ArtItemViewer src={assetUrl(item.src)} label={item.label} sequenceSrcs={viewerSequence} />
          <div className="workbench-credit-grid">
            <div>
              <span>Pack</span>
              <Link href={artPackHref(summary.folder)}>{summary.title}</Link>
            </div>
            <div>
              <span>Creator</span>
              {summary.author_url ? (
                <a href={summary.author_url} target="_blank" rel="noreferrer">
                  {summary.author}
                </a>
              ) : (
                <strong>{summary.author}</strong>
              )}
            </div>
            <div>
              <span>License</span>
              <LicenseLink license={summary.license_class} fallbackUrl={summary.url} title={summary.license_class} />
            </div>
            <div>
              <span>Type</span>
              <strong>
                {item.kind}
                {item.animated ? " · animated" : ""}
                {item.sequenceSrcs ? ` · ${item.sequenceSrcs.length} frames` : ""}
              </strong>
            </div>
            {summary.url && (
              <a className="source-link" href={summary.url} target="_blank" rel="noreferrer">
                Source pack
              </a>
            )}
            <a className="source-link" href={reportUrl} target="_blank" rel="noreferrer">
              Report broken asset
            </a>
          </div>
        </section>

        {related.length > 0 && (
          <section className="media-panel">
            <div className="panel-heading">
              <h3>Related in this pack</h3>
              <span>{related.length}</span>
            </div>
            <div className="art-item-grid">
              {related.map((candidate) => (
                <Link className="art-item-card" key={candidate.id} href={candidate.href}>
                  <div className="art-thumb">
                    <ArtItemThumb src={candidate.src} label={candidate.label} />
                  </div>
                  <strong>{candidate.label}</strong>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
