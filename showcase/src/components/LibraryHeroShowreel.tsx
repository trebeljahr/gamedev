"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  LandingModelBackdrop,
  type LandingModelPreviewItem,
} from "@/components/LandingModelBackdrop";

export type LibraryModelPreview = LandingModelPreviewItem;

export type LibrarySpritePreview = {
  title: string;
  theme: string;
  label: string;
  kind: string;
  src: string;
  path: string;
};

export type LibrarySoundPreview = {
  title: string;
  source: string;
  path: string;
  duration: number;
  loudness: number[];
};

function parseFrameLayout(
  path: string,
  image: HTMLImageElement,
): { cols: number; rows: number } {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const lower = path.toLowerCase();
  const strip = lower.match(/strip[\s_-]*(\d{1,2})/);
  if (strip) return { cols: Math.max(2, Number(strip[1])), rows: 1 };

  const sizeHint = lower.match(/(^|[^0-9])(\d{2,4})\s*x\s*(\d{2,4})([^0-9]|$)/);
  if (sizeHint) {
    const frameWidth = Number(sizeHint[2]);
    const frameHeight = Number(sizeHint[3]);
    if (frameWidth > 0 && frameHeight > 0 && width % frameWidth === 0 && height % frameHeight === 0) {
      return {
        cols: Math.max(1, Math.min(32, width / frameWidth)),
        rows: Math.max(1, Math.min(24, height / frameHeight)),
      };
    }
  }

  const wideRatio = width / Math.max(1, height);
  const tallRatio = height / Math.max(1, width);
  if (wideRatio >= 1.75) return { cols: Math.max(2, Math.min(32, Math.round(wideRatio))), rows: 1 };
  if (tallRatio >= 1.75) return { cols: 1, rows: Math.max(2, Math.min(24, Math.round(tallRatio))) };

  if (/sprite\s*sheet|spritesheet|sheet/.test(lower)) {
    return width >= height ? { cols: 4, rows: 2 } : { cols: 2, rows: 4 };
  }

  return { cols: 1, rows: 1 };
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
  layout: { cols: number; rows: number },
  frame: number,
  width: number,
  height: number,
) {
  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;
  const total = Math.max(1, layout.cols * layout.rows);
  const safeFrame = frame % total;
  const col = safeFrame % layout.cols;
  const row = Math.floor(safeFrame / layout.cols);
  const sourceWidth = Math.floor(imageWidth / layout.cols);
  const sourceHeight = Math.floor(imageHeight / layout.rows);
  const sourceX = col * sourceWidth;
  const sourceY = row * sourceHeight;
  const maxWidth = width * 0.78;
  const maxHeight = height * 0.7;
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

function SpriteLoop({ sample, index }: { sample: LibrarySpritePreview; index: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [frameCount, setFrameCount] = useState(1);
  const gif = /\.gif($|[?#])/i.test(sample.path);

  useEffect(() => {
    if (gif) return;

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
      const layout = parseFrameLayout(sample.path, image);
      const total = Math.max(1, layout.cols * layout.rows);
      setFrameCount(total);
      setFailed(false);

      function tick(time: number) {
        drawChecker(drawingContext, drawingCanvas.width, drawingCanvas.height);
        if (time - lastFrame > 1000 / (sample.kind === "effect" ? 14 : 10)) {
          frame = (frame + 1) % total;
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
  }, [gif, sample.kind, sample.path, sample.src]);

  return (
    <article className="library-sprite-card" style={{ "--sprite-delay": `${index * 110}ms` } as CSSProperties}>
      <div className="library-sprite-stage">
        {gif || failed ? (
          <img src={sample.src} alt="" />
        ) : (
          <canvas ref={canvasRef} width={240} height={156} aria-label={`${sample.label} animated sprite preview`} />
        )}
      </div>
      <div className="library-sprite-meta">
        <span>{sample.theme}</span>
        <strong>{sample.label}</strong>
        <small>{frameCount > 1 ? `${frameCount} frames` : sample.title}</small>
      </div>
    </article>
  );
}

function SoundSignal({ sounds }: { sounds: LibrarySoundPreview[] }) {
  const rows = sounds.slice(0, 3);
  if (rows.length === 0) return null;

  return (
    <div className="library-sound-signal" aria-label="Static waveform previews from analyzed music tracks">
      <div className="library-signal-head">
        <span>Music waveforms</span>
        <strong>analyzed tracks</strong>
      </div>
      <div className="library-signal-rows">
        {rows.map((sound) => {
          return (
            <div className="library-signal-row" key={sound.path}>
              <div>
                <span>{sound.source}</span>
                <strong>{sound.title}</strong>
                <small>{formatDuration(sound.duration)}</small>
              </div>
              <div className="library-signal-bars" aria-hidden="true">
                {sound.loudness.map((level, index) => (
                  <i
                    key={index}
                    style={
                      {
                        "--bar-height": `${Math.round(level * 100)}%`,
                      } as CSSProperties
                    }
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "analyzed";
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
  const visibleSprites = sprites.slice(0, 2);

  return (
    <div className="library-showreel" aria-hidden="true">
      <div className="library-model-plane">
        <LandingModelBackdrop models={models} />
        <div className="library-model-label">
          <span>3D</span>
          <strong>real GLB assets</strong>
        </div>
      </div>

      <div className="library-demo-footer">
        <div className="library-sprite-rack">
          {visibleSprites.map((sample, index) => (
            <SpriteLoop key={`${sample.path}-${index}`} sample={sample} index={index} />
          ))}
        </div>
        <SoundSignal sounds={sounds} />
      </div>
    </div>
  );
}
