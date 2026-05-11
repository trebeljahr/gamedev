"use client";

import { Canvas } from "@react-three/fiber";
import { Bounds, Environment } from "@react-three/drei";
import { Suspense, useState } from "react";
import { ErrorBoundary } from "./ErrorBoundary";
import { FlyCamera } from "./FlyCamera";
import { Model } from "./Model";

export function Viewer({ url }: { url: string }) {
  const [sprinting, setSprinting] = useState(false);
  return (
    <>
      <Canvas
        camera={{ position: [8, 6, 12], fov: 45, near: 0.1, far: 1000 }}
        shadows
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
            <Bounds key={url} fit clip observe margin={1.4}>
              <Model url={url} />
            </Bounds>
            <Environment preset="city" environmentIntensity={0.5} />
          </ErrorBoundary>
        </Suspense>
        <FlyCamera onSprintChange={setSprinting} />
      </Canvas>
      <FlyHud sprinting={sprinting} />
    </>
  );
}

function FlyHud({ sprinting }: { sprinting: boolean }) {
  return (
    <div className="fly-hud">
      <span>WASD move</span>
      <span>Space up</span>
      <span>C down</span>
      <span>drag look</span>
      <span className={sprinting ? "sprint on" : "sprint"}>
        Shift sprint {sprinting ? "ON" : "off"}
      </span>
    </div>
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
