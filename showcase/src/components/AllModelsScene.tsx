"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Billboard, Environment, Text, PointerLockControls } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  Box3,
  type InstancedMesh,
  Matrix4,
  Object3D,
  Vector3,
} from "three";
import { Model } from "./Model";
import { allSlots, worldBounds, type Slot } from "@/lib/layout";

const LOAD_RADIUS = 18; // models within this distance get real GLBs loaded
const LABEL_RADIUS = 25; // pack headers labelled within this distance
const MAX_ACTIVE = 64; // cap concurrent loaded models
const MOVE_SPEED = 12; // units/sec
const WORLD_HEIGHT = 2;

export function AllModelsScene() {
  // Centre of the world so we can pick a sensible spawn point.
  // Spawn slightly back and above the start of the grid so Rico can see
  // models in front of him on first paint.
  const start = useMemo<[number, number, number]>(() => {
    return [6, WORLD_HEIGHT + 1.5, -4];
  }, []);

  return (
    <>
      <Canvas
        camera={{ position: start, fov: 60, near: 0.1, far: 800 }}
        shadows
        dpr={[1, 2]}
        gl={{ antialias: true }}
      >
        <color attach="background" args={["#1a1a20"]} />
        <fog attach="fog" args={["#1a1a20", 60, 350]} />
        <ambientLight intensity={0.65} />
        <directionalLight
          position={[60, 80, 40]}
          intensity={1.3}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <hemisphereLight args={["#b1c1d4", "#2a2a32", 0.4]} />
        <Walker />
        <Placeholders />
        <Floor />
        <ActiveModels />
        <PackLabels />
        <Suspense fallback={null}>
          <Environment preset="warehouse" environmentIntensity={0.35} />
        </Suspense>
        <PointerLockControls />
      </Canvas>
      <Crosshair />
      <HUD />
    </>
  );
}

/* Camera walker — WASD + space/shift, gravity-free fly-over.
   Uses raw window listeners to avoid drei API drift. */
function Walker() {
  const { camera } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keys.current[e.key.toLowerCase()] = true;
    };
    const up = (e: KeyboardEvent) => {
      keys.current[e.key.toLowerCase()] = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);
  useFrame((_, delta) => {
    const k = keys.current;
    const fwd = new Vector3();
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    fwd.normalize();
    const right = new Vector3().crossVectors(fwd, new Vector3(0, 1, 0)).normalize();
    let dx = 0,
      dy = 0,
      dz = 0;
    if (k.w || k.arrowup) {
      dx += fwd.x;
      dz += fwd.z;
    }
    if (k.s || k.arrowdown) {
      dx -= fwd.x;
      dz -= fwd.z;
    }
    if (k.d || k.arrowright) {
      dx += right.x;
      dz += right.z;
    }
    if (k.a || k.arrowleft) {
      dx -= right.x;
      dz -= right.z;
    }
    if (k[" "]) dy += 1;
    if (k.shift) dy -= 1;
    const mag = Math.hypot(dx, dy, dz);
    if (mag > 0) {
      const speed = k.control ? MOVE_SPEED * 3 : MOVE_SPEED;
      const s = (speed * delta) / mag;
      camera.position.x += dx * s;
      camera.position.y += dy * s;
      camera.position.z += dz * s;
    }
  });
  return null;
}

/* Massive InstancedMesh of placeholder cubes for every model. ONE drawcall. */
function Placeholders() {
  const ref = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  useEffect(() => {
    if (!ref.current) return;
    for (let i = 0; i < allSlots.length; i++) {
      const [x, y, z] = allSlots[i].position;
      dummy.position.set(x, y + 0.5, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
    }
    ref.current.instanceMatrix.needsUpdate = true;
  }, [dummy]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, allSlots.length]} frustumCulled={false}>
      <boxGeometry args={[1.2, 0.2, 1.2]} />
      <meshStandardMaterial color="#5d5d6b" roughness={0.7} />
    </instancedMesh>
  );
}

/* Picks slots near the camera each tick; renders <Model> for the nearest N. */
function ActiveModels() {
  const { camera } = useThree();
  const [active, setActive] = useState<Slot[]>([]);
  const lastUpdate = useRef(0);

  useFrame((_, delta) => {
    // Throttle to ~4x/sec — distance check across 6.5K slots is fine but
    // re-rendering React for every frame is wasteful.
    lastUpdate.current += delta;
    if (lastUpdate.current < 0.25) return;
    lastUpdate.current = 0;
    const cam = camera.position;
    const near: Array<{ slot: Slot; d: number }> = [];
    for (const slot of allSlots) {
      const dx = slot.position[0] - cam.x;
      const dz = slot.position[2] - cam.z;
      const d = Math.hypot(dx, dz);
      if (d < LOAD_RADIUS) near.push({ slot, d });
    }
    near.sort((a, b) => a.d - b.d);
    const next = near.slice(0, MAX_ACTIVE).map((n) => n.slot);
    setActive((prev) => {
      // Stable comparison by index set
      if (prev.length !== next.length) return next;
      for (let i = 0; i < prev.length; i++)
        if (prev[i].index !== next[i].index) return next;
      return prev;
    });
  });

  return (
    <>
      {active.map((slot) => (
        <Suspense key={slot.index} fallback={null}>
          <group position={slot.position}>
            <FittedModel url={slot.model.file} />
          </group>
        </Suspense>
      ))}
    </>
  );
}

/* Model auto-scaled to fit inside a unit cell so size variance doesn't break the grid. */
function FittedModel({ url }: { url: string }) {
  const group = useRef<import("three").Group>(null);
  const [s, setS] = useState(1);
  useEffect(() => {
    if (!group.current) return;
    const box = new Box3().setFromObject(group.current);
    const size = box.getSize(new Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    setS(1.8 / maxDim);
  }, [url]);
  return (
    <group ref={group} scale={s}>
      <Model url={url} />
    </group>
  );
}

/* Sparse Text labels for pack heads near the camera (real Text is expensive). */
function PackLabels() {
  const { camera } = useThree();
  const [visible, setVisible] = useState<Slot[]>([]);
  const t = useRef(0);
  useFrame((_, delta) => {
    t.current += delta;
    if (t.current < 0.4) return;
    t.current = 0;
    const cam = camera.position;
    const list: Slot[] = [];
    for (const slot of allSlots) {
      if (!slot.isPackHead) continue;
      const dx = slot.position[0] - cam.x;
      const dz = slot.position[2] - cam.z;
      if (Math.hypot(dx, dz) < LABEL_RADIUS) list.push(slot);
    }
    setVisible(list);
  });
  return (
    <>
      {visible.map((slot) => (
        <Billboard
          key={slot.pack.id}
          position={[slot.position[0] - 1.5, 2.6, slot.position[2]]}
          follow
        >
          <Text fontSize={0.55} color="#ffd84d" anchorX="left" anchorY="middle">
            {`${slot.pack.vendor} · ${slot.pack.label} (${slot.pack.count})`}
          </Text>
        </Billboard>
      ))}
    </>
  );
}

/* Big dark floor stretching across the world bounds. */
function Floor() {
  const w = worldBounds.max[0] + 40;
  const d = worldBounds.max[2] + 40;
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[w / 2 - 20, 0, d / 2 - 20]} receiveShadow>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial color="#0e0e12" roughness={1} />
    </mesh>
  );
}

/* Centered crosshair + click-to-lock overlay */
function Crosshair() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        display: "grid",
        placeItems: "center",
      }}
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          border: "1px solid rgba(255,255,255,0.7)",
          boxShadow: "0 0 4px rgba(0,0,0,0.5)",
        }}
      />
    </div>
  );
}

/* On-screen help / status */
function HUD() {
  return (
    <>
      <div
        style={{
          position: "fixed",
          top: 12,
          left: 12,
          padding: "8px 12px",
          background: "rgba(0,0,0,0.55)",
          color: "white",
          fontSize: 12,
          borderRadius: 6,
          pointerEvents: "auto",
          lineHeight: 1.5,
        }}
      >
        <strong>All models</strong> — {allSlots.length.toLocaleString()} slots
        <br />
        Click canvas to lock cursor · WASD to walk · Space/Shift up/down · Esc to exit
        <br />
        <a href="/" style={{ color: "#ffd84d" }}>
          ← back to packs
        </a>
      </div>
    </>
  );
}
