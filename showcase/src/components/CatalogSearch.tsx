"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import type { Manifest, Pack } from "@/lib/manifest";

type CatalogSearchProps = {
  manifest: Manifest;
  children?: ReactNode;
  showHeader?: boolean;
};

function matchPack(pack: Pack, query: string): { pack: Pack; modelMatches: number } | null {
  if (!query) return { pack, modelMatches: 0 };
  const terms = query.split(/\s+/).filter(Boolean);
  const packHit = terms.every((term) => pack.searchText.includes(term));
  const modelMatches = pack.models.filter((model) =>
    terms.every((term) => model.searchText.includes(term)),
  ).length;
  if (!packHit && modelMatches === 0) return null;
  return { pack, modelMatches };
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function CatalogSearch({ manifest, children, showHeader = true }: CatalogSearchProps) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();

  const byVendor = useMemo(() => {
    const groups = new Map<string, Array<{ pack: Pack; modelMatches: number }>>();
    for (const pack of manifest.packs) {
      const match = matchPack(pack, normalizedQuery);
      if (!match) continue;
      if (!groups.has(pack.vendor)) groups.set(pack.vendor, []);
      groups.get(pack.vendor)!.push(match);
    }
    return [...groups.entries()];
  }, [manifest.packs, normalizedQuery]);

  const totalModels = manifest.packs.reduce((n, pack) => n + pack.count, 0);
  const visiblePacks = byVendor.reduce((n, [, packs]) => n + packs.length, 0);
  const matchedModels = byVendor.reduce(
    (n, [, packs]) => n + packs.reduce((sum, item) => sum + item.modelMatches, 0),
    0,
  );

  return (
    <>
      {showHeader && (
        <header className="app-header">
          <h1>3D Assets Showcase</h1>
          <div className="meta">
            <Link href="/all" style={{ marginRight: 16, color: "#ffd84d" }}>
              walk through everything
            </Link>
            {manifest.packs.length} packs · {totalModels.toLocaleString()} models
          </div>
        </header>
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
            : "Search uses titles, descriptions, categories, themes, tags, and paths"}
        </div>
      </section>

      {children}

      {byVendor.map(([vendor, packs]) => (
        <section className="vendor-section" id={`creator-${slug(vendor)}`} key={vendor}>
          <h2>{vendor}</h2>
          <div className="pack-grid">
            {packs.map(({ pack, modelMatches }) => (
              <Link key={pack.id} className="pack-card" href={`/${pack.vendor}/${pack.pack}`}>
                <div className="pack-label">{pack.title}</div>
                <p>{pack.description}</p>
                <div className="pack-tags">
                  {pack.tags.slice(0, 5).map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
                <div className="pack-count">
                  {normalizedQuery && modelMatches > 0
                    ? `${modelMatches} matching ${modelMatches === 1 ? "model" : "models"}`
                    : `${pack.count} ${pack.count === 1 ? "model" : "models"}`}
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
