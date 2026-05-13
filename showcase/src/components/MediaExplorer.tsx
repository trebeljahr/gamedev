"use client";

import { useMemo, useState } from "react";
import type { ArtPack, MusicTrack, SoundCollection } from "@/lib/media";

type MediaExplorerProps = {
  soundCollections: SoundCollection[];
  musicTracks: MusicTrack[];
  artPacks: ArtPack[];
};

type View = "sounds" | "art";

function licenseBucket(license: string): string {
  const lower = license.toLowerCase();
  if (lower.includes("cc0") || lower.includes("creative commons zero")) return "CC0";
  if (lower.includes("non-commercial")) return "Non-commercial";
  if (lower.includes("pixabay")) return "Pixabay";
  if (lower.includes("cc-by")) return "CC-BY";
  if (lower.includes("custom") || lower.includes("redistribution")) return "Custom";
  return "Varies";
}

export function MediaExplorer({
  soundCollections,
  musicTracks,
  artPacks,
}: MediaExplorerProps) {
  const [view, setView] = useState<View>("sounds");
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [licenseFilter, setLicenseFilter] = useState("all");

  const soundSources = useMemo(
    () => ["all", ...Array.from(new Set(soundCollections.map((s) => s.source))).sort()],
    [soundCollections],
  );

  const artLicenses = useMemo(
    () => ["all", ...Array.from(new Set(artPacks.map((p) => licenseBucket(p.license_class))))],
    [artPacks],
  );

  const filteredSounds = useMemo(() => {
    const q = query.trim().toLowerCase();
    return soundCollections.filter((item) => {
      if (sourceFilter !== "all" && item.source !== sourceFilter) return false;
      if (!q) return true;
      return `${item.title} ${item.path} ${item.license} ${item.notes}`.toLowerCase().includes(q);
    });
  }, [query, soundCollections, sourceFilter]);

  const filteredArt = useMemo(() => {
    const q = query.trim().toLowerCase();
    return artPacks.filter((pack) => {
      if (licenseFilter !== "all" && licenseBucket(pack.license_class) !== licenseFilter) {
        return false;
      }
      if (!q) return true;
      return `${pack.title} ${pack.author} ${pack.folder} ${pack.license_class}`
        .toLowerCase()
        .includes(q);
    });
  }, [artPacks, licenseFilter, query]);

  return (
    <div className="media-page">
      <header className="app-header">
        <h1>Game Asset Media</h1>
        <div className="meta">
          {soundCollections.length} sound groups · {artPacks.length} 2D packs
        </div>
      </header>

      <section className="media-hero">
        <div>
          <div className="vendor-tag">Library</div>
          <h2>Explore sound effects, music, and 2D art alongside the 3D packs.</h2>
        </div>
        <div className="media-tabs" aria-label="Media type">
          <button
            type="button"
            className={view === "sounds" ? "active" : ""}
            onClick={() => setView("sounds")}
          >
            Sounds
          </button>
          <button
            type="button"
            className={view === "art" ? "active" : ""}
            onClick={() => setView("art")}
          >
            2D art
          </button>
        </div>
      </section>

      <section className="media-tools" aria-label="Catalog filters">
        <input
          type="search"
          placeholder={view === "sounds" ? "Search sounds, folders, licenses" : "Search packs, authors, licenses"}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {view === "sounds" ? (
          <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
            {soundSources.map((source) => (
              <option key={source} value={source}>
                {source === "all" ? "All sources" : source}
              </option>
            ))}
          </select>
        ) : (
          <select value={licenseFilter} onChange={(event) => setLicenseFilter(event.target.value)}>
            {artLicenses.map((license) => (
              <option key={license} value={license}>
                {license === "all" ? "All licenses" : license}
              </option>
            ))}
          </select>
        )}
      </section>

      {view === "sounds" ? (
        <div className="media-columns">
          <section className="media-panel">
            <h3>Sound effect groups</h3>
            <div className="media-list">
              {filteredSounds.map((item) => (
                <article className="media-row" key={item.id}>
                  <div>
                    <div className="media-title">{item.title}</div>
                    <div className="media-detail">{item.path}</div>
                    {item.notes && <p>{item.notes}</p>}
                  </div>
                  <div className="media-actions">
                    <span>{item.license}</span>
                    {item.url && (
                      <a href={item.url} target="_blank" rel="noreferrer">
                        source
                      </a>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="media-panel">
            <h3>Music previews</h3>
            <div className="track-list">
              {musicTracks.map((track) => (
                <article className="track-row" key={track.path}>
                  <div className="media-title">{track.title}</div>
                  <div className="media-detail">{track.source} · {track.license}</div>
                  <audio controls preload="none" src={track.src} />
                </article>
              ))}
            </div>
          </section>
        </div>
      ) : (
        <section className="media-panel">
          <h3>2D art packs</h3>
          <div className="media-list">
            {filteredArt.map((pack) => (
              <article className="media-row" key={pack.folder}>
                <div>
                  <div className="media-title">{pack.title}</div>
                  <div className="media-detail">
                    {pack.author} · 2D/{pack.folder}
                  </div>
                  <p>{pack.license_class}</p>
                </div>
                <div className="media-actions">
                  <span>{pack.attribution}</span>
                  {pack.url && (
                    <a href={pack.url} target="_blank" rel="noreferrer">
                      source
                    </a>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
