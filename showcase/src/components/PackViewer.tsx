"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useInfiniteList } from "@/components/useInfiniteList";
import { LicenseLink } from "@/components/LicenseLink";
import { PackDownloadButton } from "@/components/PackDownloadButton";
import { ModelDownloadLinks } from "@/components/ModelDownloadLinks";
import { trackSearchNoResults } from "@/lib/analytics";
import { creatorHref } from "@/lib/creator-routing";
import { licenseForVendor } from "@/lib/license";
import {
  assetUrl,
  displayPackTitle,
  modelSearchText,
  packDescription,
  type Pack,
} from "@/lib/manifest";
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

function creatorLinkLabel(label: string): string {
  return label.toLowerCase() === "home" ? "Website" : label;
}

function attributionTextFor(creator: string, license: string): string {
  return `${creator} - ${license}`;
}

async function writeClipboardText(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the selection-based copy path below.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, text.length);
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Copy failed");
}

function CreatorAttributionPanel({ pack, license }: { pack: Pack; license: string }) {
  const [copied, setCopied] = useState(false);
  const credit = licenseForVendor(pack.vendor);
  const attribution = attributionTextFor(credit.vendorLabel, license);

  async function copyAttribution() {
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
    try {
      await writeClipboardText(attribution);
    } catch {
      // Browser permission failures should not make the attribution text harder to copy manually.
    }
  }

  return (
    <section className="creator-attribution-panel" aria-label="Creator attribution">
      <div className="side-section-label">Attribution</div>
      <div className="attribution-copy-row">
        <span className="attribution-text" title="Select and copy this attribution">
          {attribution}
        </span>
        <button type="button" className="attribution-copy-button" onClick={copyAttribution}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="attribution-license-row">
        <span>Creator</span>
        <Link href={creatorHref(credit.vendorLabel)}>{credit.vendorLabel}</Link>
      </div>
      <div className="attribution-license-row">
        <span>License</span>
        <LicenseLink license={license} source={credit.vendorLabel} fallbackUrl={credit.licenseUrl} />
      </div>
      {credit.notes && <p>{credit.notes}</p>}
      <div className="creator-source-links" aria-label={`${credit.vendorLabel} links`}>
        {credit.links.map((link) => (
          <a key={link.url} href={link.url} target="_blank" rel="noreferrer">
            {creatorLinkLabel(link.label)}
          </a>
        ))}
      </div>
      <Link className="creator-browse-button" href={creatorHref(credit.vendorLabel)}>
        Browse other models by this creator
      </Link>
    </section>
  );
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
  const lastNoResultsKey = useRef("");
  const credit = licenseForVendor(pack.vendor);
  const license = pack.license || credit.license;
  const packTitle = displayPackTitle(pack);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleModels = useMemo(() => {
    if (!normalizedQuery) return modelRefs;
    const terms = normalizedQuery.split(/\s+/).filter(Boolean);
    return modelRefs.filter((ref) => {
      const text = modelSearchText(ref.model, pack);
      return terms.every((term) => text.includes(term));
    });
  }, [modelRefs, normalizedQuery, pack]);
  const modelList = useInfiniteList({
    total: visibleModels.length,
    pageSize: MODEL_LIST_PAGE_SIZE,
    resetKey: `${pack.id}:${normalizedQuery}`,
  });
  const listedModels = visibleModels.slice(0, modelList.visibleCount);

  useEffect(() => {
    if (!normalizedQuery || visibleModels.length > 0) return;
    const key = `${pack.id}:${normalizedQuery}`;
    if (lastNoResultsKey.current === key) return;
    lastNoResultsKey.current = key;
    trackSearchNoResults({ query: normalizedQuery, type: "pack_models" });
  }, [normalizedQuery, pack.id, visibleModels.length]);

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
        <Link className="vendor-tag vendor-link" href={creatorHref(credit.vendorLabel)}>
          {credit.vendorLabel}
        </Link>
        <div className="pack-context-label">Part of pack</div>
        <h1>{packTitle}</h1>
        <p className="pack-view-description">{packDescription(pack)}</p>
        <div className="pack-credit-panel">
          <div>
            <span>Creator</span>
            <Link href={creatorHref(credit.vendorLabel)}>{credit.vendorLabel}</Link>
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
  const index = activeRef.index;
  const model = activeRef.model;
  const prevModel = modelRefs[(index - 1 + modelRefs.length) % modelRefs.length];
  const nextModel = modelRefs[(index + 1) % modelRefs.length];
  const credit = licenseForVendor(pack.vendor);
  const license = pack.license || credit.license;
  const packTitle = displayPackTitle(pack);
  const singleListInitialLimit = Math.max(MODEL_LIST_PAGE_SIZE, index + 1);
  const modelList = useInfiniteList({
    total: modelRefs.length,
    pageSize: MODEL_LIST_PAGE_SIZE,
    initialLimit: singleListInitialLimit,
    resetKey: `${pack.id}:${index}`,
  });
  const listedModels = modelRefs.slice(0, modelList.visibleCount);

  return (
    <div className="viewer-shell">
      <aside>
        <Link className="back" href={`/${pack.vendor}/${pack.pack}`}>
          ← back to group
        </Link>
        <CreatorAttributionPanel pack={pack} license={license} />
        <div className="side-list-heading">Pack models</div>
        <ul className="model-list">
          {listedModels.map((ref) => (
            <li key={ref.model.file}>
              <Link className={ref.index === index ? "active" : ""} href={modelHref(pack, ref)}>
                {ref.model.title}
              </Link>
            </li>
          ))}
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
            <small>{packTitle}</small>
          </div>
          <div className="viewer-controls">
            <ModelDownloadLinks model={model} compact />
            <div className="nav">
              <Link href={modelHref(pack, prevModel)} aria-label="Previous">
                ←
              </Link>
              <Link href={modelHref(pack, nextModel)} aria-label="Next">
                →
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
