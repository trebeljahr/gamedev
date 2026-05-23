import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArtWorkbench } from "@/components/MediaExplorer";
import { LicenseLink } from "@/components/LicenseLink";
import { SiteHeader } from "@/components/SiteHeader";
import { artPackHref, folderFromArtPackSlug } from "@/lib/art-routing";
import { artPackSummaries } from "@/lib/media";
import { pageMetadata } from "@/lib/seo";

type Art2DPackPageProps = {
  params: Promise<{ pack: string }>;
};

function summaryForSlug(slug: string) {
  const folder = folderFromArtPackSlug(slug);
  return artPackSummaries.find((pack) => pack.folder === folder);
}

export async function generateMetadata({ params }: Art2DPackPageProps): Promise<Metadata> {
  const { pack: slug } = await params;
  const summary = summaryForSlug(slug);
  if (!summary) notFound();
  return pageMetadata({
    title: `${summary.title} 2D Asset Pack`,
    description: `${summary.description} Browse ${summary.materialSampleCount.toLocaleString("en-US")} assets with source and license context.`,
    pathname: artPackHref(summary.folder),
  });
}

export default async function Art2DPackPage({ params }: Art2DPackPageProps) {
  const { pack: slug } = await params;
  const summary = summaryForSlug(slug);
  if (!summary) notFound();

  const related = artPackSummaries
    .filter((pack) => pack.folder !== summary.folder && (pack.author === summary.author || pack.theme === summary.theme))
    .sort((a, b) => {
      const aScore = a.author === summary.author ? 0 : 1;
      const bScore = b.author === summary.author ? 0 : 1;
      return aScore - bScore || a.title.localeCompare(b.title);
    })
    .slice(0, 12);

  return (
    <div className="media-page">
      <SiteHeader
        active="art"
        meta={
          <>
            2D pack · {summary.materialSampleCount} assets · {summary.author}
          </>
        }
      />

      <section className="media-hero">
        <div>
          <div className="landing-kicker">2D Asset Pack</div>
          <h2>{summary.title}</h2>
        </div>
        <nav className="asset-section-nav top-nav" aria-label="2D navigation">
          <Link href="/media?view=art&type=all">All 2D</Link>
          <Link href="/media?view=art&type=ui-icons">UI / Icons</Link>
          <Link href="/media?view=art&type=spritesheets">Spritesheets</Link>
        </nav>
      </section>

      <div className="media-single-column">
        <ArtWorkbench summary={summary} />

        {related.length > 0 && (
          <section className="media-panel">
            <div className="panel-heading">
              <h3>Related packs</h3>
              <span>{related.length}</span>
            </div>
            <div className="art-card-grid">
              {related.map((pack) => (
                <article className="art-card" key={pack.folder}>
                  <Link className="art-card-link" href={artPackHref(pack.folder)}>
                    <div className="art-thumb">
                      {pack.preview ? (
                        <img src={pack.preview.src} alt={pack.title} loading="lazy" decoding="async" />
                      ) : (
                        <span>{pack.title.slice(0, 2).toUpperCase()}</span>
                      )}
                    </div>
                    <div className="art-card-body">
                      <strong>{pack.title}</strong>
                      <span>{pack.theme}</span>
                      <small>{pack.materialSampleCount} assets</small>
                    </div>
                  </Link>
                  <div className="art-card-credit">
                    <div>
                      <span>Creator</span>
                      <strong>{pack.author}</strong>
                    </div>
                    <div>
                      <span>License</span>
                      <LicenseLink
                        license={pack.license_class}
                        fallbackUrl={pack.url}
                        title={pack.license_class}
                      />
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
