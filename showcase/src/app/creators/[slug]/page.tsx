import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CreatorAssetList } from "@/components/CreatorAssetList";
import { SiteHeader } from "@/components/SiteHeader";
import { getCreatorPageData, getCreatorSlugs } from "@/lib/creator-pages";
import { pageMetadata } from "@/lib/seo";

type CreatorPageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return getCreatorSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: CreatorPageProps): Promise<Metadata> {
  const { slug } = await params;
  if (!getCreatorSlugs().includes(slug)) notFound();
  const data = getCreatorPageData(slug);

  return pageMetadata({
    title: `${data.metadata.name} Game Assets`,
    description: `Browse ${data.assets.length.toLocaleString("en-US")} game assets by ${data.metadata.name}, with source links and license notes.`,
    pathname: `/creators/${slug}`,
  });
}

export default async function CreatorPage({ params }: CreatorPageProps) {
  const { slug } = await params;
  const slugs = getCreatorSlugs();
  if (!slugs.includes(slug)) notFound();
  const data = getCreatorPageData(slug);
  const { metadata, counts } = data;
  const supportUrl = metadata.patreonUrl ?? metadata.tipUrl;

  return (
    <div className="creator-page">
      <SiteHeader active="packs" meta={`${data.assets.length.toLocaleString("en-US")} credited assets`} />

      <main>
        <section className="creator-hero" aria-labelledby="creator-heading">
          <div>
            <div className="landing-kicker">Creator</div>
            <h1 id="creator-heading">{metadata.name}</h1>
            <p>
              Catalog assets credited to {metadata.name}, grouped with thumbnails where the local catalog has a
              preview and license context kept visible.
            </p>
            <div className="creator-stat-grid">
              <div>
                <span>3D models</span>
                <strong>{counts.models.toLocaleString("en-US")}</strong>
              </div>
              <div>
                <span>2D / audio</span>
                <strong>{(counts.art + counts.audio).toLocaleString("en-US")}</strong>
              </div>
              <div>
                <span>Source maps</span>
                <strong>{counts.source.toLocaleString("en-US")}</strong>
              </div>
            </div>
          </div>

          <aside className="creator-link-panel" aria-label={`${metadata.name} links`}>
            <h2>Upstream</h2>
            <a href={metadata.upstreamUrl} target="_blank" rel="noreferrer">
              <span>Source site</span>
              <strong>{metadata.upstreamUrl}</strong>
            </a>
            {supportUrl && (
              <a href={supportUrl} target="_blank" rel="noreferrer">
                <span>{metadata.patreonUrl ? "Patreon" : "Tip jar"}</span>
                <strong>{supportUrl}</strong>
              </a>
            )}
            {metadata.notes && <p>{metadata.notes}</p>}
          </aside>
        </section>

        <section className="creator-pack-section">
          <div className="creator-pack-heading">
            <div>
              <div className="landing-kicker">Assets</div>
              <h2>{data.assets.length.toLocaleString("en-US")} credited entries</h2>
            </div>
            <Link href="/models">All models</Link>
          </div>
        </section>

        <CreatorAssetList assets={data.assets} creatorSlug={metadata.slug} />
      </main>
    </div>
  );
}
