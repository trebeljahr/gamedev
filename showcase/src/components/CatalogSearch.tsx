"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { InfiniteListSentinel, useInfiniteList } from "@/components/useInfiniteList";
import { LicenseLink } from "@/components/LicenseLink";
import { PackGrid } from "@/components/PackGrid";
import { PackDownloadButton } from "@/components/PackDownloadButton";
import { SiteHeader } from "@/components/SiteHeader";
import { trackSearchNoResults } from "@/lib/analytics";
import { licenseForVendor } from "@/lib/license";
import { modelSearchText, packSearchText, type Manifest, type Pack } from "@/lib/manifest";
import { previewModelFilesFor } from "@/lib/preview-model";

type CatalogSearchProps = {
  manifest: Manifest;
  children?: ReactNode;
  showHeader?: boolean;
  modelMotion?: ModelMotionFilter;
};

type ModelMotionFilter = "all" | "animated" | "static";
type PackMatch = { pack: Pack; modelMatches: number };

const PACK_LIST_PAGE_SIZE = 36;

function modelMatchesMotion(model: Pack["models"][number], motion: ModelMotionFilter): boolean {
  if (motion === "all") return true;
  const animated = model.style.includes("animated") || model.tags.includes("animated");
  return motion === "animated" ? animated : !animated;
}

function matchPack(pack: Pack, terms: string[], motion: ModelMotionFilter): PackMatch | null {
  let eligibleCount = 0;
  let modelMatches = 0;

  for (const model of pack.models) {
    if (!modelMatchesMotion(model, motion)) continue;
    eligibleCount += 1;
    if (terms.length === 0) {
      modelMatches += 1;
      continue;
    }
    const text = modelSearchText(model, pack);
    if (terms.every((term) => text.includes(term))) modelMatches += 1;
  }

  if (eligibleCount === 0) return null;
  if (terms.length === 0 && motion === "all") return { pack, modelMatches: 0 };
  const packText = packSearchText(pack);
  const packHit = motion === "all" && terms.every((term) => packText.includes(term));
  if (!packHit && modelMatches === 0) return null;
  return { pack, modelMatches };
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function CatalogSearch({ manifest, children, showHeader = true, modelMotion = "all" }: CatalogSearchProps) {
  const [query, setQuery] = useState("");
  const lastNoResultsKey = useRef("");
  const normalizedQuery = query.trim().toLowerCase();
  const terms = useMemo(() => normalizedQuery.split(/\s+/).filter(Boolean), [normalizedQuery]);

  const matches = useMemo(() => {
    const items: PackMatch[] = [];
    for (const pack of manifest.packs) {
      const match = matchPack(pack, terms, modelMotion);
      if (!match) continue;
      items.push(match);
    }
    return items;
  }, [manifest.packs, modelMotion, terms]);

  const listResetKey = [normalizedQuery, modelMotion].join("|");
  const infinite = useInfiniteList({
    total: matches.length,
    pageSize: PACK_LIST_PAGE_SIZE,
    resetKey: listResetKey,
  });
  const visibleMatches = useMemo(
    () => matches.slice(0, infinite.visibleCount),
    [infinite.visibleCount, matches],
  );

  const visibleByVendor = useMemo(() => {
    const groups = new Map<string, PackMatch[]>();
    for (const match of visibleMatches) {
      const vendor = match.pack.vendor;
      if (!groups.has(vendor)) groups.set(vendor, []);
      groups.get(vendor)!.push(match);
    }
    return [...groups.entries()];
  }, [visibleMatches]);

  const vendorStats = useMemo(() => {
    const stats = new Map<string, { modelCount: number; packCount: number }>();
    for (const { pack } of matches) {
      const current = stats.get(pack.vendor) ?? { modelCount: 0, packCount: 0 };
      current.modelCount += pack.count;
      current.packCount += 1;
      stats.set(pack.vendor, current);
    }
    return stats;
  }, [matches]);

  const totalModels = manifest.packs.reduce((n, pack) => n + pack.count, 0);
  const visiblePacks = matches.length;
  const matchedModels = matches.reduce(
    (n, item) => n + item.modelMatches,
    0,
  );

  useEffect(() => {
    if (!normalizedQuery || matches.length > 0) return;
    const key = `${normalizedQuery}:${modelMotion}`;
    if (lastNoResultsKey.current === key) return;
    lastNoResultsKey.current = key;
    trackSearchNoResults({ query: normalizedQuery, type: "3d_packs" });
  }, [matches.length, modelMotion, normalizedQuery]);

  return (
    <>
      {showHeader && (
        <SiteHeader
          meta={
            <>
              <Link href="/all" style={{ marginRight: 16, color: "#ffd84d" }}>
                walk-through view
              </Link>
              <Link href="/models" style={{ marginRight: 16, color: "#ffd84d" }}>
                all models
              </Link>
              {totalModels.toLocaleString()} models · {manifest.packs.length} pack collections
            </>
          }
        />
      )}

      <section className="catalog-tools" aria-label="3D catalog search">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search 3D assets: zombie, road, sci-fi turret, modular wall, sushi..."
        />
        <div className="catalog-result-count">
          {normalizedQuery
            ? `${matchedModels.toLocaleString()} model matches · ${visiblePacks} pack collections`
            : modelMotion === "animated"
              ? `Animated 3D models across ${visiblePacks} pack collections`
              : modelMotion === "static"
                ? `Static 3D models across ${visiblePacks} pack collections`
                : "Search uses titles, descriptions, categories, themes, tags, and paths"}
        </div>
      </section>

      {children}

      {visibleByVendor.map(([vendor, packs]) => {
        const credit = licenseForVendor(vendor);
        const stats = vendorStats.get(vendor);
        const packCount = stats?.packCount ?? packs.length;
        const modelCount = stats?.modelCount ?? packs.reduce((sum, item) => sum + item.pack.count, 0);

        return (
          <section className="vendor-section" id={`creator-${slug(vendor)}`} key={vendor}>
            <div className="creator-section-header">
              <div>
                <div className="landing-kicker">Creator</div>
                <h2>{credit.vendorLabel}</h2>
                <p>
                  {modelCount.toLocaleString()} models · {packCount} curated{" "}
                  {packCount === 1 ? "collection" : "collections"} ·{" "}
                  {credit.notes}
                </p>
              </div>
              <div className="creator-credit-panel">
                <div>
                  <span>License</span>
                  <LicenseLink license={credit.license} fallbackUrl={credit.licenseUrl} className="license-badge" />
                </div>
                <div className="creator-links" aria-label={`${credit.vendorLabel} links`}>
                  <Link href={`/${vendor}`}>Creator page</Link>
                  {credit.links.map((link) => (
                    <a key={link.url} href={link.url} target="_blank" rel="noreferrer">
                      {link.label}
                    </a>
                  ))}
                </div>
              </div>
            </div>
            <PackGrid
              credit={credit}
              items={packs.map(({ pack, modelMatches }) => ({
                actions: <PackDownloadButton pack={pack} />,
                pack,
                previewModelFiles: previewModelFilesFor(pack),
                modelMatches,
              }))}
              paginate={false}
              resetKey={`${vendor}:${normalizedQuery}:${modelMotion}`}
              renderCount={({ pack, modelMatches = 0 }) =>
                (normalizedQuery || modelMotion !== "all") && modelMatches > 0
                  ? `${modelMatches} matching ${modelMatches === 1 ? "model" : "models"}`
                  : `${pack.count} ${pack.count === 1 ? "model" : "models"}`
              }
            />
          </section>
        );
      })}
      <InfiniteListSentinel
        className="pack-grid-sentinel"
        hasMore={infinite.hasMore}
        label="Loading collections"
        onLoadMore={infinite.loadMore}
        pageSize={PACK_LIST_PAGE_SIZE}
        remaining={infinite.remaining}
        sentinelRef={infinite.sentinelRef}
      />
      {matches.length === 0 && (
        <div className="empty-model-results">
          No pack collections match this search.
        </div>
      )}
    </>
  );
}
