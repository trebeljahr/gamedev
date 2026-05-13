"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import type { Manifest, Pack } from "@/lib/manifest";

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

function previewModelFor(pack: Pack) {
  const preferredCategories = new Set([
    "character",
    "creature",
    "building",
    "vehicle",
    "environment",
    "nature",
    "sci-fi",
  ]);
  const tinyCategories = new Set(["projectile", "weapon", "effect"]);

  return pack.models
    .slice()
    .sort((a, b) => {
      const score = (model: Pack["models"][number]) => {
        const glb = /\.glb($|[?#])/i.test(model.file);
        const mirroredGlb = model.file.startsWith("/glb/");
        const [w, h, d] = model.size ?? [1, 1, 1];
        const visualWeight = Math.min(Math.max(w, d, h), 8);
        return (
          (mirroredGlb ? 120 : 0) +
          (glb ? 60 : 0) +
          (preferredCategories.has(model.category) ? 30 : 0) -
          (tinyCategories.has(model.category) ? 35 : 0) +
          visualWeight
        );
      };
      return score(b) - score(a);
    })[0];
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

      {byVendor.map(([vendor, packs]) => (
        <section className="vendor-section" id={`creator-${slug(vendor)}`} key={vendor}>
          <h2>{vendor}</h2>
          <div className="pack-grid">
            {packs.map(({ pack, modelMatches }) => (
              <Link key={pack.id} className="pack-card" href={`/${pack.vendor}/${pack.pack}`}>
                <PackCardPreview model={previewModelFor(pack)} />
                <div className="pack-label">{pack.title}</div>
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
      ))}
    </>
  );
}
