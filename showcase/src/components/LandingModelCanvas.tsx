"use client";

import { ContactShadows, Environment } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Component, Suspense, useRef, type ReactNode } from "react";
import type { Group } from "three";
import { assetUrl } from "@/lib/manifest";
import { Model } from "./Model";
import type { LandingModelPreviewItem } from "./LandingModelBackdrop";

type LandingModelCanvasProps = {
  models: LandingModelPreviewItem[];
  cameraPosition?: [number, number, number];
  fov?: number;
  contactShadowScale?: number;
};

export default function LandingModelCanvas({
  models,
  cameraPosition = [3.4, 2.4, 5.6],
  fov = 38,
  contactShadowScale = 14,
}: LandingModelCanvasProps) {
  return (
    <Canvas
      camera={{ position: cameraPosition, fov, near: 0.1, far: 80 }}
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
          scale={contactShadowScale}
          blur={2.9}
          far={3.4}
        />
        <Environment preset="warehouse" environmentIntensity={0.45} />
      </Suspense>
    </Canvas>
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
        <ModelErrorBoundary
          key={`${model.label}-${model.file}`}
          resetKey={model.file}
        >
          <PreviewModel model={model} />
        </ModelErrorBoundary>
      ))}
    </group>
  );
}

function PreviewModel({ model }: { model: LandingModelPreviewItem }) {
  const ref = useRef<Group>(null);
  const [x, y, z] = model.position;
  const [rx, ry, rz] = model.rotation;
  const groundedY = y - model.minY * model.scale;
  const spinSpeed = model.spinSpeed ?? 0;
  const spinPhase = model.spinPhase ?? 0;

  useFrame((_, delta) => {
    if (!ref.current || spinSpeed === 0) return;
    ref.current.rotation.y += delta * spinSpeed;
  });

  return (
    <group
      ref={ref}
      position={[x, groundedY, z]}
      rotation={[rx, ry + spinPhase, rz]}
      scale={model.scale}
    >
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
