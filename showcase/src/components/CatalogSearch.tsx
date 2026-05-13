"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { licenseForVendor } from "@/lib/license";
import type { Manifest, Pack } from "@/lib/manifest";
import { previewModelFor } from "@/lib/preview-model";

const PackCardPreview = dynamic(
  () => import("@/components/PackCardPreview").then((m) => m.PackCardPreview),
  { ssr: false },
);

type CatalogSearchProps = {
  manifest: Manifest;
  children?: ReactNode;
  showHeader?: boolean;
  modelMotion?: ModelMotionFilter;
};

type ModelMotionFilter = "all" | "animated" | "static";

function modelMatchesMotion(model: Pack["models"][number], motion: ModelMotionFilter): boolean {
  if (motion === "all") return true;
  const animated = model.style.includes("animated") || model.tags.includes("animated");
  return motion === "animated" ? animated : !animated;
}

function matchPack(pack: Pack, query: string, motion: ModelMotionFilter): { pack: Pack; modelMatches: number } | null {
  const eligibleModels = pack.models.filter((model) => modelMatchesMotion(model, motion));
  if (eligibleModels.length === 0) return null;
  if (!query && motion === "all") return { pack, modelMatches: 0 };
  const terms = query.split(/\s+/).filter(Boolean);
  const packHit = motion === "all" && terms.every((term) => pack.searchText.includes(term));
  const modelMatches = eligibleModels.filter((model) => terms.every((term) => model.searchText.includes(term))).length;
  if (!packHit && modelMatches === 0) return null;
  return { pack, modelMatches };
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function CatalogSearch({ manifest, children, showHeader = true, modelMotion = "all" }: CatalogSearchProps) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();

  const byVendor = useMemo(() => {
    const groups = new Map<string, Array<{ pack: Pack; modelMatches: number }>>();
    for (const pack of manifest.packs) {
      const match = matchPack(pack, normalizedQuery, modelMotion);
      if (!match) continue;
      if (!groups.has(pack.vendor)) groups.set(pack.vendor, []);
      groups.get(pack.vendor)!.push(match);
    }
    return [...groups.entries()];
  }, [manifest.packs, modelMotion, normalizedQuery]);

  const totalModels = manifest.packs.reduce((n, pack) => n + pack.count, 0);
  const visiblePacks = byVendor.reduce((n, [, packs]) => n + packs.length, 0);
  const matchedModels = byVendor.reduce(
    (n, [, packs]) => n + packs.reduce((sum, item) => sum + item.modelMatches, 0),
    0,
  );

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
                model index
              </Link>
              {manifest.packs.length} packs · {totalModels.toLocaleString()} models
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
            ? `${visiblePacks} packs · ${matchedModels.toLocaleString()} model matches`
            : modelMotion === "animated"
              ? `${visiblePacks} packs · animated 3D models`
              : modelMotion === "static"
                ? `${visiblePacks} packs · static 3D models`
                : "Search uses titles, descriptions, categories, themes, tags, and paths"}
        </div>
      </section>

      {children}

      {byVendor.map(([vendor, packs]) => {
        const credit = licenseForVendor(vendor);
        const packCount = packs.length;
        const modelCount = packs.reduce((sum, item) => sum + item.pack.count, 0);

        return (
          <section className="vendor-section" id={`creator-${slug(vendor)}`} key={vendor}>
            <div className="creator-section-header">
              <div>
                <div className="landing-kicker">Creator</div>
                <h2>{credit.vendorLabel}</h2>
                <p>
                  {packCount} {packCount === 1 ? "pack" : "packs"} · {modelCount.toLocaleString()} models ·{" "}
                  {credit.notes}
                </p>
              </div>
              <div className="creator-credit-panel">
                <div>
                  <span>License</span>
                  {credit.licenseUrl ? (
                    <a href={credit.licenseUrl} target="_blank" rel="noreferrer" className="license-badge">
                      {credit.license}
                    </a>
                  ) : (
                    <strong className="license-badge">{credit.license}</strong>
                  )}
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
            <div className="pack-grid">
              {packs.map(({ pack, modelMatches }) => (
                <Link key={pack.id} className="pack-card" href={`/${pack.vendor}/${pack.pack}`}>
                  <PackCardPreview model={previewModelFor(pack)} />
                  <div className="pack-label">{pack.title}</div>
                  <div className="pack-credit-row">
                    <span>{credit.vendorLabel}</span>
                    <strong>{pack.license || credit.license}</strong>
                  </div>
                  <p>{pack.description}</p>
                  <div className="pack-tags">
                    {pack.tags.slice(0, 5).map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                  <div className="pack-count">
                    {(normalizedQuery || modelMotion !== "all") && modelMatches > 0
                      ? `${modelMatches} matching ${modelMatches === 1 ? "model" : "models"}`
                      : `${pack.count} ${pack.count === 1 ? "model" : "models"}`}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}
