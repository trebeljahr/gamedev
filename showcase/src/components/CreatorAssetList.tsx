"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { InfiniteListSentinel, useInfiniteList } from "@/components/useInfiniteList";
import { LicenseLink } from "@/components/LicenseLink";
import type { CreatorAsset } from "@/lib/creator-pages";

const PackCardPreview = dynamic(
  () => import("@/components/PackCardPreview").then((module) => module.PackCardPreview),
  { ssr: false },
);

const PAGE_SIZE = 96;

function kindLabel(kind: CreatorAsset["kind"]): string {
  if (kind === "model") return "3D model";
  if (kind === "art") return "2D art pack";
  if (kind === "audio") return "Audio pack";
  return "Source mapping";
}

function AssetPreview({ asset }: { asset: CreatorAsset }) {
  if (asset.modelFile) {
    return <PackCardPreview modelFiles={[asset.modelFile]} label={asset.title} />;
  }

  if (asset.thumbnailSrc) {
    // Catalog thumbnails may point at generated local asset paths or an external asset host.
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="creator-asset-image" src={asset.thumbnailSrc} alt="" loading="lazy" />;
  }

  return (
    <div className="creator-asset-empty-preview" aria-hidden="true">
      {asset.kind === "audio" ? "Audio" : "Source"}
    </div>
  );
}

export function CreatorAssetList({
  assets,
  creatorSlug,
}: {
  assets: CreatorAsset[];
  creatorSlug: string;
}) {
  const infinite = useInfiniteList({
    total: assets.length,
    pageSize: PAGE_SIZE,
    resetKey: creatorSlug,
  });
  const visibleAssets = assets.slice(0, infinite.visibleCount);

  return (
    <section className="model-results creator-asset-results" aria-label="Creator assets">
      {visibleAssets.map((asset) => (
        <article className="model-card creator-asset-card" key={asset.id}>
          <div className="model-card-preview">
            <AssetPreview asset={asset} />
          </div>
          <div className="model-card-main">
            <div className="model-card-kicker">
              <span>{kindLabel(asset.kind)}</span>
              <LicenseLink
                license={asset.license}
                source={asset.subtitle}
                fallbackUrl={asset.licenseUrl}
                className="model-license-link"
                fallbackElement="span"
              />
            </div>
            <h3>{asset.title}</h3>
            <div className="model-tags">
              {asset.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
            <div className="model-card-actions">
              {asset.href && <Link href={asset.href}>Open asset</Link>}
              {asset.sourceUrl && (
                <a href={asset.sourceUrl} target="_blank" rel="noreferrer">
                  Source
                </a>
              )}
            </div>
          </div>
          <dl className="model-metadata">
            <div>
              <dt>Collection</dt>
              <dd title={asset.subtitle}>{asset.subtitle}</dd>
            </div>
            <div>
              <dt>License</dt>
              <dd>
                <LicenseLink
                  license={asset.license}
                  source={asset.subtitle}
                  fallbackUrl={asset.licenseUrl}
                  fallbackElement="span"
                />
              </dd>
            </div>
          </dl>
        </article>
      ))}
      {assets.length === 0 && <div className="empty-model-results">No assets found for this creator.</div>}
      <InfiniteListSentinel
        hasMore={infinite.hasMore}
        label="Loading creator assets"
        onLoadMore={infinite.loadMore}
        pageSize={PAGE_SIZE}
        remaining={infinite.remaining}
        sentinelRef={infinite.sentinelRef}
      />
    </section>
  );
}
