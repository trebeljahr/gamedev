"use client";

import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import type { ArtPack, ArtSample, MusicTrack, SoundCollection, SoundSample } from "@/lib/media";
import { artCreators } from "@/lib/media";
import { isLikelySpriteSheetPath } from "@/lib/media-inference";

type MediaExplorerProps = {
  soundCollections: SoundCollection[];
  musicTracks: MusicTrack[];
  artPacks: ArtPack[];
  initialView?: View;
  initialArtType?: ArtTypeFilter;
  initialSpriteSubject?: SpriteSubjectFilter;
  initialSpriteMotion?: SpriteMotionFilter;
  initialSoundType?: SoundTypeFilter;
};

type View = "sounds" | "art";
type GroupMode = "type" | "creator";
type ArtTypeFilter = "all" | "ui-icons" | "spritesheets";
type SpriteSubjectFilter = "all" | "characters" | "environments" | "effects-items" | "other";
type SpriteMotionFilter = "all" | "animated" | "static";
type SoundTypeFilter = "all" | "sfx" | "music";
type SpriteGrid = { cols: number; rows: number; confidence: number };
type SpriteRect = { x: number; y: number; w: number; h: number };

function isUsableSpriteGrid(grid: SpriteGrid): boolean {
  return grid.cols * grid.rows > 1 && grid.confidence >= 0.45;
}

function formatTime(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

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

function searchMatches(searchText: string, query: string): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  return terms.every((term) => searchText.includes(term));
}

function artTypeFor(pack: ArtPack): Exclude<ArtTypeFilter, "all"> {
  const sampleKinds = new Set(pack.samples.map((sample) => sample.kind));
  const uiOrIcons = pack.theme === "UI" || pack.theme === "Icons & Items";
  if (uiOrIcons || (sampleKinds.size > 0 && [...sampleKinds].every((kind) => kind === "ui" || kind === "icon"))) {
    return "ui-icons";
  }
  return "spritesheets";
}

function spriteSubjectFor(pack: ArtPack): Exclude<SpriteSubjectFilter, "all"> {
  const text = `${pack.theme} ${pack.title} ${pack.folder} ${pack.tags.join(" ")} ${pack.samples
    .map((sample) => `${sample.kind} ${sample.path}`)
    .join(" ")}`.toLowerCase();
  if (/(character|characters|enemy|enemies|animal|creature|hero|knight|warrior|mage|archer|monster|dino)/.test(text)) {
    return "characters";
  }
  if (/(environment|environments|tile|tileset|terrain|forest|dungeon|platform|ground|wall|props|nature|town)/.test(text)) {
    return "environments";
  }
  if (/(effect|fx|icon|item|inventory|weapon|coin|pickup|potion|spell|magic)/.test(text)) {
    return "effects-items";
  }
  return "other";
}

function spriteMotionFor(pack: ArtPack): Exclude<SpriteMotionFilter, "all"> {
  return pack.samples.some((sample) => sample.animated) ? "animated" : "static";
}

function artTaxonomyLabel(pack: ArtPack): string {
  if (artTypeFor(pack) === "ui-icons") return "UI / Icons";
  const subjects: Record<Exclude<SpriteSubjectFilter, "all">, string> = {
    characters: "Characters",
    environments: "Environments",
    "effects-items": "Effects & Items",
    other: "Other",
  };
  const motion = spriteMotionFor(pack) === "animated" ? "Animated" : "Static";
  return `Spritesheets / ${subjects[spriteSubjectFor(pack)]} / ${motion}`;
}

const ART_TAXONOMY_ORDER = [
  "UI / Icons",
  "Spritesheets / Characters / Animated",
  "Spritesheets / Characters / Static",
  "Spritesheets / Environments / Animated",
  "Spritesheets / Environments / Static",
  "Spritesheets / Effects & Items / Animated",
  "Spritesheets / Effects & Items / Static",
  "Spritesheets / Other / Animated",
  "Spritesheets / Other / Static",
];

function sampleImageBackground(imageData: ImageData) {
  const { width, height, data } = imageData;
  const corners = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ];
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  for (const [x, y] of corners) {
    const index = (y * width + x) * 4;
    r += data[index];
    g += data[index + 1];
    b += data[index + 2];
    a += data[index + 3];
  }
  return { r: r / 4, g: g / 4, b: b / 4, a: a / 4, transparent: a < 128 };
}

function isContentPixel(data: Uint8ClampedArray, index: number, bg: ReturnType<typeof sampleImageBackground>): boolean {
  const alpha = data[index + 3];
  if (bg.transparent) return alpha >= 32;
  if (alpha < 32) return false;
  const threshold = 20;
  return (
    Math.abs(data[index] - bg.r) >= threshold ||
    Math.abs(data[index + 1] - bg.g) >= threshold ||
    Math.abs(data[index + 2] - bg.b) >= threshold
  );
}

function detectPeriod(signal: Float32Array): { lag: number; score: number } {
  const n = signal.length;
  if (n < 32) return { lag: 0, score: 0 };

  let mean = 0;
  for (let i = 0; i < n; i++) mean += signal[i];
  mean /= n;

  let variance = 0;
  for (let i = 0; i < n; i++) {
    const d = signal[i] - mean;
    variance += d * d;
  }
  variance /= n;
  if (variance < 1e-8) return { lag: 0, score: 0 };

  const minLag = 8;
  const maxLag = Math.floor(n / 2);
  if (maxLag < minLag) return { lag: 0, score: 0 };

  const acf = new Float32Array(maxLag - minLag + 1);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    const end = n - lag;
    for (let i = 0; i < end; i++) {
      sum += (signal[i] - mean) * (signal[i + lag] - mean);
    }
    acf[lag - minLag] = sum / (end * variance);
  }

  const peaks: Array<{ lag: number; score: number }> = [];
  for (let i = 1; i < acf.length - 1; i++) {
    if (acf[i] > acf[i - 1] && acf[i] >= acf[i + 1] && acf[i] > 0.2) {
      peaks.push({ lag: i + minLag, score: acf[i] });
    }
  }
  if (peaks.length === 0) return { lag: 0, score: 0 };

  let best = peaks[0];
  for (const peak of peaks) if (peak.score > best.score) best = peak;

  for (let div = 2; div <= 8; div++) {
    const candidate = Math.round(best.lag / div);
    if (candidate < minLag) break;
    const idx = candidate - minLag;
    if (idx < 0 || idx >= acf.length) continue;
    let localBest = -Infinity;
    for (let d = -1; d <= 1; d++) {
      const j = idx + d;
      if (j >= 0 && j < acf.length) localBest = Math.max(localBest, acf[j]);
    }
    if (localBest >= best.score * 0.8) {
      best = { lag: candidate, score: localBest };
    }
  }

  return best;
}

function detectGridFromImageData(imageData: ImageData): SpriteGrid {
  const { width, height, data } = imageData;
  const bg = sampleImageBackground(imageData);
  const rowActivity = new Float32Array(height);
  const colActivity = new Float32Array(width);

  for (let y = 0; y < height; y++) {
    let count = 0;
    for (let x = 0; x < width; x++) {
      if (isContentPixel(data, (y * width + x) * 4, bg)) count++;
    }
    rowActivity[y] = count / width;
  }
  for (let x = 0; x < width; x++) {
    let count = 0;
    for (let y = 0; y < height; y++) {
      if (isContentPixel(data, (y * width + x) * 4, bg)) count++;
    }
    colActivity[x] = count / height;
  }

  const rowPeriod = detectPeriod(rowActivity);
  const colPeriod = detectPeriod(colActivity);
  if (rowPeriod.lag > 0 && colPeriod.lag > 0) {
    const rows = Math.max(1, Math.round(height / rowPeriod.lag));
    const cols = Math.max(1, Math.round(width / colPeriod.lag));
    if (rows <= 32 && cols <= 32) {
      return { cols, rows, confidence: 0.5 + Math.min(rowPeriod.score, colPeriod.score) * 0.4 };
    }
  }

  const countCells = (activity: Float32Array): number => {
    const isGap = Array.from(activity, (value) => value < 0.01);
    let start = 0;
    while (start < isGap.length && isGap[start]) start++;
    let end = isGap.length - 1;
    while (end >= start && isGap[end]) end--;
    if (start > end) return 1;
    const gaps: number[] = [];
    let gap = 0;
    for (let i = start; i <= end; i++) {
      if (isGap[i]) {
        gap++;
      } else if (gap > 0) {
        gaps.push(gap);
        gap = 0;
      }
    }
    if (gaps.length === 0) return 1;
    const threshold = Math.max(1, Math.floor(Math.max(...gaps) * 0.5));
    return gaps.filter((g) => g >= threshold).length + 1;
  };

  const rows = countCells(rowActivity);
  const cols = countCells(colActivity);
  if (rows >= 1 && cols >= 1 && rows <= 32 && cols <= 32) {
    return { cols, rows, confidence: 0.6 };
  }

  for (const size of [16, 24, 32, 48, 64, 96, 128, 192, 256]) {
    if (width % size === 0 && height % size === 0) {
      return { cols: width / size, rows: height / size, confidence: 0.4 };
    }
  }

  return { cols: 1, rows: 1, confidence: 0 };
}

function computeTrimRect(imageData: ImageData, source: SpriteRect, bg: ReturnType<typeof sampleImageBackground>): SpriteRect {
  const { width, data } = imageData;
  let minX = source.x + source.w;
  let minY = source.y + source.h;
  let maxX = source.x - 1;
  let maxY = source.y - 1;

  for (let y = source.y; y < source.y + source.h; y++) {
    for (let x = source.x; x < source.x + source.w; x++) {
      if (isContentPixel(data, (y * width + x) * 4, bg)) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) return source;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function ArtCanvasRunner({ pack, sample }: { pack: ArtPack; sample?: ArtSample }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [columns, setColumns] = useState(4);
  const [rows, setRows] = useState(1);
  const [autoDetect, setAutoDetect] = useState(true);
  const [detectedGrid, setDetectedGrid] = useState<SpriteGrid | null>(null);
  const [scale, setScale] = useState(3);
  const [flip, setFlip] = useState(false);
  const [background, setBackground] = useState("#15171c");

  useEffect(() => {
    setPlaying(Boolean(sample?.animated && isLikelySpriteSheetPath(sample.path)));
    setColumns(1);
    setRows(1);
    setAutoDetect(true);
    setDetectedGrid(null);
  }, [sample?.animated, sample?.path, sample?.src]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const drawingCanvas = canvas;
    const context = ctx;

    let raf = 0;
    let frame = 0;
    let lastFrame = 0;
    let imageReady = false;
    let failed = false;
    let imageData: ImageData | null = null;
    let bgSample: ReturnType<typeof sampleImageBackground> | null = null;
    const trimCache = new Map<number, SpriteRect>();
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      imageReady = true;
      try {
        const scratch = document.createElement("canvas");
        scratch.width = image.naturalWidth || image.width;
        scratch.height = image.naturalHeight || image.height;
        const scratchCtx = scratch.getContext("2d", { willReadFrequently: true });
        if (!scratchCtx) return;
        scratchCtx.drawImage(image, 0, 0);
        imageData = scratchCtx.getImageData(0, 0, scratch.width, scratch.height);
        bgSample = sampleImageBackground(imageData);
        const detected = detectGridFromImageData(imageData);
        const canAnimateSample = sample ? sample.animated && isLikelySpriteSheetPath(sample.path) : false;
        const stripFallback = (() => {
          if (!canAnimateSample || isUsableSpriteGrid(detected)) return detected;
          const wide = Math.round(imageData.width / imageData.height);
          if (wide >= 2 && wide <= 32) return { cols: wide, rows: 1, confidence: 0.55 };
          const tall = Math.round(imageData.height / imageData.width);
          if (tall >= 2 && tall <= 32) return { cols: 1, rows: tall, confidence: 0.55 };
          return detected;
        })();
        setDetectedGrid(stripFallback);
        if (autoDetect && canAnimateSample && isUsableSpriteGrid(stripFallback)) {
          setColumns(stripFallback.cols);
          setRows(stripFallback.rows);
        } else if (autoDetect) {
          setColumns(1);
          setRows(1);
          setPlaying(false);
        }
      } catch {
        setDetectedGrid(null);
      }
    };
    image.onerror = () => {
      failed = true;
    };
    if (sample?.src) image.src = sample.src;
    else failed = true;

    function drawGrid() {
      context.fillStyle = background;
      context.fillRect(0, 0, drawingCanvas.width, drawingCanvas.height);
      context.fillStyle = "rgba(255,255,255,0.035)";
      const cell = 24;
      for (let x = 0; x < drawingCanvas.width; x += cell) context.fillRect(x, 0, 1, drawingCanvas.height);
      for (let y = 0; y < drawingCanvas.height; y += cell) context.fillRect(0, y, drawingCanvas.width, 1);
      context.fillStyle = "rgba(255,216,77,0.12)";
      context.fillRect(0, drawingCanvas.height - 72, drawingCanvas.width, 2);
    }

    function drawPlaceholder() {
      context.fillStyle = "rgba(255,255,255,0.07)";
      context.fillRect(drawingCanvas.width / 2 - 48, drawingCanvas.height / 2 - 48, 96, 96);
      context.strokeStyle = "rgba(255,216,77,0.65)";
      context.lineWidth = 2;
      context.strokeRect(drawingCanvas.width / 2 - 48, drawingCanvas.height / 2 - 48, 96, 96);
      context.fillStyle = "rgba(255,255,255,0.82)";
      context.font = "600 18px system-ui";
      context.textAlign = "center";
      context.fillText(initials(pack.title) || "2D", drawingCanvas.width / 2, drawingCanvas.height / 2 + 6);
    }

    function tick(time: number) {
      drawGrid();
      const totalFrames = Math.max(1, columns * rows);
      const isSpriteSheet = sample?.animated && totalFrames > 1;
      if (playing && time - lastFrame >= 1000 / (10 * speed)) {
        frame = (frame + 1) % totalFrames;
        lastFrame = time;
      }

      if (imageReady && !failed) {
        context.imageSmoothingEnabled = false;
        const frameWidth = isSpriteSheet ? Math.max(1, Math.floor(image.width / columns)) : image.width;
        const frameHeight = isSpriteSheet ? Math.max(1, Math.floor(image.height / rows)) : image.height;
        const source: SpriteRect = {
          x: isSpriteSheet ? (frame % columns) * frameWidth : 0,
          y: isSpriteSheet ? Math.floor(frame / columns) * frameHeight : 0,
          w: frameWidth,
          h: frameHeight,
        };
        const drawSource =
          imageData && bgSample
            ? trimCache.get(frame) ??
              (() => {
                const rect = computeTrimRect(imageData, source, bgSample);
                trimCache.set(frame, rect);
                return rect;
              })()
            : source;
        const drawWidth = Math.min(drawSource.w * scale, drawingCanvas.width * 0.82);
        const drawHeight = Math.min(drawSource.h * scale, drawingCanvas.height * 0.74);
        const ratio = Math.min(drawWidth / drawSource.w, drawHeight / drawSource.h);
        const w = drawSource.w * ratio;
        const h = drawSource.h * ratio;
        const x = (drawingCanvas.width - w) / 2;
        const y = (drawingCanvas.height - h) / 2 - 8;
        context.save();
        if (flip) {
          context.translate(drawingCanvas.width, 0);
          context.scale(-1, 1);
          context.drawImage(image, drawSource.x, drawSource.y, drawSource.w, drawSource.h, drawingCanvas.width - x - w, y, w, h);
        } else {
          context.drawImage(image, drawSource.x, drawSource.y, drawSource.w, drawSource.h, x, y, w, h);
        }
        context.restore();
      } else {
        drawPlaceholder();
      }

      context.fillStyle = "rgba(255,255,255,0.62)";
      context.font = "12px system-ui";
      context.textAlign = "left";
      const status = totalFrames > 1 ? `frame ${frame + 1}/${totalFrames}` : "static";
      context.fillText(`${sample?.label ?? "No sample"} · ${status}`, 16, drawingCanvas.height - 18);
      raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [autoDetect, background, columns, flip, pack.title, playing, rows, sample?.animated, sample?.label, sample?.path, sample?.src, scale, speed]);

  const detectionLabel = detectedGrid
    ? `auto ${detectedGrid.cols}x${detectedGrid.rows} (${Math.round(detectedGrid.confidence * 100)}%)`
    : "auto";

  return (
    <div className="art-runner">
      <canvas ref={canvasRef} width={720} height={420} />
      <div className="runner-controls">
        <button type="button" onClick={() => setPlaying((value) => !value)}>
          {playing ? "Pause" : "Play"}
        </button>
        <label>
          Speed
          <input
            aria-label="Animation speed"
            type="range"
            min="0.25"
            max="3"
            step="0.25"
            value={speed}
            onChange={(event) => setSpeed(Number(event.target.value))}
          />
          <span>{speed.toFixed(2)}x</span>
        </label>
        <label className="inline-check">
          <input type="checkbox" checked={autoDetect} onChange={(event) => setAutoDetect(event.target.checked)} />
          {detectionLabel}
        </label>
        <label>
          Columns
          <input
            aria-label="Sprite sheet columns"
            type="range"
            min="1"
            max="12"
            value={columns}
            onChange={(event) => {
              setAutoDetect(false);
              setColumns(Number(event.target.value));
            }}
          />
          <span>{columns}</span>
        </label>
        <label>
          Rows
          <input
            aria-label="Sprite sheet rows"
            type="range"
            min="1"
            max="8"
            value={rows}
            onChange={(event) => {
              setAutoDetect(false);
              setRows(Number(event.target.value));
            }}
          />
          <span>{rows}</span>
        </label>
        <label>
          Scale
          <input
            aria-label="Sprite preview scale"
            type="range"
            min="1"
            max="8"
            value={scale}
            onChange={(event) => setScale(Number(event.target.value))}
          />
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
            <p className="workbench-description">{pack.description}</p>
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
          <small>{pack.tags.slice(0, 3).join(" · ")}</small>
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

function AudioPlayer({
  src,
  title,
  detail,
  volume = 0.8,
  rate = 1,
  loop = false,
  playSignal = 0,
  compact = false,
}: {
  src: string | undefined;
  title: string;
  detail?: string;
  volume?: number;
  rate?: number;
  loop?: boolean;
  playSignal?: number;
  compact?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const progressStyle = { "--progress": `${progress}%` } as CSSProperties;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.playbackRate = rate;
    audio.loop = loop;
  }, [loop, rate, volume]);

  useEffect(() => {
    setCurrentTime(0);
    setDuration(0);
    setPlaying(false);
  }, [src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !src || playSignal === 0) return;
    audio.currentTime = 0;
    const playPromise = audio.play();
    void playPromise?.catch(() => setPlaying(false));
  }, [playSignal, src]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio || !src) return;
    if (audio.paused) {
      void audio.play().catch(() => setPlaying(false));
    } else {
      audio.pause();
    }
  }

  function seek(value: number) {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(duration)) return;
    audio.currentTime = value;
    setCurrentTime(value);
  }

  return (
    <div className={`audio-player ${compact ? "compact" : ""} ${playing ? "playing" : ""}`}>
      <audio
        ref={audioRef}
        preload="none"
        src={src}
        onDurationChange={(event) => setDuration(event.currentTarget.duration || 0)}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrentTime(0);
        }}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
      />
      <button className="transport-button" type="button" onClick={togglePlay} disabled={!src} aria-label={playing ? "Pause audio" : "Play audio"}>
        <span className={playing ? "pause-glyph" : "play-glyph"} aria-hidden="true" />
      </button>
      <div className="audio-main">
        <div className="audio-meta">
          <div>
            <span>{playing ? "Playing" : "Ready"}</span>
            <strong>{title}</strong>
            {detail && <small>{detail}</small>}
          </div>
          <div className="audio-time">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>
        </div>
        <div className="audio-strip">
          <div className="audio-bars" aria-hidden="true">
            {Array.from({ length: 18 }, (_, index) => (
              <span key={index} style={{ "--bar-index": index, "--bar-height": `${20 + (index % 6) * 11}%` } as CSSProperties} />
            ))}
          </div>
          <input
            aria-label={`Seek ${title}`}
            className="audio-seeker"
            type="range"
            min="0"
            max={duration || 0}
            step="0.01"
            value={duration ? currentTime : 0}
            style={progressStyle}
            onChange={(event) => seek(Number(event.target.value))}
            disabled={!src || duration <= 0}
          />
        </div>
      </div>
    </div>
  );
}

function SoundPad({ collection }: { collection: SoundCollection }) {
  const [sample, setSample] = useState<SoundSample | undefined>(collection.samples[0]);
  const [volume, setVolume] = useState(0.8);
  const [rate, setRate] = useState(1);
  const [loop, setLoop] = useState(false);
  const [playSignal, setPlaySignal] = useState(0);

  useEffect(() => {
    setSample(collection.samples[0]);
    setPlaySignal(0);
  }, [collection.id, collection.samples]);

  function play(next: SoundSample | undefined = sample) {
    if (!next) return;
    setSample(next);
    setPlaySignal((value) => value + 1);
  }

  return (
    <section className="sound-pad">
      <div className="sound-pad-head">
        <div>
          <h3>{collection.title}</h3>
          <div className="media-detail">{collection.source} · {collection.license}</div>
        </div>
      </div>
      <AudioPlayer
        src={sample?.src}
        title={sample?.label ?? "No sample selected"}
        detail={sample ? `${sample.kind} · ${sample.path.split("/").pop()}` : undefined}
        volume={volume}
        rate={rate}
        loop={loop}
        playSignal={playSignal}
      />
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
  initialView = "sounds",
  initialArtType = "all",
  initialSpriteSubject = "all",
  initialSpriteMotion = "all",
  initialSoundType = "sfx",
}: MediaExplorerProps) {
  const [view, setView] = useState<View>(initialView);
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [licenseFilter, setLicenseFilter] = useState("all");
  const [creatorFilter, setCreatorFilter] = useState("all");
  const [groupMode, setGroupMode] = useState<GroupMode>("type");
  const [artTypeFilter, setArtTypeFilter] = useState<ArtTypeFilter>(initialArtType);
  const [spriteSubjectFilter, setSpriteSubjectFilter] = useState<SpriteSubjectFilter>(initialSpriteSubject);
  const [spriteMotionFilter, setSpriteMotionFilter] = useState<SpriteMotionFilter>(initialSpriteMotion);
  const [soundTypeFilter, setSoundTypeFilter] = useState<SoundTypeFilter>(initialSoundType);
  const [soundCategoryFilter, setSoundCategoryFilter] = useState("all");
  const [selectedArtFolder, setSelectedArtFolder] = useState(artPacks[0]?.folder ?? "");
  const [selectedSoundId, setSelectedSoundId] = useState(
    soundCollections.find((item) => item.samples.length > 0)?.id ?? soundCollections[0]?.id ?? "",
  );

  const soundSources = useMemo(
    () => ["all", ...Array.from(new Set(soundCollections.map((s) => s.source))).sort()],
    [soundCollections],
  );

  const soundCategories = useMemo(
    () => ["all", ...Array.from(new Set(soundCollections.map((collection) => collection.category))).sort()],
    [soundCollections],
  );

  const artLicenses = useMemo(
    () => ["all", ...Array.from(new Set(artPacks.map((p) => licenseBucket(p.license_class))))],
    [artPacks],
  );

  const filteredSounds = useMemo(() => {
    if (soundTypeFilter === "music") return [];
    const q = query.trim().toLowerCase();
    return soundCollections.filter((item) => {
      if (sourceFilter !== "all" && item.source !== sourceFilter) return false;
      if (soundCategoryFilter !== "all" && item.category !== soundCategoryFilter) return false;
      return searchMatches(item.searchText, q);
    });
  }, [query, soundCategoryFilter, soundCollections, soundTypeFilter, sourceFilter]);

  const filteredMusic = useMemo(() => {
    if (soundTypeFilter === "sfx") return [];
    const q = query.trim().toLowerCase();
    return musicTracks.filter((track) => searchMatches(track.searchText, q));
  }, [musicTracks, query, soundTypeFilter]);

  const filteredArt = useMemo(() => {
    const q = query.trim().toLowerCase();
    return artPacks.filter((pack) => {
      if (licenseFilter !== "all" && licenseBucket(pack.license_class) !== licenseFilter) return false;
      if (creatorFilter !== "all" && pack.author !== creatorFilter) return false;
      const artType = artTypeFor(pack);
      if (artTypeFilter !== "all" && artType !== artTypeFilter) return false;
      if (artType === "spritesheets") {
        if (spriteSubjectFilter !== "all" && spriteSubjectFor(pack) !== spriteSubjectFilter) return false;
        if (spriteMotionFilter !== "all" && spriteMotionFor(pack) !== spriteMotionFilter) return false;
      }
      return searchMatches(pack.searchText, q);
    });
  }, [artPacks, artTypeFilter, creatorFilter, licenseFilter, query, spriteMotionFilter, spriteSubjectFilter]);

  const groupedArt = useMemo(() => {
    const labels =
      groupMode === "type"
        ? ART_TAXONOMY_ORDER
        : Array.from(new Set(filteredArt.map((pack) => pack.author))).sort();
    return labels
      .map((label) => ({
        label,
        packs: filteredArt.filter((pack) => (groupMode === "type" ? artTaxonomyLabel(pack) === label : pack.author === label)),
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
          {artPacks.length} 2D packs · {soundCollections.length} sound effect groups · {musicTracks.length} music tracks
        </div>
      </header>

      <section className="media-hero">
        <div>
          <div className="vendor-tag">Library</div>
          <h2>Browse 2D art and sounds under the same asset taxonomy as the 3D library.</h2>
        </div>
        <div className="media-tabs" role="tablist" aria-label="Media type">
          <a href="/" role="tab" aria-selected="false">
            3D
          </a>
          <button
            type="button"
            role="tab"
            aria-selected={view === "art"}
            className={view === "art" ? "active" : ""}
            onClick={() => setView("art")}
          >
            2D
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "sounds"}
            className={view === "sounds" ? "active" : ""}
            onClick={() => setView("sounds")}
          >
            Sounds
          </button>
        </div>
      </section>

      <section className="media-tools" aria-label="Catalog filters">
        <input
          type="search"
          placeholder={
            view === "sounds"
              ? "Search sounds, music, moods, folders, licenses"
              : "Search packs, creators, themes, use cases"
          }
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {view === "sounds" ? (
          <>
            <select value={soundTypeFilter} onChange={(event) => setSoundTypeFilter(event.target.value as SoundTypeFilter)}>
              <option value="sfx">Sound effects</option>
              <option value="music">Music</option>
              <option value="all">All sounds</option>
            </select>
            {soundTypeFilter !== "music" && (
              <>
                <select value={soundCategoryFilter} onChange={(event) => setSoundCategoryFilter(event.target.value)}>
                  {soundCategories.map((category) => (
                    <option key={category} value={category}>
                      {category === "all" ? "All SFX categories" : category}
                    </option>
                  ))}
                </select>
                <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
                  {soundSources.map((source) => (
                    <option key={source} value={source}>
                      {source === "all" ? "All sources" : source}
                    </option>
                  ))}
                </select>
              </>
            )}
          </>
        ) : (
          <>
            <select
              value={artTypeFilter}
              onChange={(event) => {
                const value = event.target.value as ArtTypeFilter;
                setArtTypeFilter(value);
                if (value === "ui-icons") {
                  setSpriteSubjectFilter("all");
                  setSpriteMotionFilter("all");
                }
              }}
            >
              <option value="all">All 2D</option>
              <option value="ui-icons">UI / Icons</option>
              <option value="spritesheets">Spritesheets</option>
            </select>
            {artTypeFilter !== "ui-icons" && (
              <>
                <select value={spriteSubjectFilter} onChange={(event) => setSpriteSubjectFilter(event.target.value as SpriteSubjectFilter)}>
                  <option value="all">All sprite subjects</option>
                  <option value="characters">Characters</option>
                  <option value="environments">Environments</option>
                  <option value="effects-items">Effects & items</option>
                  <option value="other">Other spritesheets</option>
                </select>
                <select value={spriteMotionFilter} onChange={(event) => setSpriteMotionFilter(event.target.value as SpriteMotionFilter)}>
                  <option value="all">Animated + static</option>
                  <option value="animated">Animated</option>
                  <option value="static">Static</option>
                </select>
              </>
            )}
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
            <div className="media-tabs compact" role="tablist" aria-label="Grouping">
              <button
                type="button"
                role="tab"
                aria-selected={groupMode === "type"}
                className={groupMode === "type" ? "active" : ""}
                onClick={() => setGroupMode("type")}
              >
                Types
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={groupMode === "creator"}
                className={groupMode === "creator" ? "active" : ""}
                onClick={() => setGroupMode("creator")}
              >
                Creators
              </button>
            </div>
          </>
        )}
      </section>

      {view === "sounds" ? (
        <div className={soundTypeFilter === "music" ? "media-single-column" : "media-columns"}>
          {soundTypeFilter !== "music" && (
            <section className="media-panel">
              <h3>Sound effects</h3>
              <div className="media-list">
                {filteredSounds.map((item) => (
                  <article className={`media-row ${item.id === selectedSoundId ? "active" : ""}`} key={item.id}>
                    <button type="button" className="row-button" onClick={() => setSelectedSoundId(item.id)}>
                      <div>
                        <div className="media-title">{item.title}</div>
                        <div className="media-detail">{item.category} · {item.path}</div>
                        <p>{item.description}</p>
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
          )}

          {soundTypeFilter !== "music" && (
            <section className="media-panel sticky-panel">
              {selectedSound && <SoundPad collection={selectedSound} />}
              {soundTypeFilter === "all" && filteredMusic.length > 0 && (
                <>
                  <h3>Music</h3>
                  <div className="track-list">
                    {filteredMusic.map((track) => (
                      <article className="track-row" key={track.path}>
                        <AudioPlayer src={track.src} title={track.title} detail={`${track.source} · ${track.license}`} compact />
                        <p>{track.description}</p>
                      </article>
                    ))}
                  </div>
                </>
              )}
            </section>
          )}

          {soundTypeFilter === "music" && (
            <section className="media-panel">
              <div className="panel-heading">
                <h3>Music</h3>
                <span>{filteredMusic.length} tracks</span>
              </div>
              <div className="track-list">
                {filteredMusic.map((track) => (
                  <article className="track-row" key={track.path}>
                    <AudioPlayer src={track.src} title={track.title} detail={`${track.source} · ${track.license}`} compact />
                    <p>{track.description}</p>
                    <div className="inline-tags">
                      {track.tags.slice(0, 5).map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
        </div>
      ) : view === "art" ? (
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
      ) : null}
    </div>
  );
}
