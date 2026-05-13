"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bounds, OrbitControls, useGLTF } from "@react-three/drei";
import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { assetUrl } from "@/lib/manifest";
import { Model } from "./Model";

const CYCLE_MS = 1400;
const MAX_ACTIVE_PREVIEWS = 8;
const PREVIEW_IMAGE_CACHE_LIMIT = 256;
const PREVIEW_CAPTURE_FRAME = 8;
const previewSubscribers = new Set<() => void>();
let visiblePreviewIds: string[] = [];
const previewImageCache = new Map<string, string>();

function notifyPreviewSubscribers() {
  previewSubscribers.forEach((listener) => listener());
}

function setPreviewVisible(id: string, visible: boolean) {
  const isVisible = visiblePreviewIds.includes(id);
  if (visible === isVisible) return;

  visiblePreviewIds = visible
    ? [...visiblePreviewIds, id]
    : visiblePreviewIds.filter((item) => item !== id);
  notifyPreviewSubscribers();
}

function canUsePreviewCanvas(id: string): boolean {
  const index = visiblePreviewIds.indexOf(id);
  return index >= 0 && index < MAX_ACTIVE_PREVIEWS;
}

function subscribePreviewBudget(listener: () => void) {
  previewSubscribers.add(listener);
  return () => previewSubscribers.delete(listener);
}

function usePreviewCanvasBudget(id: string, visible: boolean): boolean {
  const [hasSlot, setHasSlot] = useState(false);

  useEffect(() => {
    const update = () => setHasSlot(canUsePreviewCanvas(id));
    const unsubscribe = subscribePreviewBudget(update);
    setPreviewVisible(id, visible);
    update();

    return () => {
      unsubscribe();
      setPreviewVisible(id, false);
    };
  }, [id, visible]);

  return hasSlot;
}

function cachedPreviewImageFor(url: string): string | undefined {
  const image = previewImageCache.get(url);
  if (!image) return undefined;
  previewImageCache.delete(url);
  previewImageCache.set(url, image);
  return image;
}

function rememberPreviewImage(url: string, image: string) {
  previewImageCache.delete(url);
  previewImageCache.set(url, image);

  while (previewImageCache.size > PREVIEW_IMAGE_CACHE_LIMIT) {
    const oldest = previewImageCache.keys().next().value;
    if (!oldest) return;
    previewImageCache.delete(oldest);
  }
}

export function PackCardPreview({
  modelFiles,
  label,
}: {
  modelFiles: string[];
  label?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [nearViewport, setNearViewport] = useState(false);
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [canvasSettled, setCanvasSettled] = useState(false);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const orbitDragRef = useRef(false);
  const urls = useMemo(() => modelFiles.map(assetUrl), [modelFiles]);
  const url = urls[index] ?? urls[0] ?? null;
  const nextUrl = urls.length > 1 ? urls[(index + 1) % urls.length] : null;
  const budgetId = `${label ?? "preview"}:${urls.join("|")}`;
  const [previewImage, setPreviewImage] = useState<string | undefined>(() =>
    url ? cachedPreviewImageFor(url) : undefined,
  );

  useEffect(() => {
    setPreviewImage(url ? cachedPreviewImageFor(url) : undefined);
    setCanvasSettled(false);
  }, [url]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || !urls[0]) return;
    if (!("IntersectionObserver" in window)) {
      setNearViewport(true);
      setReady(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        const visible = !!entry?.isIntersecting;
        setNearViewport(visible);
        if (!visible) return;
        setReady(true);
        useGLTF.preload(urls[0]);
        if (urls[1]) useGLTF.preload(urls[1]);
      },
      { rootMargin: "96px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [urls]);

  useEffect(() => {
    const card = rootRef.current?.closest(".pack-card, .model-card");
    if (!card) return;

    const activate = () => setActive(true);
    const deactivate = () => setActive(false);
    card.addEventListener("pointerenter", activate);
    card.addEventListener("pointerleave", deactivate);
    card.addEventListener("focusin", activate);
    card.addEventListener("focusout", deactivate);

    return () => {
      card.removeEventListener("pointerenter", activate);
      card.removeEventListener("pointerleave", deactivate);
      card.removeEventListener("focusin", activate);
      card.removeEventListener("focusout", deactivate);
    };
  }, []);

  useEffect(() => {
    if (!active || urls.length <= 1) {
      setIndex(0);
      return;
    }

    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % urls.length);
    }, CYCLE_MS);

    return () => window.clearInterval(timer);
  }, [active, urls.length]);

  useEffect(() => {
    if (!ready) return;
    if (url) useGLTF.preload(url);
    if (nextUrl) useGLTF.preload(nextUrl);
  }, [nextUrl, ready, url]);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    setActive(true);
    orbitDragRef.current = false;
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = pointerStartRef.current;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (dx * dx + dy * dy > 16) orbitDragRef.current = true;
  };

  const handlePointerUp = () => {
    pointerStartRef.current = null;
    if (orbitDragRef.current) {
      window.setTimeout(() => {
        orbitDragRef.current = false;
      }, 0);
    }
  };

  const handleClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (!orbitDragRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    orbitDragRef.current = false;
  };

  const hasCanvasSlot = usePreviewCanvasBudget(
    budgetId,
    nearViewport && !!url,
  );
  const showCachedImage =
    !!previewImage && (!active || !canvasSettled || !hasCanvasSlot);

  return (
    <div
      ref={rootRef}
      className="pack-preview"
      onClickCapture={handleClickCapture}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={handlePointerUp}
      role={label ? "img" : undefined}
      aria-label={label ? `${label} preview` : undefined}
      aria-hidden={label ? undefined : true}
    >
      {hasCanvasSlot && ready && url ? (
        <Canvas
          camera={{ position: [5.5, 4.2, 7], fov: 40, near: 0.1, far: 500 }}
          dpr={[1, 1.5]}
          frameloop={active ? "always" : "demand"}
          shadows
          gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
        >
          <ambientLight intensity={0.62} />
          <hemisphereLight args={["#fff4d0", "#2c3138", 1.15]} />
          <directionalLight
            position={[7, 9, 5]}
            intensity={1.45}
            castShadow
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
          />
          <Suspense fallback={null}>
            <PreviewErrorBoundary resetKey={url}>
              <Bounds key={url} fit clip margin={1.28}>
                <group rotation={[0, -0.48, 0]}>
                  <Model url={url} autoRotate={active} />
                </group>
              </Bounds>
              <OrbitControls
                enableDamping
                enablePan={false}
                enableZoom={false}
                makeDefault
                rotateSpeed={0.7}
              />
              <PreviewCapture
                cacheKey={url}
                disabled={active}
                onCapture={setPreviewImage}
                onSettled={() => setCanvasSettled(true)}
              />
            </PreviewErrorBoundary>
          </Suspense>
        </Canvas>
      ) : null}
      {showCachedImage ? (
        <img
          className="pack-preview-image"
          src={previewImage}
          alt=""
          loading="lazy"
          decoding="async"
        />
      ) : null}
    </div>
  );
}

class PreviewErrorBoundary extends Component<
  { children: ReactNode; resetKey: string },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidUpdate(prevProps: { resetKey: string }) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

function PreviewCapture({
  cacheKey,
  disabled,
  onCapture,
  onSettled,
}: {
  cacheKey: string;
  disabled: boolean;
  onCapture: (image: string) => void;
  onSettled: () => void;
}) {
  const { camera, gl, invalidate, scene } = useThree();
  const frame = useRef(0);
  const captured = useRef(false);
  const settled = useRef(false);

  useEffect(() => {
    frame.current = 0;
    captured.current = false;
    settled.current = false;
    invalidate();
  }, [cacheKey, invalidate]);

  useEffect(() => {
    if (!disabled) invalidate();
  }, [disabled, invalidate]);

  useFrame(() => {
    if (frame.current < PREVIEW_CAPTURE_FRAME) {
      frame.current += 1;
      invalidate();
      return;
    }
    // Bounds fits the camera after the model resolves; reveal/cache after that zoom settles.
    if (!settled.current) {
      settled.current = true;
      onSettled();
    }
    if (disabled || captured.current) return;
    captured.current = true;

    try {
      gl.render(scene, camera);
      const image = gl.domElement.toDataURL("image/png");
      rememberPreviewImage(cacheKey, image);
      onCapture(image);
    } catch {
      // Cross-origin or unsupported canvas capture should not block preview rendering.
    }
  });

  return null;
}
