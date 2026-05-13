"use client";

import { ContactShadows, Environment } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense, useRef } from "react";
import type { Group } from "three";

export type LandingModelPreviewItem = {
  label: string;
  variant: "ship" | "castle" | "robot";
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
        camera={{ position: [4.4, 3.1, 7.6], fov: 34, near: 0.1, far: 80 }}
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
            position={[0, -0.72, 0]}
            opacity={0.4}
            scale={8}
            blur={2.4}
            far={3}
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
    groupRef.current.rotation.y = -0.34 + Math.sin(t * 0.22) * 0.055;
    groupRef.current.position.y = Math.sin(t * 0.4) * 0.045;
  });

  return (
    <group ref={groupRef} rotation={[0, -0.34, 0]}>
      {models.map((model) => (
        <PreviewModel key={`${model.label}-${model.variant}`} model={model} />
      ))}
      <mesh position={[0.1, -0.75, -0.1]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[2.85, 64]} />
        <meshStandardMaterial color="#171716" roughness={0.9} metalness={0.04} />
      </mesh>
    </group>
  );
}

function PreviewModel({ model }: { model: LandingModelPreviewItem }) {
  const [x, y, z] = model.position;

  return (
    <group position={[x, y, z]} rotation={model.rotation} scale={model.scale}>
      {model.variant === "ship" && <ShipModel />}
      {model.variant === "castle" && <CastleModel />}
      {model.variant === "robot" && <RobotModel />}
    </group>
  );
}

function ShipModel() {
  return (
    <group>
      <mesh castShadow receiveShadow rotation={[0, 0, Math.PI / 2]} scale={[0.78, 2.35, 0.45]}>
        <coneGeometry args={[1, 2.2, 5]} />
        <meshStandardMaterial color="#f4c544" roughness={0.62} metalness={0.08} />
      </mesh>
      <mesh castShadow receiveShadow position={[-0.2, 0, 0]} scale={[1.8, 0.18, 1.25]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#d9dde6" roughness={0.5} metalness={0.16} />
      </mesh>
      <mesh castShadow receiveShadow position={[-0.72, 0.16, 0]} scale={[0.72, 0.36, 0.54]}>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#72d4ff" roughness={0.38} metalness={0.18} />
      </mesh>
      <mesh castShadow receiveShadow position={[-0.55, -0.12, 0.68]} rotation={[0.22, 0, -0.1]}>
        <boxGeometry args={[1.35, 0.16, 0.38]} />
        <meshStandardMaterial color="#e95f45" roughness={0.56} />
      </mesh>
      <mesh castShadow receiveShadow position={[-0.55, -0.12, -0.68]} rotation={[-0.22, 0, -0.1]}>
        <boxGeometry args={[1.35, 0.16, 0.38]} />
        <meshStandardMaterial color="#e95f45" roughness={0.56} />
      </mesh>
    </group>
  );
}

function CastleModel() {
  return (
    <group>
      <mesh castShadow receiveShadow position={[0, 0.42, 0]} scale={[1.45, 0.84, 1.15]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#b9b2a4" roughness={0.9} />
      </mesh>
      {[
        [-0.78, 0, -0.62],
        [0.78, 0, -0.62],
        [-0.78, 0, 0.62],
        [0.78, 0, 0.62],
      ].map(([tx, ty, tz]) => (
        <group key={`${tx}-${tz}`} position={[tx, ty, tz]}>
          <mesh castShadow receiveShadow position={[0, 0.72, 0]}>
            <cylinderGeometry args={[0.28, 0.32, 1.45, 8]} />
            <meshStandardMaterial color="#d2c8b6" roughness={0.88} />
          </mesh>
          <mesh castShadow receiveShadow position={[0, 1.58, 0]}>
            <coneGeometry args={[0.44, 0.72, 8]} />
            <meshStandardMaterial color="#d55d44" roughness={0.72} />
          </mesh>
        </group>
      ))}
      <mesh castShadow receiveShadow position={[0, 0.18, 0.59]} scale={[0.34, 0.48, 0.08]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#4a3326" roughness={0.78} />
      </mesh>
    </group>
  );
}

function RobotModel() {
  return (
    <group>
      <mesh castShadow receiveShadow position={[0, 1.28, 0]} scale={[0.62, 0.48, 0.5]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#d8dce4" roughness={0.48} metalness={0.22} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.58, 0]} scale={[0.82, 0.74, 0.48]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#5ca8ff" roughness={0.45} metalness={0.14} />
      </mesh>
      <mesh castShadow receiveShadow position={[-0.72, 0.62, 0]} rotation={[0, 0, 0.2]}>
        <capsuleGeometry args={[0.13, 0.78, 6, 10]} />
        <meshStandardMaterial color="#c5cad4" roughness={0.5} metalness={0.2} />
      </mesh>
      <mesh castShadow receiveShadow position={[0.72, 0.62, 0]} rotation={[0, 0, -0.2]}>
        <capsuleGeometry args={[0.13, 0.78, 6, 10]} />
        <meshStandardMaterial color="#c5cad4" roughness={0.5} metalness={0.2} />
      </mesh>
      <mesh castShadow receiveShadow position={[-0.24, -0.12, 0]}>
        <capsuleGeometry args={[0.15, 0.88, 6, 10]} />
        <meshStandardMaterial color="#343940" roughness={0.58} metalness={0.16} />
      </mesh>
      <mesh castShadow receiveShadow position={[0.24, -0.12, 0]}>
        <capsuleGeometry args={[0.15, 0.88, 6, 10]} />
        <meshStandardMaterial color="#343940" roughness={0.58} metalness={0.16} />
      </mesh>
      <mesh castShadow receiveShadow position={[-0.18, 1.34, 0.26]} scale={[0.11, 0.11, 0.04]}>
        <sphereGeometry args={[1, 16, 12]} />
        <meshStandardMaterial color="#ffd84d" emissive="#5f4300" emissiveIntensity={0.35} />
      </mesh>
      <mesh castShadow receiveShadow position={[0.18, 1.34, 0.26]} scale={[0.11, 0.11, 0.04]}>
        <sphereGeometry args={[1, 16, 12]} />
        <meshStandardMaterial color="#ffd84d" emissive="#5f4300" emissiveIntensity={0.35} />
      </mesh>
    </group>
  );
}
