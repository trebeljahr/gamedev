"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bounds, Environment, OrbitControls } from "@react-three/drei";
import { Suspense, useRef, useState, type ElementRef } from "react";
import { ErrorBoundary } from "./ErrorBoundary";
import { Model, type AnimationInfo } from "./Model";
import { AnimationPicker } from "./AnimationPicker";
import {
  CAMERA_FLOOR_CLEARANCE,
  ORBIT_FLOOR_POLAR_LIMIT,
  clampCameraAboveFloor,
  polarLimitForCameraFloor,
} from "./CameraFloorGuard";

export function Viewer({ url }: { url: string }) {
  const [anim, setAnim] = useState<AnimationInfo | null>(null);
  const [playAnim, setPlayAnim] = useState<string | undefined>(undefined);

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
        <FloorAwareOrbitControls />
      </Canvas>
      {anim && anim.names.length > 0 && (
        <AnimationPicker names={anim.names} onChange={setPlayAnim} />
      )}
    </>
  );
}

function FloorAwareOrbitControls() {
  const controlsRef = useRef<ElementRef<typeof OrbitControls>>(null);
  const { camera } = useThree();

  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    // Keep OrbitControls in charge of floor limits; an external position clamp
    // fights damping and creates visible snap-back.
    const clamped = clampCameraAboveFloor(camera, CAMERA_FLOOR_CLEARANCE);
    const nextMaxPolarAngle = polarLimitForCameraFloor(
      camera,
      controls.target,
      CAMERA_FLOOR_CLEARANCE,
    );
    const changed =
      Math.abs(controls.maxPolarAngle - nextMaxPolarAngle) > 0.0001;
    if (changed) controls.maxPolarAngle = nextMaxPolarAngle;

    if (changed || clamped) controls.update();
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.1}
      maxPolarAngle={ORBIT_FLOOR_POLAR_LIMIT}
    />
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
