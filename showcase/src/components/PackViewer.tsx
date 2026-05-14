"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useInfiniteList } from "@/components/useInfiniteList";
import { LicenseLink } from "@/components/LicenseLink";
import { PackDownloadButton } from "@/components/PackDownloadButton";
import { ModelDownloadLinks } from "@/components/ModelDownloadLinks";
import { licenseForVendor } from "@/lib/license";
import { assetUrl, displayPackDescription, displayPackTitle, type Pack } from "@/lib/manifest";
import { findModelRouteRef, modelHref, modelRouteRefsForPack, type ModelRouteRef } from "@/lib/model-routes";
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

const MODEL_LIST_PAGE_SIZE = 80;

function formatModelSize(size: Pack["models"][number]["size"]): string {
  const [width, height, depth] = size;
  return `${width.toFixed(1)} x ${height.toFixed(1)} x ${depth.toFixed(1)}`;
}

export function PackViewer({ pack, initialModelSlug }: { pack: Pack; initialModelSlug?: string }) {
  const modelRefs = useMemo(() => modelRouteRefsForPack(pack), [pack]);
  const assetRef = initialModelSlug ? findModelRouteRef(pack, initialModelSlug) : undefined;
  if (assetRef) return <SingleAssetViewer pack={pack} modelRefs={modelRefs} activeRef={assetRef} />;
  return <PackGroupViewer pack={pack} modelRefs={modelRefs} />;
}

function PackGroupViewer({ pack, modelRefs }: { pack: Pack; modelRefs: ModelRouteRef[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const credit = licenseForVendor(pack.vendor);
  const license = pack.license || credit.license;
  const packTitle = displayPackTitle(pack);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleModels = useMemo(() => {
    if (!normalizedQuery) return modelRefs;
    const terms = normalizedQuery.split(/\s+/).filter(Boolean);
    return modelRefs.filter((ref) => terms.every((term) => ref.model.searchText.includes(term)));
  }, [modelRefs, normalizedQuery]);
  const modelList = useInfiniteList({
    total: visibleModels.length,
    pageSize: MODEL_LIST_PAGE_SIZE,
    resetKey: `${pack.id}:${normalizedQuery}`,
  });
  const listedModels = visibleModels.slice(0, modelList.visibleCount);

  const openModel = useCallback(
    (index: number) => {
      const ref = modelRefs[index];
      if (ref) router.push(modelHref(pack, ref));
    },
    [modelRefs, pack, router],
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
        <h1>{packTitle}</h1>
        <p className="pack-view-description">{displayPackDescription(pack)}</p>
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
          <PackDownloadButton pack={pack} />
        </div>
        <input
          className="model-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search assets in this pack"
        />
        <ul className="model-list">
          {listedModels.map((ref) => (
            <li key={ref.model.file}>
              <Link href={modelHref(pack, ref)}>{ref.model.title}</Link>
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
            {packTitle}{" "}
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

function SingleAssetViewer({
  pack,
  modelRefs,
  activeRef,
}: {
  pack: Pack;
  modelRefs: ModelRouteRef[];
  activeRef: ModelRouteRef;
}) {
  const [query, setQuery] = useState("");
  const index = activeRef.index;
  const model = activeRef.model;
  const prevModel = modelRefs[(index - 1 + modelRefs.length) % modelRefs.length];
  const nextModel = modelRefs[(index + 1) % modelRefs.length];
  const credit = licenseForVendor(pack.vendor);
  const license = pack.license || credit.license;
  const packTitle = displayPackTitle(pack);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleModels = useMemo(() => {
    if (!normalizedQuery) return modelRefs;
    const terms = normalizedQuery.split(/\s+/).filter(Boolean);
    return modelRefs.filter((ref) => terms.every((term) => ref.model.searchText.includes(term)));
  }, [modelRefs, normalizedQuery]);
  const activeModelPosition = visibleModels.findIndex((ref) => ref.index === index);
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
          ← pack grid
        </Link>
        <Link className="vendor-tag vendor-link" href={`/${pack.vendor}`}>
          {credit.vendorLabel}
        </Link>
        <div className="pack-context-label">Single asset</div>
        <h1>{model.title}</h1>
        <section className="asset-focus-panel" aria-label="Asset metadata">
          <span>Part of pack</span>
          <strong>{packTitle}</strong>
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
          <Link href={`/${pack.vendor}/${pack.pack}`}>View pack grid</Link>
          <PackDownloadButton pack={pack} />
        </div>
        <ModelDownloadLinks model={model} className="asset-focus-downloads" compact />
        <input
          className="model-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search assets in this pack"
        />
        <ul className="model-list">
          {listedModels.map((ref) => (
            <li key={ref.model.file}>
              <Link className={ref.index === index ? "active" : ""} href={modelHref(pack, ref)}>
                {ref.model.title}
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
