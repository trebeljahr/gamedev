"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  LandingModelBackdrop,
  type LandingModelPreviewItem,
} from "@/components/LandingModelBackdrop";
import { waveformPath } from "@/lib/loudness";

export type LibraryModelPreview = LandingModelPreviewItem;

export type LibrarySpriteCategory = "character" | "environment" | "icons";

export type LibrarySpritePreview = {
  category: LibrarySpriteCategory;
  categoryLabel: string;
  title: string;
  theme: string;
  label: string;
  kind: string;
  animated: boolean;
  src: string;
  path: string;
};

export type LibrarySoundTone = "music" | "sfx" | "jingle";

export type LibrarySoundPreview = {
  title: string;
  source: string;
  path: string;
  duration: number;
  loudness: number[];
  tone: LibrarySoundTone;
  collectionLabel: string;
};

type SpriteLayout = { cols: number; rows: number; startFrame: number; frameCount: number };

function parseSingleRowLayout(
  path: string,
  image: HTMLImageElement,
): SpriteLayout {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const lower = path.toLowerCase();

  // Build-generated sheets encode the per-frame pixel size in the filename
  // (`__strip-<frameW>x<frameH>.sheet.png`) and lay every frame out row-major
  // across the grid, so trust that size and play all cells in order.
  const buildSheet = lower.match(/__strip-(\d+)x(\d+)\.sheet\.png(?:[?#].*)?$/);
  if (buildSheet) {
    const frameWidth = Number(buildSheet[1]);
    const frameHeight = Number(buildSheet[2]);
    if (frameWidth > 0 && frameHeight > 0) {
      const cols = Math.max(1, Math.round(width / frameWidth));
      const rows = Math.max(1, Math.round(height / frameHeight));
      return { cols, rows, startFrame: 0, frameCount: cols * rows };
    }
  }

  const strip = lower.match(/strip[\s_-]*(\d{1,2})/);
  if (strip) {
    const cols = Math.max(2, Number(strip[1]));
    return { cols, rows: 1, startFrame: 0, frameCount: cols };
  }

  const sizeHint = lower.match(/(^|[^0-9])(\d{2,4})\s*x\s*(\d{2,4})([^0-9]|$)/);
  if (sizeHint) {
    const frameWidth = Number(sizeHint[2]);
    const frameHeight = Number(sizeHint[3]);
    if (frameWidth > 0 && frameHeight > 0 && width % frameWidth === 0 && height % frameHeight === 0) {
      const cols = Math.max(1, Math.min(32, width / frameWidth));
      const rows = Math.max(1, Math.min(24, height / frameHeight));
      const row = pickDemoRow(rows, path);
      return { cols, rows, startFrame: row * cols, frameCount: cols };
    }
  }

  const wideRatio = width / Math.max(1, height);
  const tallRatio = height / Math.max(1, width);
  if (wideRatio >= 1.75) {
    const cols = Math.max(2, Math.min(32, Math.round(wideRatio)));
    return { cols, rows: 1, startFrame: 0, frameCount: cols };
  }
  if (tallRatio >= 1.75) {
    const rows = Math.max(2, Math.min(24, Math.round(tallRatio)));
    const row = pickDemoRow(rows, path);
    return { cols: 1, rows, startFrame: row, frameCount: 1 };
  }

  if (/sprite\s*sheet|spritesheet|sheet/.test(lower)) {
    const wide = width >= height;
    const cols = wide ? 4 : 2;
    const rows = wide ? 2 : 4;
    const row = pickDemoRow(rows, path);
    return { cols, rows, startFrame: row * cols, frameCount: cols };
  }

  return { cols: 1, rows: 1, startFrame: 0, frameCount: 1 };
}

function pickDemoRow(rows: number, path: string): number {
  if (rows <= 1) return 0;
  let hash = 2166136261;
  for (let i = 0; i < path.length; i += 1) {
    hash ^= path.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % rows;
}

function drawChecker(context: CanvasRenderingContext2D, width: number, height: number) {
  context.fillStyle = "#111318";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "rgba(255,255,255,0.052)";
  const size = 16;
  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size) {
      if ((x / size + y / size) % 2 === 0) context.fillRect(x, y, size, size);
    }
  }
}

function drawFrame(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  layout: SpriteLayout,
  frame: number,
  width: number,
  height: number,
) {
  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;
  const count = Math.max(1, layout.frameCount);
  const cell = layout.startFrame + (((frame % count) + count) % count);
  const col = cell % layout.cols;
  const row = Math.floor(cell / layout.cols);
  const sourceWidth = Math.floor(imageWidth / layout.cols);
  const sourceHeight = Math.floor(imageHeight / layout.rows);
  const sourceX = col * sourceWidth;
  const sourceY = row * sourceHeight;
  const maxWidth = width * 0.92;
  const maxHeight = height * 0.88;
  const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const drawX = (width - drawWidth) / 2;
  const drawY = (height - drawHeight) / 2;

  context.imageSmoothingEnabled = false;
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    drawX,
    drawY,
    drawWidth,
    drawHeight,
  );
}

const SHEET_PNG_PATTERN = /__strip-\d+x\d+\.sheet\.png(\?.*)?$/i;

function deriveGifFallback(url: string): string | null {
  const match = url.match(/^(.+)__strip-\d+x\d+\.sheet\.png(\?.*)?$/i);
  if (!match) return null;
  return `${match[1]}.gif${match[2] ?? ""}`;
}

export function SpriteLoop({ sample, index }: { sample: LibrarySpritePreview; index: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [frameCount, setFrameCount] = useState(1);
  const [imageSrc, setImageSrc] = useState(sample.src);
  const fallbackTriedRef = useRef(false);
  const isStripSheet = SHEET_PNG_PATTERN.test(sample.src);
  // Track the live source: when the strip sheet fails (e.g. the .sheet.png is
  // missing from the CDN) we fall back to the original .gif, which must render
  // as a native <img> so it animates — drawing a gif onto canvas only shows a
  // single static frame.
  const gif = /\.gif($|[?#])/i.test(imageSrc) || (failed && !isStripSheet);
  const renderAsImage = gif || !sample.animated;

  useEffect(() => {
    setImageSrc(sample.src);
    setFailed(false);
    fallbackTriedRef.current = false;
  }, [sample.src]);

  useEffect(() => {
    if (renderAsImage) return;

    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const drawingCanvas = canvas;
    const drawingContext = context;

    let cancelled = false;
    let raf = 0;
    let frame = 0;
    let lastFrame = 0;
    const image = new Image();

    image.onload = () => {
      if (cancelled) return;
      const layout = parseSingleRowLayout(sample.path, image);
      setFrameCount(layout.frameCount);
      setFailed(false);

      function tick(time: number) {
        drawChecker(drawingContext, drawingCanvas.width, drawingCanvas.height);
        if (time - lastFrame > 1000 / (sample.kind === "effect" ? 14 : 10)) {
          frame = (frame + 1) % layout.frameCount;
          lastFrame = time;
        }
        drawFrame(drawingContext, image, layout, frame, drawingCanvas.width, drawingCanvas.height);
        raf = requestAnimationFrame(tick);
      }

      raf = requestAnimationFrame(tick);
    };

    image.onerror = () => {
      if (cancelled) return;
      if (!fallbackTriedRef.current) {
        const fallback = deriveGifFallback(imageSrc);
        if (fallback && fallback !== imageSrc) {
          fallbackTriedRef.current = true;
          setImageSrc(fallback);
          return;
        }
      }
      setFailed(true);
    };
    image.src = imageSrc;

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [renderAsImage, sample.kind, sample.path, imageSrc]);

  const handleImgError = () => {
    if (fallbackTriedRef.current) return;
    const fallback = deriveGifFallback(imageSrc);
    if (!fallback || fallback === imageSrc) return;
    fallbackTriedRef.current = true;
    setImageSrc(fallback);
  };

  const animatedFlag =
    sample.animated && (sample.category === "character" || sample.category === "icons");
  const subline = animatedFlag
    ? frameCount > 1
      ? `${frameCount} frames`
      : "Animated"
    : sample.theme;

  return (
    <article
      className="library-tile"
      data-category={sample.category}
      style={{ "--sprite-delay": `${index * 120}ms` } as CSSProperties}
    >
      <div className="library-tile-chip">
        <span>2D</span>
        <strong>{sample.categoryLabel}</strong>
      </div>
      <div className="library-tile-stage">
        {renderAsImage || failed ? (
          <img src={imageSrc} alt="" onError={handleImgError} />
        ) : (
          <canvas
            ref={canvasRef}
            width={240}
            height={156}
            aria-label={`${sample.label} animated sprite preview`}
          />
        )}
      </div>
      <div className="library-tile-meta">
        <strong>{sample.label}</strong>
        <small>{subline}</small>
      </div>
    </article>
  );
}

function SoundEnvelope({
  sound,
  index,
  colorByIndex,
}: {
  sound: LibrarySoundPreview;
  index: number;
  colorByIndex?: boolean;
}) {
  const path = useMemo(() => waveformPath(sound.loudness), [sound.loudness]);

  return (
    <div
      className="library-signal-row"
      data-tone={sound.tone}
      data-variant={colorByIndex ? index % 5 : undefined}
      style={{ "--signal-delay": `${index * 140}ms` } as CSSProperties}
    >
      <div className="library-signal-meta">
        <strong>{sound.title}</strong>
        <small>
          {sound.collectionLabel} · {formatDuration(sound.duration)}
        </small>
      </div>
      <div className="library-signal-envelope" aria-hidden="true">
        <svg viewBox="0 0 1000 100" preserveAspectRatio="none">
          <line className="library-signal-midline" x1="0" y1="50" x2="1000" y2="50" />
          <path className="library-signal-fill" d={path} />
        </svg>
      </div>
    </div>
  );
}

export function SoundSignal({
  sounds,
  limit = 3,
  chipLabel = "Music & SFX",
  colorByIndex = false,
}: {
  sounds: LibrarySoundPreview[];
  limit?: number;
  chipLabel?: string;
  colorByIndex?: boolean;
}) {
  const rows = sounds.slice(0, limit);
  if (rows.length === 0) return null;

  return (
    <div className="library-sound-signal" aria-label="Music and sound effect loudness envelopes">
      <div className="library-tile-chip" data-tone="music">
        <span>Audio</span>
        <strong>{chipLabel}</strong>
      </div>
      <div className="library-signal-rows">
        {rows.map((sound, index) => (
          <SoundEnvelope key={sound.path} sound={sound} index={index} colorByIndex={colorByIndex} />
        ))}
      </div>
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "analyzed";
  if (seconds < 10) return `${seconds.toFixed(1)}s`;
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remaining}`;
}

export function LibraryHeroShowreel({
  models,
  sprites,
  sounds,
}: {
  models: LibraryModelPreview[];
  sprites: LibrarySpritePreview[];
  sounds: LibrarySoundPreview[];
}) {
  const visibleSprites = sprites.slice(0, 3);

  return (
    <div className="library-showreel" aria-hidden="true">
      <div className="library-model-stage">
        <LandingModelBackdrop
          models={models}
          cameraPosition={[2.5, 4, 5.8]}
          fov={42}
          contactShadowScale={18}
        />
        <div className="library-tile-chip library-tile-chip--floating" data-tone="model">
          <span>3D</span>
          <strong>3D models</strong>
        </div>
        <div className="library-model-glow" aria-hidden="true" />
      </div>

      <div className="library-tile-rack">
        {visibleSprites.map((sample, index) => (
          <SpriteLoop key={`${sample.path}-${index}`} sample={sample} index={index} />
        ))}
      </div>

      <SoundSignal sounds={sounds} />
    </div>
  );
}
