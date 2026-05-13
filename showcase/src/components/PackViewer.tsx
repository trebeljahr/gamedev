"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useGLTF } from "@react-three/drei";
import { LicenseLink } from "@/components/LicenseLink";
import { licenseForVendor } from "@/lib/license";
import { assetUrl, type Pack } from "@/lib/manifest";

const Viewer = dynamic(() => import("./Viewer").then((m) => m.Viewer), {
  ssr: false,
  loading: () => null,
});

function initialIndexFor(pack: Pack, initialModelFile?: string): number {
  if (!initialModelFile) return 0;
  const index = pack.models.findIndex((item) => item.file === initialModelFile || item.name === initialModelFile);
  return index >= 0 ? index : 0;
}

function formatModelSize(size: Pack["models"][number]["size"]): string {
  const [width, height, depth] = size;
  return `${width.toFixed(1)} x ${height.toFixed(1)} x ${depth.toFixed(1)}`;
}

export function PackViewer({ pack, initialModelFile }: { pack: Pack; initialModelFile?: string }) {
  const [index, setIndex] = useState(() => initialIndexFor(pack, initialModelFile));
  const [query, setQuery] = useState("");
  const model = pack.models[index];
  const credit = licenseForVendor(pack.vendor);
  const license = pack.license || credit.license;
  const normalizedQuery = query.trim().toLowerCase();
  const visibleModels = normalizedQuery
    ? pack.models
        .map((item, itemIndex) => ({ item, itemIndex }))
        .filter(({ item }) => normalizedQuery.split(/\s+/).every((term) => item.searchText.includes(term)))
    : pack.models.map((item, itemIndex) => ({ item, itemIndex }));

  const next = useCallback(() => {
    setIndex((i) => (i + 1) % pack.models.length);
  }, [pack.models.length]);

  const prev = useCallback(() => {
    setIndex((i) => (i - 1 + pack.models.length) % pack.models.length);
  }, [pack.models.length]);

  useEffect(() => setIndex(initialIndexFor(pack, initialModelFile)), [initialModelFile, pack]);

  useEffect(() => {
    const n = pack.models.length;
    if (n <= 1) return;
    useGLTF.preload(assetUrl(pack.models[(index + 1) % n].file));
    useGLTF.preload(assetUrl(pack.models[(index - 1 + n) % n].file));
  }, [index, pack.models]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev]);

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
        {model && (
          <section className="asset-focus-panel" aria-label="Selected asset">
            <span>Selected asset</span>
            <strong>{model.title}</strong>
            <p>{model.description}</p>
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
        )}
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
          {pack.tags.slice(0, 6).map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
        <input
          className="model-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search assets in this pack"
        />
        <ul className="model-list">
          {visibleModels.map(({ item: m, itemIndex: i }) => (
            <li key={m.file}>
              <button
                type="button"
                className={i === index ? "active" : ""}
                onClick={() => setIndex(i)}
              >
                {m.title}
              </button>
            </li>
          ))}
          {visibleModels.length === 0 && <li className="empty-model-list">No model matches.</li>}
        </ul>
      </aside>
      <main>
        {model && <Viewer key={model.file} url={assetUrl(model.file)} />}
        <div className="viewer-bar">
          <div className="name">
            {model?.title}{" "}
            <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
              ({index + 1}/{pack.models.length})
            </span>
            {model && (
              <small>
                {model.category} · {model.tags.slice(0, 4).join(" · ")}
              </small>
            )}
          </div>
          <div className="nav">
            <button type="button" onClick={prev} aria-label="Previous">
              ←
            </button>
            <button type="button" onClick={next} aria-label="Next">
              →
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
