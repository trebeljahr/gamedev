"use client";

import { Canvas } from "@react-three/fiber";
import { Bounds, useGLTF } from "@react-three/drei";
import {
  Component,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { assetUrl, type Model as CatalogModel } from "@/lib/manifest";
import { Model } from "./Model";

export function PackCardPreview({ model }: { model: CatalogModel | undefined }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const url = model ? assetUrl(model.file) : null;

  useEffect(() => {
    const el = rootRef.current;
    if (!el || !url) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setReady(true);
        useGLTF.preload(url);
        observer.disconnect();
      },
      { rootMargin: "260px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [url]);

  return (
    <div ref={rootRef} className="pack-preview" aria-hidden="true">
      {ready && url && (
        <Canvas
          camera={{ position: [5.5, 4.2, 7], fov: 40, near: 0.1, far: 500 }}
          dpr={[1, 1.5]}
          frameloop="demand"
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
            <PreviewErrorBoundary>
              <Bounds key={url} fit clip observe margin={1.28}>
                <group rotation={[0, -0.48, 0]}>
                  <Model url={url} />
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
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
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
