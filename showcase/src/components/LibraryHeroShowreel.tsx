"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  LandingModelBackdrop,
  type LandingModelPreviewItem,
} from "@/components/LandingModelBackdrop";

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
  label: string;
  kind: string;
  category: string;
};

const MODEL_PREVIEWS: LandingModelPreviewItem[] = [
  {
    label: "Spaceship",
    variant: "ship",
    position: [0.58, 0.82, -0.34],
    rotation: [-0.1, -0.76, 0.08],
    scale: 0.22,
  },
  {
    label: "Castle kit",
    variant: "castle",
    position: [-1.42, -0.7, -0.14],
    rotation: [0, 0.5, 0],
    scale: 0.78,
  },
  {
    label: "Robot",
    variant: "robot",
    position: [1.62, -0.74, 0.48],
    rotation: [0, -0.32, 0],
    scale: 0.3,
  },
];

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function soundEnvelope(seed: string, count: number): number[] {
  let noise = hashString(seed || "sound");
  const phase = (noise % 360) * (Math.PI / 180);
  const beat = 5 + (noise % 7);

  return Array.from({ length: count }, (_, index) => {
    noise = Math.imul(noise, 1664525) + 1013904223;
    const position = count <= 1 ? 0 : index / (count - 1);
    const arc = Math.sin(Math.PI * position);
    const pulse = 0.5 + Math.sin(position * Math.PI * beat + phase) * 0.5;
    const jitter = ((noise >>> 0) / 0xffffffff) * 0.22;
    return Math.min(0.98, Math.max(0.12, 0.16 + arc * 0.34 + pulse * 0.34 + jitter));
  });
}

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

  return (
    <div className="library-sound-signal" aria-label="Sound and music preview representation">
      <div className="library-signal-head">
        <span>SFX / Music</span>
        <strong>sound design</strong>
      </div>
      <div className="library-signal-rows">
        {rows.map((sound) => {
          const levels = soundEnvelope(`${sound.title}|${sound.label}|${sound.kind}`, 34);
          return (
            <div className="library-signal-row" key={`${sound.title}-${sound.label}`}>
              <div>
                <span>{sound.kind}</span>
                <strong>{sound.label || sound.title}</strong>
              </div>
              <div className="library-signal-bars" aria-hidden="true">
                {levels.map((level, index) => (
                  <i
                    key={index}
                    style={
                      {
                        "--bar-height": `${Math.round(level * 100)}%`,
                        "--bar-delay": `${index * 28}ms`,
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

export function LibraryHeroShowreel({
  sprites,
  sounds,
}: {
  sprites: LibrarySpritePreview[];
  sounds: LibrarySoundPreview[];
}) {
  const visibleSprites = sprites.slice(0, 4);
  const vfxSprite =
    sprites.find((sample) => /vfx|effect|fx|impact|explosion/i.test(`${sample.theme} ${sample.label} ${sample.path}`)) ??
    visibleSprites[0];

  return (
    <div className="library-showreel" aria-hidden="true">
      <div className="library-model-plane">
        <LandingModelBackdrop models={MODEL_PREVIEWS} />
        <div className="library-model-label">
          <span>3D</span>
          <strong>models + kits</strong>
        </div>
      </div>

      <div className="library-sprite-rack">
        {visibleSprites.map((sample, index) => (
          <SpriteLoop key={`${sample.path}-${index}`} sample={sample} index={index} />
        ))}
      </div>

      <div className="library-vfx-burst">
        <span />
        <span />
        <span />
        <span />
        <strong>{vfxSprite?.label ?? "VFX"}</strong>
      </div>

      <SoundSignal sounds={sounds} />
    </div>
  );
}
