import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { LicenseLink } from "@/components/LicenseLink";
import { MediaPackTrackList } from "@/components/MediaPackTrackList";
import { SiteHeader } from "@/components/SiteHeader";
import { findMediaPack, mediaPackHref, mediaPacks } from "@/lib/media";
import { pageMetadata } from "@/lib/seo";

type MediaPackPageProps = {
  params: Promise<{ pack: string }>;
};

export function generateStaticParams() {
  return mediaPacks.map((pack) => ({ pack: pack.slug }));
}

export async function generateMetadata({ params }: MediaPackPageProps): Promise<Metadata> {
  const { pack: slug } = await params;
  const pack = findMediaPack(slug);
  if (!pack) notFound();

  return pageMetadata({
    title: `${pack.title} ${pack.kind === "music" ? "Music" : "Sound"} Pack`,
    description: `${pack.description} Includes ${pack.itemCount.toLocaleString("en-US")} audio files.`,
    pathname: mediaPackHref(pack.kind, pack.id),
  });
}

export default async function MediaPackPage({ params }: MediaPackPageProps) {
  const { pack: slug } = await params;
  const pack = findMediaPack(slug);
  if (!pack) notFound();

  return (
    <div className="media-page">
      <SiteHeader
        active="sounds"
        meta={
          <>
            {pack.kind === "music" ? "Music pack" : "Sound pack"} · {pack.itemCount} files · {pack.source}
          </>
        }
      />

      <section className="media-hero">
        <div>
          <div className="landing-kicker">{pack.kind === "music" ? "Music Pack" : "Sound Pack"}</div>
          <h2>{pack.title}</h2>
        </div>
        <nav className="asset-section-nav top-nav" aria-label="Audio pack navigation">
          <Link href="/media?view=sounds&type=all">All sounds</Link>
          <Link href="/media?view=sounds&type=sfx">Sound effects</Link>
          <Link href="/media?view=sounds&type=music">Music</Link>
        </nav>
      </section>

      <div className="media-single-column">
        <section className="media-panel media-pack-panel">
          <div className="workbench-title">
            <div>
              <div className="vendor-tag">{pack.source}</div>
              <h3>{pack.title}</h3>
              <p className="workbench-description">{pack.description}</p>
            </div>
            <div className="workbench-credit-grid">
              <div>
                <span>License</span>
                <LicenseLink license={pack.license} source={pack.source} fallbackUrl={pack.url} />
              </div>
              <div>
                <span>Path</span>
                <strong>{pack.path}</strong>
              </div>
              {pack.url && (
                <a className="source-link" href={pack.url} target="_blank" rel="noreferrer">
                  Source pack
                </a>
              )}
              <small>{pack.itemCount} audio files</small>
            </div>
          </div>

          {pack.notes && <p className="media-pack-notes">{pack.notes}</p>}

          <MediaPackTrackList pack={pack} />
        </section>
      </div>
    </div>
  );
}
