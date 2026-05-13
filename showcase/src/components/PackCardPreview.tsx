"use client";

import { Canvas } from "@react-three/fiber";
import { Bounds, useGLTF } from "@react-three/drei";
import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { assetUrl } from "@/lib/manifest";
import { Model } from "./Model";

const CYCLE_MS = 1400;

export function PackCardPreview({ modelFiles }: { modelFiles: string[] }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const urls = useMemo(() => modelFiles.map(assetUrl), [modelFiles]);
  const url = urls[index] ?? urls[0] ?? null;
  const nextUrl = urls.length > 1 ? urls[(index + 1) % urls.length] : null;

  useEffect(() => {
    const el = rootRef.current;
    if (!el || !urls[0]) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setReady(true);
        useGLTF.preload(urls[0]);
        if (urls[1]) useGLTF.preload(urls[1]);
        observer.disconnect();
      },
      { rootMargin: "260px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [urls]);

  useEffect(() => {
    const card = rootRef.current?.closest(".pack-card");
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

  return (
    <div ref={rootRef} className="pack-preview" aria-hidden="true">
      {ready && url && (
        <Canvas
          camera={{ position: [5.5, 4.2, 7], fov: 40, near: 0.1, far: 500 }}
          dpr={[1, 1.5]}
          frameloop={active ? "always" : "demand"}
          shadows
          gl={{ antialias: true, alpha: true }}
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
          <Stage />
          <Suspense fallback={null}>
            <PreviewErrorBoundary resetKey={url}>
              <Bounds key={url} fit clip observe margin={1.28}>
                <group rotation={[0, -0.48, 0]}>
                  <Model url={url} autoRotate={active} />
                </group>
              </Bounds>
            </PreviewErrorBoundary>
          </Suspense>
        </Canvas>
      )}
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

function Stage() {
  return (
    <group position={[0, -0.04, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[2.55, 48]} />
        <meshStandardMaterial
          color="#353942"
          roughness={0.78}
          metalness={0.02}
        />
      </mesh>
    </group>
  );
}
