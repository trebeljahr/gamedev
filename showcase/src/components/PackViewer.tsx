"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useGLTF } from "@react-three/drei";
import type { Pack } from "@/lib/manifest";

const Viewer = dynamic(() => import("./Viewer").then((m) => m.Viewer), {
  ssr: false,
  loading: () => null,
});

export function PackViewer({ pack }: { pack: Pack }) {
  const [index, setIndex] = useState(0);
  const model = pack.models[index];

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
    useGLTF.preload(pack.models[(index + 1) % n].file);
    useGLTF.preload(pack.models[(index - 1 + n) % n].file);
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
        <Link className="back" href="/">
          ← all packs
        </Link>
        <div className="vendor-tag">{pack.vendor}</div>
        <h1>{pack.label}</h1>
        <ul className="model-list">
          {pack.models.map((m, i) => (
            <li key={m.file}>
              <button
                type="button"
                className={i === index ? "active" : ""}
                onClick={() => setIndex(i)}
              >
                {m.label}
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <main>
        {model && <Viewer key={model.file} url={model.file} />}
        <div className="viewer-bar">
          <div className="name">
            {model?.label}{" "}
            <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
              ({index + 1}/{pack.models.length})
            </span>
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
