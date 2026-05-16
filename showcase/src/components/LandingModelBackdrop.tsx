"use client";

import { ContactShadows, Environment } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Component, Suspense, useRef, type ReactNode } from "react";
import type { Group } from "three";
import { assetUrl } from "@/lib/manifest";
import { Model } from "./Model";

export type LandingModelPreviewItem = {
  label: string;
  file: string;
  source?: string;
  minY: number;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
};

export function LandingModelBackdrop({
  models,
}: {
  models: LandingModelPreviewItem[];
}) {
  if (models.length === 0) return null;

  return (
    <div className="landing-model-backdrop" aria-hidden="true">
      <Canvas
        camera={{ position: [3.4, 2.4, 5.6], fov: 38, near: 0.1, far: 80 }}
        dpr={[1, 1.75]}
        shadows
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.82} />
        <directionalLight
          position={[4, 7, 5]}
          intensity={2}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <hemisphereLight args={["#f7f0d4", "#242025", 0.55]} />
        <Suspense fallback={null}>
          <ModelCluster models={models} />
          <ContactShadows
            position={[0, -0.78, 0]}
            opacity={0.32}
            scale={14}
            blur={2.9}
            far={3.4}
          />
          <Environment preset="warehouse" environmentIntensity={0.45} />
        </Suspense>
      </Canvas>
    </div>
  );
}

function ModelCluster({ models }: { models: LandingModelPreviewItem[] }) {
  const groupRef = useRef<Group>(null);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();
    groupRef.current.rotation.y = -0.28 + Math.sin(t * 0.22) * 0.045;
    groupRef.current.position.y = Math.sin(t * 0.4) * 0.035;
  });

  return (
    <group ref={groupRef} rotation={[0, -0.28, 0]}>
      {models.map((model) => (
        <ModelErrorBoundary key={`${model.label}-${model.file}`} resetKey={model.file}>
          <PreviewModel model={model} />
        </ModelErrorBoundary>
      ))}
    </group>
  );
}

function PreviewModel({ model }: { model: LandingModelPreviewItem }) {
  const [x, y, z] = model.position;
  const groundedY = y - model.minY * model.scale;

  return (
    <group position={[x, groundedY, z]} rotation={model.rotation} scale={model.scale}>
      <Model url={assetUrl(model.file)} />
    </group>
  );
}

class ModelErrorBoundary extends Component<
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
