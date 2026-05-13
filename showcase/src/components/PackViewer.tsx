"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useInfiniteList } from "@/components/useInfiniteList";
import { LicenseLink } from "@/components/LicenseLink";
import { licenseForVendor } from "@/lib/license";
import { assetUrl, type Pack } from "@/lib/manifest";
import { uniqueTags } from "@/lib/tags";
import { useRouter } from "next/navigation";

const PackModelsScene = dynamic(() => import("./AllModelsScene").then((m) => m.PackModelsScene), {
  ssr: false,
  loading: () => null,
});

const Viewer = dynamic(() => import("./Viewer").then((m) => m.Viewer), {
  ssr: false,
  loading: () => null,
});

type PackModel = Pack["models"][number];

const MODEL_LIST_PAGE_SIZE = 80;

function modelIndexFor(pack: Pack, initialModelFile: string): number | null {
  const index = pack.models.findIndex((item) => item.file === initialModelFile || item.name === initialModelFile);
  return index >= 0 ? index : null;
}

function modelHref(pack: Pack, model: PackModel): string {
  return `/${pack.vendor}/${pack.pack}?model=${encodeURIComponent(model.file)}`;
}

function formatModelSize(size: Pack["models"][number]["size"]): string {
  const [width, height, depth] = size;
  return `${width.toFixed(1)} x ${height.toFixed(1)} x ${depth.toFixed(1)}`;
}

export function PackViewer({ pack, initialModelFile }: { pack: Pack; initialModelFile?: string }) {
  const assetIndex = initialModelFile ? modelIndexFor(pack, initialModelFile) : null;
  if (assetIndex !== null) return <SingleAssetViewer pack={pack} index={assetIndex} />;
  return <PackGroupViewer pack={pack} />;
}

function PackGroupViewer({ pack }: { pack: Pack }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const credit = licenseForVendor(pack.vendor);
  const license = pack.license || credit.license;
  const normalizedQuery = query.trim().toLowerCase();
  const visibleModels = useMemo(() => {
    const models = pack.models.map((item, itemIndex) => ({ item, itemIndex }));
    if (!normalizedQuery) return models;
    const terms = normalizedQuery.split(/\s+/).filter(Boolean);
    return models.filter(({ item }) => terms.every((term) => item.searchText.includes(term)));
  }, [normalizedQuery, pack.models]);
  const modelList = useInfiniteList({
    total: visibleModels.length,
    pageSize: MODEL_LIST_PAGE_SIZE,
    resetKey: `${pack.id}:${normalizedQuery}`,
  });
  const listedModels = visibleModels.slice(0, modelList.visibleCount);

  const openModel = useCallback(
    (index: number) => {
      const model = pack.models[index];
      if (model) router.push(modelHref(pack, model));
    },
    [pack, router],
  );

  return (
    <div className="viewer-shell">
      <aside>
        <Link className="back" href="/models">
          ← model index
        </Link>
        <Link className="vendor-tag vendor-link" href={`/${pack.vendor}`}>
          {credit.vendorLabel}
        </Link>
        <div className="pack-context-label">Part of pack</div>
        <h1>{pack.title}</h1>
        <p className="pack-view-description">{pack.description}</p>
        <div className="pack-credit-panel">
          <div>
            <span>Creator</span>
            <Link href={`/${pack.vendor}`}>{credit.vendorLabel}</Link>
          </div>
          <div>
            <span>License</span>
            <LicenseLink license={license} source={credit.vendorLabel} fallbackUrl={credit.licenseUrl} />
          </div>
          {credit.notes && <p>{credit.notes}</p>}
          <div className="creator-links">
            <Link href="/#3d-collections">Pack collections</Link>
            {credit.links.map((link) => (
              <a key={link.url} href={link.url} target="_blank" rel="noreferrer">
                {link.label}
              </a>
            ))}
          </div>
        </div>
        <div className="pack-view-tags">
          {uniqueTags(pack.tags).slice(0, 6).map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
        <div className="pack-view-actions">
          <a href={`/api/packs/${pack.vendor}/${pack.pack}/zip`} download>
            Download zip
          </a>
        </div>
        <input
          className="model-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search assets in this pack"
        />
        <ul className="model-list">
          {listedModels.map(({ item: m }) => (
            <li key={m.file}>
              <Link href={modelHref(pack, m)}>{m.title}</Link>
            </li>
          ))}
          {visibleModels.length === 0 && <li className="empty-model-list">No model matches.</li>}
          {modelList.hasMore && (
            <li className="model-list-sentinel" ref={modelList.sentinelRef}>
              <span>Loading models</span>
              <button type="button" onClick={modelList.loadMore}>
                Load {Math.min(MODEL_LIST_PAGE_SIZE, modelList.remaining).toLocaleString()} more
              </button>
            </li>
          )}
        </ul>
      </aside>
      <main>
        <PackModelsScene
          pack={pack}
          onSelectedIndexChange={openModel}
        />
        <div className="viewer-bar">
          <div className="name">
            {pack.title}{" "}
            <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
              ({pack.models.length})
            </span>
            <small>{uniqueTags(pack.tags).slice(0, 4).join(" · ")}</small>
          </div>
        </div>
      </main>
    </div>
  );
}

function SingleAssetViewer({ pack, index }: { pack: Pack; index: number }) {
  const [query, setQuery] = useState("");
  const model = pack.models[index];
  const prevModel = pack.models[(index - 1 + pack.models.length) % pack.models.length];
  const nextModel = pack.models[(index + 1) % pack.models.length];
  const credit = licenseForVendor(pack.vendor);
  const license = pack.license || credit.license;
  const normalizedQuery = query.trim().toLowerCase();
  const visibleModels = useMemo(() => {
    const models = pack.models.map((item, itemIndex) => ({ item, itemIndex }));
    if (!normalizedQuery) return models;
    const terms = normalizedQuery.split(/\s+/).filter(Boolean);
    return models.filter(({ item }) => terms.every((term) => item.searchText.includes(term)));
  }, [normalizedQuery, pack.models]);
  const activeModelPosition = visibleModels.findIndex(({ itemIndex }) => itemIndex === index);
  const singleListInitialLimit =
    activeModelPosition >= 0 ? Math.max(MODEL_LIST_PAGE_SIZE, activeModelPosition + 1) : MODEL_LIST_PAGE_SIZE;
  const modelList = useInfiniteList({
    total: visibleModels.length,
    pageSize: MODEL_LIST_PAGE_SIZE,
    initialLimit: singleListInitialLimit,
    resetKey: `${pack.id}:${index}:${normalizedQuery}`,
  });
  const listedModels = visibleModels.slice(0, modelList.visibleCount);

  return (
    <div className="viewer-shell">
      <aside>
        <Link className="back" href={`/${pack.vendor}/${pack.pack}`}>
          ← back to group
        </Link>
        <Link className="vendor-tag vendor-link" href={`/${pack.vendor}`}>
          {credit.vendorLabel}
        </Link>
        <div className="pack-context-label">Single asset</div>
        <h1>{model.title}</h1>
        <section className="asset-focus-panel" aria-label="Asset metadata">
          <span>Part of pack</span>
          <strong>{pack.title}</strong>
          <dl>
            <div>
              <dt>Category</dt>
              <dd>{model.category}</dd>
            </div>
            <div>
              <dt>Size</dt>
              <dd>{formatModelSize(model.size)}</dd>
            </div>
          </dl>
        </section>
        <div className="pack-credit-panel">
          <div>
            <span>Creator</span>
            <Link href={`/${pack.vendor}`}>{credit.vendorLabel}</Link>
          </div>
          <div>
            <span>License</span>
            <LicenseLink license={license} source={credit.vendorLabel} fallbackUrl={credit.licenseUrl} />
          </div>
          {credit.notes && <p>{credit.notes}</p>}
          <div className="creator-links">
            <Link href="/models">Model index</Link>
            {credit.links.map((link) => (
              <a key={link.url} href={link.url} target="_blank" rel="noreferrer">
                {link.label}
              </a>
            ))}
          </div>
        </div>
        <div className="pack-view-tags">
          {uniqueTags(model.tags).slice(0, 6).map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
        <div className="pack-view-actions">
          <a href={assetUrl(model.file)} download={`${model.title.replace(/\s+/g, "_")}.glb`}>
            Download GLB
          </a>
        </div>
        <input
          className="model-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search assets in this pack"
        />
        <ul className="model-list">
          {listedModels.map(({ item: m, itemIndex: i }) => (
            <li key={m.file}>
              <Link className={i === index ? "active" : ""} href={modelHref(pack, m)}>
                {m.title}
              </Link>
            </li>
          ))}
          {visibleModels.length === 0 && <li className="empty-model-list">No model matches.</li>}
          {modelList.hasMore && (
            <li className="model-list-sentinel" ref={modelList.sentinelRef}>
              <span>Loading models</span>
              <button type="button" onClick={modelList.loadMore}>
                Load {Math.min(MODEL_LIST_PAGE_SIZE, modelList.remaining).toLocaleString()} more
              </button>
            </li>
          )}
        </ul>
      </aside>
      <main>
        <Viewer key={model.file} url={assetUrl(model.file)} />
        <div className="viewer-bar">
          <div className="name">
            {model.title}{" "}
            <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
              ({index + 1}/{pack.models.length})
            </span>
            <small>{model.category} · {uniqueTags(model.tags).slice(0, 4).join(" · ")}</small>
          </div>
          <div className="nav">
            <Link href={modelHref(pack, prevModel)} aria-label="Previous">
              ←
            </Link>
            <Link href={modelHref(pack, nextModel)} aria-label="Next">
              →
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
