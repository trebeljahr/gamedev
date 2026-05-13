"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import type { ReactNode } from "react";
import { InfiniteListSentinel, useInfiniteList } from "@/components/useInfiniteList";
import { LicenseLink } from "@/components/LicenseLink";
import type { VendorLicense } from "@/lib/license";
import type { Pack } from "@/lib/manifest";
import { uniqueTags } from "@/lib/tags";

const PackCardPreview = dynamic(
  () => import("@/components/PackCardPreview").then((m) => m.PackCardPreview),
  { ssr: false },
);

export type PackGridItem = {
  pack: Pick<Pack, "count" | "description" | "id" | "license" | "pack" | "preview" | "tags" | "title" | "vendor">;
  actions?: ReactNode;
  previewModelFiles: string[];
  modelMatches?: number;
};

type PackGridProps = {
  credit: VendorLicense;
  items: PackGridItem[];
  pageSize?: number;
  renderCount?: (item: PackGridItem) => ReactNode;
  resetKey: string;
  showActions?: boolean;
};

function defaultCountLabel({ pack }: PackGridItem): string {
  return `${pack.count} ${pack.count === 1 ? "model" : "models"}`;
}

export function PackGrid({
  credit,
  items,
  pageSize = 36,
  renderCount = defaultCountLabel,
  resetKey,
  showActions = true,
}: PackGridProps) {
  const infinite = useInfiniteList({
    total: items.length,
    pageSize,
    resetKey,
  });
  const visibleItems = items.slice(0, infinite.visibleCount);

  return (
    <>
      <div className="pack-grid">
        {visibleItems.map((item) => {
          const { pack } = item;
          const packHref = `/${pack.vendor}/${pack.pack}`;

          return (
            <article key={pack.id} className="pack-card">
              <Link className="pack-preview-link" href={packHref}>
                <PackCardPreview modelFiles={item.previewModelFiles} label={pack.preview?.modelTitle} />
              </Link>
              <Link className="pack-label pack-label-link" href={packHref}>
                {pack.title}
              </Link>
              <div className="pack-credit-row">
                <span>{credit.vendorLabel}</span>
                <LicenseLink
                  license={pack.license || credit.license}
                  source={credit.vendorLabel}
                  fallbackUrl={credit.licenseUrl}
                />
              </div>
              <Link className="pack-card-body-link" href={packHref}>
                <p>{pack.description}</p>
                <div className="pack-tags">
                  {uniqueTags(pack.tags).slice(0, 5).map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
                <div className="pack-count">{renderCount(item)}</div>
              </Link>
              {showActions && (
                <div className="pack-card-actions">
                  <Link href={packHref}>View</Link>
                  {item.actions}
                </div>
              )}
            </article>
          );
        })}
      </div>
      <InfiniteListSentinel
        className="pack-grid-sentinel"
        hasMore={infinite.hasMore}
        label="Loading collections"
        onLoadMore={infinite.loadMore}
        pageSize={pageSize}
        remaining={infinite.remaining}
        sentinelRef={infinite.sentinelRef}
      />
    </>
  );
}
