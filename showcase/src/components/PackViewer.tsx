"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useGLTF } from "@react-three/drei";
import { licenseForVendor } from "@/lib/license";
import { assetUrl, type Pack } from "@/lib/manifest";

const Viewer = dynamic(() => import("./Viewer").then((m) => m.Viewer), {
  ssr: false,
  loading: () => null,
});

export function PackViewer({ pack }: { pack: Pack }) {
  const [index, setIndex] = useState(0);
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

  useEffect(() => setIndex(0), [pack.id]);

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
        <Link className="back" href="/#3d-packs">
          ← all packs
        </Link>
        <Link className="vendor-tag vendor-link" href={`/${pack.vendor}`}>
          {credit.vendorLabel}
        </Link>
        <h1>{pack.title}</h1>
        <p className="pack-view-description">{pack.description}</p>
        <div className="pack-credit-panel">
          <div>
            <span>Creator</span>
            <Link href={`/${pack.vendor}`}>{credit.vendorLabel}</Link>
          </div>
          <div>
            <span>License</span>
            {credit.licenseUrl ? (
              <a href={credit.licenseUrl} target="_blank" rel="noreferrer">
                {license}
              </a>
            ) : (
              <strong>{license}</strong>
            )}
          </div>
          {credit.notes && <p>{credit.notes}</p>}
          <div className="creator-links">
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
          placeholder="Search models in pack"
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
