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

function parseSingleRowLayout(
  path: string,
  image: HTMLImageElement,
): { cols: number; row: number; rows: number } {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const lower = path.toLowerCase();

  const strip = lower.match(/strip[\s_-]*(\d{1,2})/);
  if (strip) {
    const cols = Math.max(2, Number(strip[1]));
    return { cols, rows: 1, row: 0 };
  }

  const sizeHint = lower.match(/(^|[^0-9])(\d{2,4})\s*x\s*(\d{2,4})([^0-9]|$)/);
  if (sizeHint) {
    const frameWidth = Number(sizeHint[2]);
    const frameHeight = Number(sizeHint[3]);
    if (frameWidth > 0 && frameHeight > 0 && width % frameWidth === 0 && height % frameHeight === 0) {
      const cols = Math.max(1, Math.min(32, width / frameWidth));
      const rows = Math.max(1, Math.min(24, height / frameHeight));
      return { cols, rows, row: pickDemoRow(rows, path) };
    }
  }

  const wideRatio = width / Math.max(1, height);
  const tallRatio = height / Math.max(1, width);
  if (wideRatio >= 1.75) {
    return { cols: Math.max(2, Math.min(32, Math.round(wideRatio))), rows: 1, row: 0 };
  }
  if (tallRatio >= 1.75) {
    const rows = Math.max(2, Math.min(24, Math.round(tallRatio)));
    return { cols: 1, rows, row: pickDemoRow(rows, path) };
  }

  if (/sprite\s*sheet|spritesheet|sheet/.test(lower)) {
    const wide = width >= height;
    const cols = wide ? 4 : 2;
    const rows = wide ? 2 : 4;
    return { cols, rows, row: pickDemoRow(rows, path) };
  }

  return { cols: 1, rows: 1, row: 0 };
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
  layout: { cols: number; row: number; rows: number },
  frame: number,
  width: number,
  height: number,
) {
  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;
  const safeFrame = ((frame % layout.cols) + layout.cols) % layout.cols;
  const sourceWidth = Math.floor(imageWidth / layout.cols);
  const sourceHeight = Math.floor(imageHeight / layout.rows);
  const sourceX = safeFrame * sourceWidth;
  const sourceY = layout.row * sourceHeight;
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

export function SpriteLoop({ sample, index }: { sample: LibrarySpritePreview; index: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [frameCount, setFrameCount] = useState(1);
  const gif = /\.gif($|[?#])/i.test(sample.path);
  const renderAsImage = gif || !sample.animated;

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
      setFrameCount(layout.cols);
      setFailed(false);

      function tick(time: number) {
        drawChecker(drawingContext, drawingCanvas.width, drawingCanvas.height);
        if (time - lastFrame > 1000 / (sample.kind === "effect" ? 14 : 10)) {
          frame = (frame + 1) % layout.cols;
          lastFrame = time;
        }
        drawFrame(drawingContext, image, layout, frame, drawingCanvas.width, drawingCanvas.height);
        raf = requestAnimationFrame(tick);
      }

      raf = requestAnimationFrame(tick);
    };

    image.onerror = () => {
      if (cancelled) return;
      setFailed(true);
    };
    image.src = sample.src;

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [renderAsImage, sample.kind, sample.path, sample.src]);

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
          <img src={sample.src} alt="" />
        ) : (
          <canvas
            ref={canvasRef}
            width={240}
            height={156}
            aria-label={`${sample.label} animated sprite preview`}
          />
        )}
        {animatedFlag ? <i className="library-tile-pulse" aria-hidden="true" /> : null}
      </div>
      <div className="library-tile-meta">
        <strong>{sample.label}</strong>
        <small>{subline}</small>
      </div>
    </article>
  );
}

function SoundEnvelope({ sound, index }: { sound: LibrarySoundPreview; index: number }) {
  const path = useMemo(() => waveformPath(sound.loudness), [sound.loudness]);

  return (
    <div
      className="library-signal-row"
      data-tone={sound.tone}
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
}: {
  sounds: LibrarySoundPreview[];
  limit?: number;
  chipLabel?: string;
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
          <SoundEnvelope key={sound.path} sound={sound} index={index} />
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
        <LandingModelBackdrop models={models} />
        <div className="library-tile-chip library-tile-chip--floating" data-tone="model">
          <span>3D</span>
          <strong>GLB models</strong>
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
