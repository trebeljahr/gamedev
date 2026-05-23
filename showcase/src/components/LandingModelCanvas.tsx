"use client";

import { Environment } from "@react-three/drei";
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
};

export default function LandingModelCanvas({
  models,
  cameraPosition = [0, 0, 8],
  fov = 30,
}: LandingModelCanvasProps) {
  return (
    <Canvas
      camera={{ position: cameraPosition, fov, near: 0.1, far: 80 }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: true }}
    >
      <ambientLight intensity={0.85} />
      <directionalLight position={[3, 6, 6]} intensity={1.9} />
      <hemisphereLight args={["#f7f0d4", "#242025", 0.55]} />
      <Suspense fallback={null}>
        <ModelCluster models={models} />
        <Environment preset="warehouse" environmentIntensity={0.45} />
      </Suspense>
    </Canvas>
  );
}

function ModelCluster({ models }: { models: LandingModelPreviewItem[] }) {
  const groupRef = useRef<Group>(null);

  // The grid is already centered on the origin (the camera looks straight at
  // [0,0,0]); only add a gentle vertical bob so the wall isn't dead still.
  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    groupRef.current.position.y = Math.sin(clock.getElapsedTime() * 0.35) * 0.06;
  });

  return (
    <group ref={groupRef}>
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
  const [rx, ry, rz] = model.rotation;
  const spinSpeed = model.spinSpeed ?? 0;
  const spinPhase = model.spinPhase ?? 0;

  // Each model turns slowly on its own Y axis.
  useFrame((_, delta) => {
    if (!ref.current || spinSpeed === 0) return;
    ref.current.rotation.y += delta * spinSpeed;
  });

  return (
    <group
      ref={ref}
      position={model.position}
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
