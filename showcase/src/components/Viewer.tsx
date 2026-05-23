"use client";

import { Canvas } from "@react-three/fiber";
import { Bounds, Environment, OrbitControls } from "@react-three/drei";
import { Suspense, useState } from "react";
import { ErrorBoundary } from "./ErrorBoundary";
import { Model, type AnimationInfo } from "./Model";
import { AnimationPicker } from "./AnimationPicker";

export function Viewer({ url }: { url: string }) {
  const [anim, setAnim] = useState<AnimationInfo | null>(null);
  const [playAnim, setPlayAnim] = useState<string | undefined>(undefined);

  return (
    <>
      <Canvas
        camera={{ position: [8, 6, 12], fov: 45, near: 0.1, far: 1000 }}
        shadows="percentage"
        dpr={[1, 2]}
      >
        <color attach="background" args={["#f5efe6"]} />
        <ambientLight intensity={0.7} />
        <directionalLight
          position={[10, 12, 8]}
          intensity={1.5}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />
        <Suspense fallback={null}>
          <ErrorBoundary fallback={<FallbackBox />}>
            <Bounds key={url} fit margin={1.4}>
              <Model
                url={url}
                autoRotate
                playAnimation={playAnim}
                onAnimationsLoaded={setAnim}
              />
            </Bounds>
            <Environment preset="city" environmentIntensity={0.5} />
          </ErrorBoundary>
        </Suspense>
        <OrbitControls makeDefault enableDamping dampingFactor={0.1} />
      </Canvas>
      {anim && anim.names.length > 0 && (
        <AnimationPicker names={anim.names} onChange={setPlayAnim} />
      )}
    </>
  );
}

function FallbackBox() {
  return (
    <mesh>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#cc3333" wireframe />
    </mesh>
  );
}
