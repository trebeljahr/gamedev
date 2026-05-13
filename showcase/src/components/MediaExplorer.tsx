"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ArtPack, ArtSample, MusicTrack, SoundCollection, SoundSample } from "@/lib/media";
import { artCreators, artThemes } from "@/lib/media";

type MediaExplorerProps = {
  soundCollections: SoundCollection[];
  musicTracks: MusicTrack[];
  artPacks: ArtPack[];
};

type View = "sounds" | "art";
type GroupMode = "theme" | "creator";

function licenseBucket(license: string): string {
  const lower = license.toLowerCase();
  if (lower.includes("cc0") || lower.includes("creative commons zero")) return "CC0";
  if (lower.includes("non-commercial")) return "Non-commercial";
  if (lower.includes("pixabay")) return "Pixabay";
  if (lower.includes("cc-by")) return "CC-BY";
  if (lower.includes("custom") || lower.includes("redistribution")) return "Custom";
  return "Varies";
}

function initials(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function sampleForUi(pack: ArtPack): ArtSample | undefined {
  return (
    pack.samples.find((sample) => sample.kind === "icon" || sample.kind === "ui") ??
    pack.samples.find((sample) => sample.kind === "character" || sample.kind === "sprite") ??
    pack.samples[0]
  );
}

function ArtCanvasRunner({ pack, sample }: { pack: ArtPack; sample?: ArtSample }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [playing, setPlaying] = useState(true);
  const [fps, setFps] = useState(10);
  const [columns, setColumns] = useState(4);
  const [rows, setRows] = useState(1);
  const [scale, setScale] = useState(3);
  const [flip, setFlip] = useState(false);
  const [background, setBackground] = useState("#15171c");

  useEffect(() => {
    setPlaying(true);
    setColumns(sample?.animated ? 4 : 1);
    setRows(1);
  }, [sample?.src, sample?.animated]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let frame = 0;
    let lastFrame = 0;
    let imageReady = false;
    let failed = false;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      imageReady = true;
    };
    image.onerror = () => {
      failed = true;
    };
    if (sample?.src) image.src = sample.src;
    else failed = true;

    function drawGrid() {
      if (!ctx || !canvas) return;
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "rgba(255,255,255,0.035)";
      const cell = 24;
      for (let x = 0; x < canvas.width; x += cell) ctx.fillRect(x, 0, 1, canvas.height);
      for (let y = 0; y < canvas.height; y += cell) ctx.fillRect(0, y, canvas.width, 1);
      ctx.fillStyle = "rgba(255,216,77,0.12)";
      ctx.fillRect(0, canvas.height - 72, canvas.width, 2);
    }

    function drawPlaceholder() {
      if (!ctx || !canvas) return;
      ctx.fillStyle = "rgba(255,255,255,0.07)";
      ctx.fillRect(canvas.width / 2 - 48, canvas.height / 2 - 48, 96, 96);
      ctx.strokeStyle = "rgba(255,216,77,0.65)";
      ctx.lineWidth = 2;
      ctx.strokeRect(canvas.width / 2 - 48, canvas.height / 2 - 48, 96, 96);
      ctx.fillStyle = "rgba(255,255,255,0.82)";
      ctx.font = "600 18px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(initials(pack.title) || "2D", canvas.width / 2, canvas.height / 2 + 6);
    }

    function tick(time: number) {
      drawGrid();
      const totalFrames = Math.max(1, columns * rows);
      if (playing && time - lastFrame >= 1000 / fps) {
        frame = (frame + 1) % totalFrames;
        lastFrame = time;
      }

      if (imageReady && !failed) {
        ctx.imageSmoothingEnabled = false;
        const frameWidth = Math.max(1, Math.floor(image.width / columns));
        const frameHeight = Math.max(1, Math.floor(image.height / rows));
        const sx = (frame % columns) * frameWidth;
        const sy = Math.floor(frame / columns) * frameHeight;
        const drawWidth = Math.min(frameWidth * scale, canvas.width * 0.82);
        const drawHeight = Math.min(frameHeight * scale, canvas.height * 0.74);
        const ratio = Math.min(drawWidth / frameWidth, drawHeight / frameHeight);
        const w = frameWidth * ratio;
        const h = frameHeight * ratio;
        const x = (canvas.width - w) / 2;
        const y = (canvas.height - h) / 2 - 8;
        ctx.save();
        if (flip) {
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(image, sx, sy, frameWidth, frameHeight, canvas.width - x - w, y, w, h);
        } else {
          ctx.drawImage(image, sx, sy, frameWidth, frameHeight, x, y, w, h);
        }
        ctx.restore();
      } else {
        drawPlaceholder();
      }

      ctx.fillStyle = "rgba(255,255,255,0.62)";
      ctx.font = "12px system-ui";
      ctx.textAlign = "left";
      ctx.fillText(`${sample?.label ?? "No sample"} · frame ${frame + 1}/${Math.max(1, columns * rows)}`, 16, canvas.height - 18);
      raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [background, columns, flip, fps, pack.title, playing, rows, sample?.label, sample?.src, scale]);

  return (
    <div className="art-runner">
      <canvas ref={canvasRef} width={720} height={420} />
      <div className="runner-controls">
        <button type="button" onClick={() => setPlaying((value) => !value)}>
          {playing ? "Pause" : "Play"}
        </button>
        <label>
          FPS
          <input type="range" min="1" max="24" value={fps} onChange={(event) => setFps(Number(event.target.value))} />
          <span>{fps}</span>
        </label>
        <label>
          Columns
          <input type="range" min="1" max="12" value={columns} onChange={(event) => setColumns(Number(event.target.value))} />
          <span>{columns}</span>
        </label>
        <label>
          Rows
          <input type="range" min="1" max="8" value={rows} onChange={(event) => setRows(Number(event.target.value))} />
          <span>{rows}</span>
        </label>
        <label>
          Scale
          <input type="range" min="1" max="8" value={scale} onChange={(event) => setScale(Number(event.target.value))} />
          <span>{scale}x</span>
        </label>
        <label className="inline-check">
          <input type="checkbox" checked={flip} onChange={(event) => setFlip(event.target.checked)} />
          Flip
        </label>
        <input aria-label="Canvas background" type="color" value={background} onChange={(event) => setBackground(event.target.value)} />
      </div>
    </div>
  );
}

function IconUiPreview({ sample, title }: { sample?: ArtSample; title: string }) {
  const icon = sample?.src;
  return (
    <div className="icon-ui-preview" aria-label="Sample interface preview">
      <div className="ui-topbar">
        <div className="ui-avatar">{icon ? <img src={icon} alt="" /> : initials(title)}</div>
        <div>
          <strong>{title}</strong>
          <span>Inventory test</span>
        </div>
      </div>
      <div className="ui-inventory">
        {Array.from({ length: 8 }).map((_, index) => (
          <div className="ui-slot" key={index}>
            {icon && index % 3 !== 2 ? <img src={icon} alt="" /> : <span />}
          </div>
        ))}
      </div>
      <div className="ui-hud">
        <button type="button">{icon ? <img src={icon} alt="" /> : null} Equip</button>
        <button type="button">Use</button>
      </div>
    </div>
  );
}

function ArtWorkbench({ pack }: { pack: ArtPack }) {
  const [sampleIndex, setSampleIndex] = useState(0);
  const selectedSample = pack.samples[sampleIndex];
  const uiSample = sampleForUi(pack);

  useEffect(() => {
    setSampleIndex(0);
  }, [pack.folder]);

  return (
    <section className="art-workbench">
      <div className="workbench-main">
        <div className="workbench-title">
          <div>
            <div className="vendor-tag">{pack.theme}</div>
            <h3>{pack.title}</h3>
          </div>
          <div className="media-detail">{pack.author} · {pack.samples.length} preview files</div>
        </div>
        <ArtCanvasRunner pack={pack} sample={selectedSample} />
      </div>
      <aside className="workbench-side">
        <label>
          Sample
          <select value={sampleIndex} onChange={(event) => setSampleIndex(Number(event.target.value))}>
            {pack.samples.length > 0 ? (
              pack.samples.map((sample, index) => (
                <option key={sample.path} value={index}>
                  {sample.label} · {sample.kind}
                </option>
              ))
            ) : (
              <option value={0}>No sample files</option>
            )}
          </select>
        </label>
        <IconUiPreview sample={uiSample} title={pack.title} />
        <div className="sample-strip">
          {pack.samples.slice(0, 6).map((sample, index) => (
            <button
              key={sample.path}
              type="button"
              className={index === sampleIndex ? "active" : ""}
              onClick={() => setSampleIndex(index)}
              title={sample.path}
            >
              <img src={sample.src} alt="" />
            </button>
          ))}
          {pack.samples.length === 0 && <div className="empty-preview">Manifest has metadata only.</div>}
        </div>
      </aside>
    </section>
  );
}

function ArtPackCard({
  pack,
  active,
  onSelect,
}: {
  pack: ArtPack;
  active: boolean;
  onSelect: () => void;
}) {
  const sample = sampleForUi(pack);
  return (
    <article className={`art-card ${active ? "active" : ""}`}>
      <button type="button" onClick={onSelect}>
        <div className="art-thumb">
          {sample ? <img src={sample.src} alt="" /> : <span>{initials(pack.title)}</span>}
        </div>
        <div className="art-card-body">
          <strong>{pack.title}</strong>
          <span>{pack.author} · {licenseBucket(pack.license_class)}</span>
          <small>{pack.samples.length > 0 ? `${pack.samples.length} previews` : "metadata only"}</small>
        </div>
      </button>
      <div className="media-actions">
        <span>{pack.attribution}</span>
        {pack.url && (
          <a href={pack.url} target="_blank" rel="noreferrer">
            source
          </a>
        )}
      </div>
    </article>
  );
}

function SoundPad({ collection }: { collection: SoundCollection }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [sample, setSample] = useState<SoundSample | undefined>(collection.samples[0]);
  const [volume, setVolume] = useState(0.8);
  const [rate, setRate] = useState(1);
  const [loop, setLoop] = useState(false);

  useEffect(() => {
    setSample(collection.samples[0]);
  }, [collection.id, collection.samples]);

  function play(next: SoundSample | undefined = sample) {
    if (!next) return;
    setSample(next);
    const audio = audioRef.current;
    if (!audio) return;
    audio.src = next.src;
    audio.volume = volume;
    audio.playbackRate = rate;
    audio.loop = loop;
    void audio.play();
  }

  return (
    <section className="sound-pad">
      <div className="sound-pad-head">
        <div>
          <h3>{collection.title}</h3>
          <div className="media-detail">{collection.source} · {collection.license}</div>
        </div>
        <button type="button" onClick={() => play()}>
          Play
        </button>
      </div>
      <audio ref={audioRef} controls preload="none" />
      <div className="sound-controls">
        <label>
          Volume
          <input type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => setVolume(Number(event.target.value))} />
        </label>
        <label>
          Speed
          <input type="range" min="0.5" max="1.5" step="0.05" value={rate} onChange={(event) => setRate(Number(event.target.value))} />
        </label>
        <label className="inline-check">
          <input type="checkbox" checked={loop} onChange={(event) => setLoop(event.target.checked)} />
          Loop
        </label>
      </div>
      <div className="sound-buttons">
        {collection.samples.length > 0 ? (
          collection.samples.map((item) => (
            <button key={item.path} type="button" className={item.path === sample?.path ? "active" : ""} onClick={() => play(item)}>
              <span>{item.kind}</span>
              {item.label}
            </button>
          ))
        ) : (
          <div className="empty-preview">No sample files in preview manifest.</div>
        )}
      </div>
    </section>
  );
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
  const [creatorFilter, setCreatorFilter] = useState("all");
  const [groupMode, setGroupMode] = useState<GroupMode>("theme");
  const [selectedArtFolder, setSelectedArtFolder] = useState(artPacks[0]?.folder ?? "");
  const [selectedSoundId, setSelectedSoundId] = useState(
    soundCollections.find((item) => item.samples.length > 0)?.id ?? soundCollections[0]?.id ?? "",
  );

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
      if (licenseFilter !== "all" && licenseBucket(pack.license_class) !== licenseFilter) return false;
      if (creatorFilter !== "all" && pack.author !== creatorFilter) return false;
      if (!q) return true;
      return `${pack.title} ${pack.author} ${pack.folder} ${pack.license_class} ${pack.theme}`
        .toLowerCase()
        .includes(q);
    });
  }, [artPacks, creatorFilter, licenseFilter, query]);

  const groupedArt = useMemo(() => {
    const labels =
      groupMode === "theme"
        ? artThemes
        : Array.from(new Set(filteredArt.map((pack) => pack.author))).sort();
    return labels
      .map((label) => ({
        label,
        packs: filteredArt.filter((pack) => (groupMode === "theme" ? pack.theme === label : pack.author === label)),
      }))
      .filter((group) => group.packs.length > 0);
  }, [filteredArt, groupMode]);

  useEffect(() => {
    if (!filteredArt.some((pack) => pack.folder === selectedArtFolder)) {
      setSelectedArtFolder(filteredArt[0]?.folder ?? "");
    }
  }, [filteredArt, selectedArtFolder]);

  useEffect(() => {
    if (!filteredSounds.some((item) => item.id === selectedSoundId)) {
      setSelectedSoundId(filteredSounds.find((item) => item.samples.length > 0)?.id ?? filteredSounds[0]?.id ?? "");
    }
  }, [filteredSounds, selectedSoundId]);

  const selectedArt = filteredArt.find((pack) => pack.folder === selectedArtFolder) ?? filteredArt[0] ?? artPacks[0];
  const selectedSound = filteredSounds.find((item) => item.id === selectedSoundId) ?? filteredSounds[0] ?? soundCollections[0];

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
          <button type="button" className={view === "sounds" ? "active" : ""} onClick={() => setView("sounds")}>
            Sounds
          </button>
          <button type="button" className={view === "art" ? "active" : ""} onClick={() => setView("art")}>
            2D art
          </button>
        </div>
      </section>

      <section className="media-tools" aria-label="Catalog filters">
        <input
          type="search"
          placeholder={view === "sounds" ? "Search sounds, folders, licenses" : "Search packs, creators, themes"}
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
          <>
            <select value={licenseFilter} onChange={(event) => setLicenseFilter(event.target.value)}>
              {artLicenses.map((license) => (
                <option key={license} value={license}>
                  {license === "all" ? "All licenses" : license}
                </option>
              ))}
            </select>
            <select value={creatorFilter} onChange={(event) => setCreatorFilter(event.target.value)}>
              <option value="all">All creators</option>
              {artCreators.map((creator) => (
                <option key={creator} value={creator}>
                  {creator}
                </option>
              ))}
            </select>
            <div className="media-tabs compact" aria-label="Grouping">
              <button type="button" className={groupMode === "theme" ? "active" : ""} onClick={() => setGroupMode("theme")}>
                Themes
              </button>
              <button type="button" className={groupMode === "creator" ? "active" : ""} onClick={() => setGroupMode("creator")}>
                Creators
              </button>
            </div>
          </>
        )}
      </section>

      {view === "sounds" ? (
        <div className="media-columns">
          <section className="media-panel">
            <h3>Sound effect groups</h3>
            <div className="media-list">
              {filteredSounds.map((item) => (
                <article className={`media-row ${item.id === selectedSoundId ? "active" : ""}`} key={item.id}>
                  <button type="button" className="row-button" onClick={() => setSelectedSoundId(item.id)}>
                    <div>
                      <div className="media-title">{item.title}</div>
                      <div className="media-detail">{item.path}</div>
                      {item.notes && <p>{item.notes}</p>}
                    </div>
                  </button>
                  <div className="media-actions">
                    <span>{item.samples.length} samples</span>
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

          <section className="media-panel sticky-panel">
            {selectedSound && <SoundPad collection={selectedSound} />}
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
        <div className="art-layout">
          {selectedArt && <ArtWorkbench pack={selectedArt} />}
          <section className="media-panel">
            <div className="panel-heading">
              <h3>2D art packs</h3>
              <span>{filteredArt.length} packs</span>
            </div>
            <div className="art-groups">
              {groupedArt.map((group) => (
                <section className="art-group" key={group.label}>
                  <h4>{group.label}</h4>
                  <div className="art-card-grid">
                    {group.packs.map((pack) => (
                      <ArtPackCard
                        key={pack.folder}
                        pack={pack}
                        active={pack.folder === selectedArtFolder}
                        onSelect={() => setSelectedArtFolder(pack.folder)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
