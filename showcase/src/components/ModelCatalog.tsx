"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { SelectDropdown } from "@/components/NavDrawer";
import { InfiniteListSentinel, useInfiniteList } from "@/components/useInfiniteList";
import { LicenseLink } from "@/components/LicenseLink";
import { ModelDownloadLinks } from "@/components/ModelDownloadLinks";
import { SiteHeader } from "@/components/SiteHeader";
import { trackSearchNoResults } from "@/lib/analytics";
import { creatorHref } from "@/lib/creator-routing";
import { licenseForVendor, type VendorLicense } from "@/lib/license";
import {
  displayPackTitle,
  downloadsForModel,
  modelSearchText,
  packSearchText,
  type Manifest,
  type Model,
  type Pack,
} from "@/lib/manifest";
import {
  formatLandingPath,
  isModelFormat,
  MODEL_FORMAT_DETAILS,
  MODEL_FORMATS,
  type ModelFormat,
} from "@/lib/model-formats";
import { modelHref } from "@/lib/model-routes";
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
  formats: ModelFormat[];
};

const ALL = "all";
const PAGE_SIZE = 120;

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function niceVendor(vendor: string): string {
  const license = licenseForVendor(vendor);
  return license.vendorLabel || vendor;
}

function modelViewerHref(entry: ModelEntry): string {
  return modelHref(entry.pack, entry.model);
}

function visibleModelTags(model: Model): string[] {
  return uniqueTags([model.subcategory, ...model.themes, ...model.style, ...model.tags]).slice(0, 7);
}

export function ModelCatalog({ manifest }: ModelCatalogProps) {
  const [query, setQuery] = useState("");
  const lastNoResultsKey = useRef("");
  const [vendor, setVendor] = useState(ALL);
  const [category, setCategory] = useState(ALL);
  const [style, setStyle] = useState(ALL);
  const [theme, setTheme] = useState(ALL);
  const [format, setFormat] = useState<ModelFormat | typeof ALL>(ALL);
  const normalizedQuery = query.trim().toLowerCase();
  const terms = useMemo(() => normalizedQuery.split(/\s+/).filter(Boolean), [normalizedQuery]);

  const entries = useMemo<ModelEntry[]>(
    () =>
      manifest.packs.flatMap((pack) => {
        const vendorCredit = licenseForVendor(pack.vendor);
        const license = pack.license || vendorCredit.license;
        const packIndex = packSearchText(pack);
        return pack.models.map((model) => {
          const formats = uniqueSorted(
            downloadsForModel(model)
              .map((download) => download.format)
              .filter(isModelFormat),
          ) as ModelFormat[];
          return {
            model,
            pack,
            license,
            vendorCredit,
            formats,
            searchText: `${modelSearchText(model, pack)} ${packIndex} ${vendorCredit.vendorLabel.toLowerCase()} ${license.toLowerCase()} ${formats.join(" ")}`,
          };
        });
      }),
    [manifest.packs],
  );

  const vendors = useMemo(() => uniqueSorted(manifest.packs.map((pack) => pack.vendor)), [manifest.packs]);
  const categories = useMemo(() => uniqueSorted(entries.map((entry) => entry.model.category)), [entries]);
  const styles = useMemo(() => uniqueSorted(entries.flatMap((entry) => entry.model.style)), [entries]);
  const themes = useMemo(() => uniqueSorted(entries.flatMap((entry) => entry.model.themes)), [entries]);
  const formats = useMemo(
    () => MODEL_FORMATS.filter((item) => entries.some((entry) => entry.formats.includes(item))),
    [entries],
  );

  const filtered = useMemo(
    () =>
      entries.filter((entry) => {
        if (vendor !== ALL && entry.pack.vendor !== vendor) return false;
        if (category !== ALL && entry.model.category !== category) return false;
        if (style !== ALL && !entry.model.style.includes(style)) return false;
        if (theme !== ALL && !entry.model.themes.includes(theme)) return false;
        if (format !== ALL && !entry.formats.includes(format)) return false;
        return terms.every((term) => entry.searchText.includes(term));
      }),
    [category, entries, format, style, terms, theme, vendor],
  );

  const totalModels = entries.length;
  const listResetKey = [category, format, normalizedQuery, style, theme, vendor].join("|");
  const infinite = useInfiniteList({
    total: filtered.length,
    pageSize: PAGE_SIZE,
    resetKey: listResetKey,
  });
  const visibleEntries = filtered.slice(0, infinite.visibleCount);

  useEffect(() => {
    if (!normalizedQuery || filtered.length > 0) return;
    const key = [normalizedQuery, vendor, category, style, theme].join("|");
    if (lastNoResultsKey.current === key) return;
    lastNoResultsKey.current = key;
    trackSearchNoResults({ query: normalizedQuery, type: "models" });
  }, [category, filtered.length, normalizedQuery, style, theme, vendor]);

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
              Model-first index with creator, license, style tags, and pack context kept visible.
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
          <SelectDropdown
            ariaLabel="Vendor"
            value={vendor}
            onChange={setVendor}
            options={[{ value: ALL, label: "All creators" }, ...vendors.map((item) => ({ value: item, label: niceVendor(item) }))]}
          />
          <SelectDropdown
            ariaLabel="Category"
            value={category}
            onChange={setCategory}
            options={[{ value: ALL, label: "All categories" }, ...categories.map((item) => ({ value: item, label: item }))]}
          />
          <SelectDropdown
            ariaLabel="Style"
            value={style}
            onChange={setStyle}
            options={[{ value: ALL, label: "All styles" }, ...styles.map((item) => ({ value: item, label: item }))]}
          />
          <SelectDropdown
            ariaLabel="Theme"
            value={theme}
            onChange={setTheme}
            options={[{ value: ALL, label: "All themes" }, ...themes.map((item) => ({ value: item, label: item }))]}
          />
          <SelectDropdown
            ariaLabel="Format"
            value={format}
            onChange={setFormat}
            options={[
              { value: ALL, label: "All formats" },
              ...formats.map((item) => ({ value: item, label: MODEL_FORMAT_DETAILS[item].label })),
            ]}
          />
          {format !== ALL && (
            <Link className="catalog-format-page-link" href={formatLandingPath(format)}>
              View all {MODEL_FORMAT_DETAILS[format].label} models
            </Link>
          )}
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
                  <Link href={modelViewerHref(entry)}>Inspect model</Link>
                </div>
                <ModelDownloadLinks model={entry.model} compact />
              </div>
              <dl className="model-metadata">
                <div>
                  <dt>Creator</dt>
                  <dd>
                    <Link href={creatorHref(entry.vendorCredit.vendorLabel)}>{entry.vendorCredit.vendorLabel}</Link>
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
                    <Link href={`/${entry.pack.vendor}/${entry.pack.pack}`}>{displayPackTitle(entry.pack)}</Link>
                  </dd>
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
          <InfiniteListSentinel
            hasMore={infinite.hasMore}
            label="Loading models"
            onLoadMore={infinite.loadMore}
            pageSize={PAGE_SIZE}
            remaining={infinite.remaining}
            sentinelRef={infinite.sentinelRef}
          />
        </section>
      </main>
    </>
  );
}
