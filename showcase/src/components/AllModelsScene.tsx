"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Billboard, Environment, Text, PointerLockControls, useGLTF } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  Box3,
  type InstancedMesh,
  Object3D,
  Vector3,
} from "three";
import { Model } from "./Model";
import {
  allSlots,
  distToPackXZ,
  packLayouts,
  worldBounds,
  type PackLayout,
  type Slot,
} from "@/lib/layout";

// Load any pack whose nearest edge is within this distance of the camera.
// Pack-coherent loading: when you approach a pack, the whole pack appears at
// once instead of models popping in/out as you walk through it.
const PACK_LOAD_BUFFER = 20;
const PACK_LABEL_BUFFER = 24; // labels appear slightly before models
const MAX_MODELS = 500; // safety cap on concurrent loaded models
// Cap how many new GLBs mount per frame. GLTF parse + material lift + bbox
// fit each run synchronously when a <FittedModel> first resolves; mounting
// a whole 200+ model pack in one tick stalls the main thread for hundreds
// of ms. Drip-feeding spreads the cost so the camera + animations stay at
// 60fps. Unloads (when a pack leaves the buffer) happen all at once — those
// are cheap.
const MOUNT_PER_TICK = 6;
const MOVE_SPEED = 12; // units/sec
const WORLD_HEIGHT = 2;

// Placeholder base: 1.2 × 0.2 × 1.2 box centered at y=0.5, so the top sits
// at y=0.6. Models are grounded so their bottom rests slightly above this
// (BASE_TOP_Y) to avoid base-intersection and z-fighting on the floor.
const BASE_CENTER_Y = 0.5;
const BASE_TOP_Y = BASE_CENTER_Y + 0.1 + 0.005; // top + small lift

export function AllModelsScene() {
  const start = useMemo<[number, number, number]>(() => {
    return [6, WORLD_HEIGHT + 1.5, -4];
  }, []);
  const [sprinting, setSprinting] = useState(false);

  return (
    <>
      <Canvas
        camera={{ position: start, fov: 60, near: 0.1, far: 800 }}
        shadows
        dpr={[1, 2]}
        gl={{ antialias: true }}
      >
        <color attach="background" args={["#1a1a20"]} />
        <fog attach="fog" args={["#1a1a20", 80, 380]} />
        <ambientLight intensity={0.65} />
        <directionalLight
          position={[60, 80, 40]}
          intensity={1.3}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <hemisphereLight args={["#b1c1d4", "#2a2a32", 0.4]} />
        <Walker onSprintChange={setSprinting} />
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
      <HUD sprinting={sprinting} />
    </>
  );
}

/* Camera walker — WASD + Space (up) / C (down), Shift held = sprint.
   Uses raw window listeners to avoid drei API drift. */
function Walker({ onSprintChange }: { onSprintChange?: (s: boolean) => void }) {
  const { camera } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  useEffect(() => {
    const setShift = (v: boolean) => {
      if (keys.current.shift === v) return;
      keys.current.shift = v;
      onSprintChange?.(v);
    };
    const down = (e: KeyboardEvent) => {
      if (e.key === "Shift") {
        setShift(true);
        return;
      }
      keys.current[e.key.toLowerCase()] = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Shift") {
        setShift(false);
        return;
      }
      keys.current[e.key.toLowerCase()] = false;
    };
    const blur = () => {
      keys.current = {};
      onSprintChange?.(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [onSprintChange]);
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
    if (k.c) dy -= 1;
    const mag = Math.hypot(dx, dy, dz);
    if (mag > 0) {
      const speed = k.shift ? MOVE_SPEED * 3 : MOVE_SPEED;
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
      const [x, _y, z] = allSlots[i].position;
      dummy.position.set(x, BASE_CENTER_Y, z);
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

/* Picks whole packs near the camera each tick; renders every model in those
   packs. Loading is pack-atomic — you never see a partial pack. Mounting is
   drip-fed at MOUNT_PER_TICK to keep frames smooth as packs come into view. */
function ActiveModels() {
  const { camera } = useThree();
  const [mounted, setMounted] = useState<Slot[]>([]);
  const target = useRef<Slot[]>([]);
  const targetIds = useRef<Set<number>>(new Set());
  const sinceTargetScan = useRef(0);

  useFrame((_, delta) => {
    // Recompute the target set ~4x/sec — distance check across ~100 pack
    // rects is cheap; doing it every frame would still be fine, but the
    // throttle removes needless allocation.
    sinceTargetScan.current += delta;
    if (sinceTargetScan.current >= 0.25) {
      sinceTargetScan.current = 0;
      const cx = camera.position.x;
      const cz = camera.position.z;
      const near: Array<{ pl: PackLayout; d: number }> = [];
      for (const pl of packLayouts) {
        const d = distToPackXZ(cx, cz, pl.bounds);
        if (d < PACK_LOAD_BUFFER) near.push({ pl, d });
      }
      near.sort((a, b) => a.d - b.d);
      const next: Slot[] = [];
      const nextIds = new Set<number>();
      for (const { pl } of near) {
        // Atomic pack inclusion: skip a pack if adding it would bust the cap,
        // unless nothing has been loaded yet (you're standing inside it).
        if (next.length > 0 && next.length + pl.slots.length > MAX_MODELS) break;
        for (const s of pl.slots) {
          next.push(s);
          nextIds.add(s.index);
        }
        if (next.length >= MAX_MODELS) break;
      }
      target.current = next;
      targetIds.current = nextIds;
    }

    // Reconcile `mounted` toward `target` every frame. Drops are immediate
    // (cheap unmount); additions are rate-limited (each new <FittedModel>
    // triggers a sync GLTF parse + scene traversal when its Suspense
    // resolves — doing many in one frame stalls the main thread).
    setMounted((prev) => {
      const ids = targetIds.current;
      // Fast path: already caught up. setMounted returning prev short-circuits
      // React's render, so this runs every frame at near-zero cost.
      if (prev.length === ids.size) {
        let same = true;
        for (let i = 0; i < prev.length; i++) {
          if (!ids.has(prev[i].index)) {
            same = false;
            break;
          }
        }
        if (same) return prev;
      }
      const kept = prev.filter((s) => ids.has(s.index));
      const have = new Set<number>();
      for (const s of kept) have.add(s.index);
      let added = 0;
      for (const s of target.current) {
        if (added >= MOUNT_PER_TICK) break;
        if (!have.has(s.index)) {
          kept.push(s);
          added++;
        }
      }
      return kept;
    });
  });

  return (
    <>
      {mounted.map((slot) => (
        <Suspense key={slot.index} fallback={null}>
          <group position={slot.position}>
            <FittedModel url={slot.model.file} />
          </group>
        </Suspense>
      ))}
    </>
  );
}

/* Auto-scales the model to fit inside a unit cell AND grounds it on top of
   the placeholder base. Measurement happens synchronously off the loaded
   gltf scene (via useGLTF) before the model mounts — no scale-then-shrink
   flicker, no intersection with the base. */
function FittedModel({ url }: { url: string }) {
  const gltf = useGLTF(url) as unknown as { scene: import("three").Object3D };

  const { scale, yOffset } = useMemo(() => {
    // Make sure world matrices on the loaded scene are current before measuring.
    gltf.scene.updateMatrixWorld(true);
    const box = new Box3().setFromObject(gltf.scene);
    const size = box.getSize(new Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const s = 1.8 / maxDim;
    // After scaling, model's local-min-y lands at box.min.y * s. Lift it so
    // the model's bottom sits at BASE_TOP_Y.
    return { scale: s, yOffset: BASE_TOP_Y - box.min.y * s };
  }, [gltf.scene]);

  return (
    <group position={[0, yOffset, 0]} scale={scale}>
      <Model url={url} />
    </group>
  );
}

/* Sparse Text labels for packs near the camera (real Text is expensive).
   Visibility tracks pack-rect distance so labels appear consistently for big
   and small packs. */
function PackLabels() {
  const { camera } = useThree();
  const [visible, setVisible] = useState<PackLayout[]>([]);
  const t = useRef(0);
  useFrame((_, delta) => {
    t.current += delta;
    if (t.current < 0.4) return;
    t.current = 0;
    const cx = camera.position.x;
    const cz = camera.position.z;
    const list: PackLayout[] = [];
    for (const pl of packLayouts) {
      if (distToPackXZ(cx, cz, pl.bounds) < PACK_LABEL_BUFFER) list.push(pl);
    }
    setVisible(list);
  });
  return (
    <>
      {visible.map((pl) => (
        <Billboard
          key={pl.pack.id}
          position={[pl.bounds.minX - 1.5, 2.6, pl.bounds.minZ]}
          follow
        >
          <Text fontSize={0.55} color="#ffd84d" anchorX="left" anchorY="middle">
            {`${pl.pack.vendor} · ${pl.pack.label} (${pl.pack.count})`}
          </Text>
        </Billboard>
      ))}
    </>
  );
}

/* Big dark floor stretching across the world bounds. Sits just below y=0 to
   avoid z-fighting with anything placed on the y=0 plane. */
function Floor() {
  const w = worldBounds.max[0] + 40;
  const d = worldBounds.max[2] + 40;
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[w / 2 - 20, -0.01, d / 2 - 20]}
      receiveShadow
    >
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
function HUD({ sprinting }: { sprinting: boolean }) {
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
        Click canvas to lock cursor · WASD walk · Space up · C down ·{" "}
        <span
          style={{
            color: sprinting ? "#1a1a20" : "white",
            background: sprinting ? "#ffd84d" : "transparent",
            padding: sprinting ? "0 4px" : 0,
            borderRadius: 3,
            fontWeight: sprinting ? 600 : 400,
          }}
        >
          Shift sprint {sprinting ? "ON" : "off"}
        </span>{" "}
        · Esc to exit
        <br />
        <a href="/" style={{ color: "#ffd84d" }}>
          ← back to packs
        </a>
      </div>
    </>
  );
}
