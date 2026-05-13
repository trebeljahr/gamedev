"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { LicenseLink } from "@/components/LicenseLink";
import { SiteHeader } from "@/components/SiteHeader";
import { licenseForVendor, type VendorLicense } from "@/lib/license";
import type { Manifest, Model, Pack } from "@/lib/manifest";
import { uniqueTags } from "@/lib/tags";

const PackCardPreview = dynamic(
  () => import("@/components/PackCardPreview").then((m) => m.PackCardPreview),
  { ssr: false },
);

type ModelCatalogProps = {
  manifest: Manifest;
};

type ModelEntry = {
  model: Model;
  pack: Pack;
  license: string;
  vendorCredit: VendorLicense;
  searchText: string;
};

const ALL = "all";
const PAGE_SIZE = 120;

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function formatSize(model: Model): string {
  const [width, height, depth] = model.size;
  return `${width.toFixed(1)} x ${height.toFixed(1)} x ${depth.toFixed(1)}`;
}

function niceVendor(vendor: string): string {
  const license = licenseForVendor(vendor);
  return license.vendorLabel || vendor;
}

function modelViewerHref(entry: ModelEntry): string {
  return `/${entry.pack.vendor}/${entry.pack.pack}?model=${encodeURIComponent(entry.model.file)}`;
}

function visibleModelTags(model: Model): string[] {
  return uniqueTags([model.subcategory, ...model.themes, ...model.style, ...model.tags]).slice(0, 7);
}

export function ModelCatalog({ manifest }: ModelCatalogProps) {
  const [query, setQuery] = useState("");
  const [vendor, setVendor] = useState(ALL);
  const [category, setCategory] = useState(ALL);
  const [style, setStyle] = useState(ALL);
  const [theme, setTheme] = useState(ALL);
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);
  const normalizedQuery = query.trim().toLowerCase();
  const terms = useMemo(() => normalizedQuery.split(/\s+/).filter(Boolean), [normalizedQuery]);

  const entries = useMemo<ModelEntry[]>(
    () =>
      manifest.packs.flatMap((pack) => {
        const vendorCredit = licenseForVendor(pack.vendor);
        const license = pack.license || vendorCredit.license;
        return pack.models.map((model) => ({
          model,
          pack,
          license,
          vendorCredit,
          searchText: `${model.searchText} ${pack.searchText} ${vendorCredit.vendorLabel} ${license}`.toLowerCase(),
        }));
      }),
    [manifest.packs],
  );

  const vendors = useMemo(() => uniqueSorted(manifest.packs.map((pack) => pack.vendor)), [manifest.packs]);
  const categories = useMemo(() => uniqueSorted(entries.map((entry) => entry.model.category)), [entries]);
  const styles = useMemo(() => uniqueSorted(entries.flatMap((entry) => entry.model.style)), [entries]);
  const themes = useMemo(() => uniqueSorted(entries.flatMap((entry) => entry.model.themes)), [entries]);

  const filtered = useMemo(
    () =>
      entries.filter((entry) => {
        if (vendor !== ALL && entry.pack.vendor !== vendor) return false;
        if (category !== ALL && entry.model.category !== category) return false;
        if (style !== ALL && !entry.model.style.includes(style)) return false;
        if (theme !== ALL && !entry.model.themes.includes(theme)) return false;
        return terms.every((term) => entry.searchText.includes(term));
      }),
    [category, entries, style, terms, theme, vendor],
  );

  const totalModels = entries.length;
  const visibleEntries = filtered.slice(0, visibleLimit);
  const hasMore = visibleEntries.length < filtered.length;

  useEffect(() => {
    setVisibleLimit(PAGE_SIZE);
  }, [category, normalizedQuery, style, theme, vendor]);

  return (
    <>
      <SiteHeader
        active="packs"
        meta={
          <>
            <Link href="/all" className="header-meta-link">
              walk-through view
            </Link>
            {totalModels.toLocaleString()} models · {manifest.packs.length} pack collections
          </>
        }
      />

      <main className="model-catalog-page">
        <section className="model-catalog-heading" aria-labelledby="models-heading">
          <div>
            <div className="landing-kicker">3D catalog</div>
            <h2 id="models-heading">Every 3D model</h2>
            <p>
              Model-first index with creator, license, dimensions, style tags, and pack context kept visible.
            </p>
          </div>
          <Link className="all-link" href="/#3d-collections">
            Pack collections
          </Link>
        </section>

        <section className="catalog-tools model-catalog-tools" aria-label="Model catalog filters">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search models: knight, cactus, door, idle, modular wall..."
          />
          <select value={vendor} onChange={(event) => setVendor(event.target.value)} aria-label="Vendor">
            <option value={ALL}>All creators</option>
            {vendors.map((item) => (
              <option key={item} value={item}>
                {niceVendor(item)}
              </option>
            ))}
          </select>
          <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Category">
            <option value={ALL}>All categories</option>
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select value={style} onChange={(event) => setStyle(event.target.value)} aria-label="Style">
            <option value={ALL}>All styles</option>
            {styles.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select value={theme} onChange={(event) => setTheme(event.target.value)} aria-label="Theme">
            <option value={ALL}>All themes</option>
            {themes.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <div className="catalog-result-count">
            {filtered.length.toLocaleString()} of {totalModels.toLocaleString()} models
          </div>
        </section>

        <section className="model-results" aria-label="Filtered models">
          {visibleEntries.map((entry) => (
            <article className="model-card" key={entry.model.file} id={slug(entry.model.file)}>
              <div className="model-card-preview">
                <PackCardPreview modelFiles={[entry.model.file]} label={entry.model.title} />
              </div>
              <div className="model-card-main">
                <div className="model-card-kicker">
                  <span>{entry.vendorCredit.vendorLabel}</span>
                  <span>{entry.model.category}</span>
                  <LicenseLink
                    license={entry.license}
                    source={entry.vendorCredit.vendorLabel}
                    fallbackUrl={entry.vendorCredit.licenseUrl}
                    className="model-license-link"
                    fallbackElement="span"
                  />
                </div>
                <h3>{entry.model.title}</h3>
                <div className="model-tags">
                  {visibleModelTags(entry.model).map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
                <div className="model-card-actions">
                  <Link href={modelViewerHref(entry)}>Evaluate asset</Link>
                </div>
              </div>
              <dl className="model-metadata">
                <div>
                  <dt>Creator</dt>
                  <dd>
                    <Link href={`/${entry.pack.vendor}`}>{entry.vendorCredit.vendorLabel}</Link>
                  </dd>
                </div>
                <div>
                  <dt>License</dt>
                  <dd>
                    <LicenseLink
                      license={entry.license}
                      source={entry.vendorCredit.vendorLabel}
                      fallbackUrl={entry.vendorCredit.licenseUrl}
                      fallbackElement="span"
                    />
                  </dd>
                </div>
                <div>
                  <dt>Part of pack</dt>
                  <dd>
                    <Link href={`/${entry.pack.vendor}/${entry.pack.pack}`}>{entry.pack.title}</Link>
                  </dd>
                </div>
                <div>
                  <dt>Size</dt>
                  <dd>{formatSize(entry.model)}</dd>
                </div>
                <div>
                  <dt>File</dt>
                  <dd title={entry.model.file}>{entry.model.name}</dd>
                </div>
              </dl>
            </article>
          ))}
          {filtered.length === 0 && (
            <div className="empty-model-results">
              No models match these filters.
            </div>
          )}
          {hasMore && (
            <button
              className="model-load-more"
              type="button"
              onClick={() => setVisibleLimit((current) => current + PAGE_SIZE)}
            >
              Show {Math.min(PAGE_SIZE, filtered.length - visibleEntries.length)} more models
            </button>
          )}
        </section>
      </main>
    </>
  );
}
