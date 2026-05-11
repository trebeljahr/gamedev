"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Billboard,
  Environment,
  Html,
  Text,
  PointerLockControls,
} from "@react-three/drei";
import {
  type CSSProperties,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type InstancedMesh,
  Object3D,
  Raycaster,
  Vector2,
  Vector3,
} from "three";
import { Model, type AnimationInfo } from "./Model";
import {
  allSlots,
  distToPackXZ,
  packLayouts,
  worldBounds,
  type PackLayout,
  type Slot,
} from "@/lib/layout";
import { licenseForVendor } from "@/lib/license";

// Load any pack whose nearest edge is within this distance of the camera.
// Pack-coherent loading: when you approach a pack, the whole pack appears at
// once instead of models popping in/out as you walk through it.
const PACK_LOAD_BUFFER = 20;
const PACK_LABEL_BUFFER = 24; // labels appear slightly before models
const SELECT_RADIUS = 10; // max click-to-select reach
const MAX_MODELS = 500; // safety cap on concurrent loaded models
// Cap how many new GLBs mount per frame. GLTF parse + material lift run
// synchronously when a GroundedModel's Suspense resolves; mounting a whole
// 200+ model pack in one tick stalls the main thread for hundreds of ms.
// Drip-feeding spreads the cost so the camera + animations stay at 60fps.
// Unloads (when a pack leaves the buffer) happen all at once — those are
// cheap.
const MOUNT_PER_TICK = 6;
const MOVE_SPEED = 12; // units/sec
const WORLD_HEIGHT = 2;

// Placeholder base: a thin slab whose XZ footprint matches each model's
// actual bbox (from the manifest). Y is constant; X and Z scale per-instance.
const BASE_THICKNESS = 0.2;
const BASE_CENTER_Y = BASE_THICKNESS / 2;
const BASE_TOP_Y = BASE_THICKNESS + 0.005; // top of base + tiny lift

export function AllModelsScene() {
  const start = useMemo<[number, number, number]>(
    () => [6, WORLD_HEIGHT + 1.5, -4],
    [],
  );
  const [mounted, setMounted] = useState<Slot[]>([]);
  const [selected, setSelected] = useState<Slot | null>(null);
  const [hoverInspect, setHoverInspect] = useState(false);
  const [playAnim, setPlayAnim] = useState<string | null>(null);
  const animsRef = useRef<Map<number, AnimationInfo>>(new Map());

  const onSelect = useCallback((slot: Slot) => {
    setSelected(slot);
    setPlayAnim(null);
    document.exitPointerLock?.();
  }, []);

  const setAnimInfo = useCallback(
    (slotIndex: number, info: AnimationInfo | null) => {
      if (info) animsRef.current.set(slotIndex, info);
      else animsRef.current.delete(slotIndex);
    },
    [],
  );

  return (
    <>
      <Canvas
        // near=0.5 (not 0.1) + logarithmicDepthBuffer drastically improves
        // depth precision at distance. Without this, packs with many
        // coplanar-ish surfaces (kenney 3d-road-tiles is the worst — every
        // tile is a stack of road body / sidewalks / building bases at
        // similar Y) z-fight in stripey bands once you're 50+ units away.
        camera={{ position: start, fov: 60, near: 0.5, far: 800 }}
        shadows
        dpr={[1, 2]}
        gl={{ antialias: true, logarithmicDepthBuffer: true }}
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
        <Walker />
        <Selector
          onSelect={onSelect}
          onHoverChange={setHoverInspect}
          panelOpen={!!selected}
          onPanelClose={() => setSelected(null)}
        />
        <Placeholders />
        <Floor />
        <ActiveModels
          mounted={mounted}
          onMountedChange={setMounted}
          selectedIndex={selected?.index ?? null}
          playAnim={playAnim}
          onAnimInfo={setAnimInfo}
        />
        <PackLabels />
        <Suspense fallback={null}>
          <Environment preset="warehouse" environmentIntensity={0.35} />
        </Suspense>
        <PointerLockControls />
      </Canvas>
      <Crosshair hovering={hoverInspect && !selected} />
      <HUD panelOpen={!!selected} />
      {selected && (
        <ModelPanel
          slot={selected}
          animationInfo={animsRef.current.get(selected.index) ?? null}
          playAnim={playAnim}
          onPlay={setPlayAnim}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}

/* Camera walker — WASD + Space (up) / C (down), Shift held = sprint.
   Uses raw window listeners to avoid drei API drift. */
function Walker() {
  const { camera } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "Shift") {
        keys.current.shift = true;
        return;
      }
      keys.current[e.key.toLowerCase()] = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Shift") {
        keys.current.shift = false;
        return;
      }
      keys.current[e.key.toLowerCase()] = false;
    };
    const blur = () => {
      keys.current = {};
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);
  useFrame((_, delta) => {
    const k = keys.current;
    const fwd = new Vector3();
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    fwd.normalize();
    const right = new Vector3()
      .crossVectors(fwd, new Vector3(0, 1, 0))
      .normalize();
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

/* Raycaster + panel close handler — single canvas click listener.
   While pointer is locked: raycast from crosshair, open panel if a model
   in range is hit.
   While pointer is NOT locked AND the panel is open: this click means the
   user is reaching for the canvas (drei will re-acquire pointer lock on
   the same event); close the panel so they're back in walking mode. */
function Selector({
  onSelect,
  onHoverChange,
  panelOpen,
  onPanelClose,
}: {
  onSelect: (slot: Slot) => void;
  onHoverChange?: (hovering: boolean) => void;
  panelOpen: boolean;
  onPanelClose: () => void;
}) {
  const { camera, gl, scene } = useThree();
  const panelOpenRef = useRef(panelOpen);
  const raycasterRef = useRef<Raycaster>(null);
  if (!raycasterRef.current) raycasterRef.current = new Raycaster();
  const centerRef = useRef<Vector2>(null);
  if (!centerRef.current) centerRef.current = new Vector2(0, 0);
  const hoverRef = useRef(false);
  const sinceHoverCheck = useRef(0);
  useEffect(() => {
    panelOpenRef.current = panelOpen;
  }, [panelOpen]);

  // Hit-test what's under the crosshair. Returns a Slot if a model is hit
  // within SELECT_RADIUS, else null. Shared by hover (each tick) and click.
  function pickSlot(): Slot | null {
    const raycaster = raycasterRef.current!;
    raycaster.setFromCamera(centerRef.current!, camera);
    const hits = raycaster.intersectObjects(scene.children, true);
    for (const hit of hits) {
      let o: Object3D | null = hit.object;
      while (o) {
        const slot = (o.userData as { slot?: Slot } | undefined)?.slot;
        if (slot) return hit.distance <= SELECT_RADIUS ? slot : null;
        o = o.parent;
      }
    }
    return null;
  }

  // Throttled hover detection — ~12Hz is enough for responsive cursor
  // feedback without running a full-scene raycast every frame.
  useFrame((_, delta) => {
    sinceHoverCheck.current += delta;
    if (sinceHoverCheck.current < 0.08) return;
    sinceHoverCheck.current = 0;
    const el = gl.domElement;
    const locked = document.pointerLockElement === el;
    const hovering = locked && !panelOpenRef.current && pickSlot() !== null;
    if (hovering !== hoverRef.current) {
      hoverRef.current = hovering;
      onHoverChange?.(hovering);
    }
  });

  useEffect(() => {
    const el = gl.domElement;
    function onClick(e: MouseEvent) {
      if (e.button !== 0) return;
      if (document.pointerLockElement !== el) {
        // Not yet locked: drei is about to re-lock on this click. If the panel
        // was open, that means we're transitioning back to walking — close it.
        if (panelOpenRef.current) onPanelClose();
        return;
      }
      const slot = pickSlot();
      if (slot) {
        onSelect(slot);
        // drei's PointerLockControls listens for clicks on document and calls
        // controls.lock() on every one. Without stopPropagation, our
        // exitPointerLock in onSelect fires, then drei's document handler
        // re-acquires the lock on the same click — the panel opens but the
        // cursor stays trapped. Stopping the bubble keeps drei out.
        e.stopPropagation();
      }
    }
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
    // pickSlot is stable via refs; we intentionally omit it to avoid re-binding
    // the click listener every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, onSelect, onPanelClose]);
  return null;
}

/* Massive InstancedMesh of placeholder slabs — one per slot. Each instance
   is centred on its cell and scaled to the *model's* raw XZ footprint, NOT
   the padded cell size, so adjacent bases get a CELL_PAD gap between them.
   Geometry is a unit cube; the per-instance scale matrix stretches it. */
function Placeholders() {
  const ref = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  useEffect(() => {
    if (!ref.current) return;
    for (let i = 0; i < allSlots.length; i++) {
      const slot = allSlots[i];
      const [x, _y, z] = slot.position;
      const [cw, cd] = slot.cellSize;
      const [mw, _mh, md] = slot.model.size;
      dummy.position.set(x + cw / 2, BASE_CENTER_Y, z + cd / 2);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(mw, BASE_THICKNESS, md);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
    }
    ref.current.instanceMatrix.needsUpdate = true;
  }, [dummy]);
  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, allSlots.length]}
      frustumCulled={false}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#5d5d6b" roughness={0.7} />
    </instancedMesh>
  );
}

/* Picks whole packs near the camera each tick; renders every model in those
   packs. Loading is pack-atomic — you never see a partial pack. Mounting is
   drip-fed at MOUNT_PER_TICK to keep frames smooth as packs come into view.
   Each mounted model group carries userData.slot so the raycaster can find
   which slot was clicked. */
function ActiveModels({
  mounted,
  onMountedChange,
  selectedIndex,
  playAnim,
  onAnimInfo,
}: {
  mounted: Slot[];
  onMountedChange: (next: Slot[] | ((prev: Slot[]) => Slot[])) => void;
  selectedIndex: number | null;
  playAnim: string | null;
  onAnimInfo: (slotIndex: number, info: AnimationInfo | null) => void;
}) {
  const { camera } = useThree();
  const target = useRef<Slot[]>([]);
  const targetIds = useRef<Set<number>>(new Set());
  const sinceTargetScan = useRef(0);

  useFrame((_, delta) => {
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
      const slotDist2 = (s: Slot) => {
        const dx = s.position[0] - cx;
        const dz = s.position[2] - cz;
        return dx * dx + dz * dz;
      };
      const next: Slot[] = [];
      const nextIds = new Set<number>();
      for (const { pl } of near) {
        if (next.length > 0 && next.length + pl.slots.length > MAX_MODELS) break;
        const ordered = pl.slots
          .slice()
          .sort((a, b) => slotDist2(a) - slotDist2(b));
        for (const s of ordered) {
          next.push(s);
          nextIds.add(s.index);
        }
        if (next.length >= MAX_MODELS) break;
      }
      target.current = next;
      targetIds.current = nextIds;
    }

    onMountedChange((prev) => {
      const ids = targetIds.current;
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
          <GroundedModel
            slot={slot}
            playAnimation={
              selectedIndex === slot.index ? playAnim ?? undefined : undefined
            }
            onAnimInfo={onAnimInfo}
          />
        </Suspense>
      ))}
    </>
  );
}

/* Renders the model at its native GLB scale, centred over the slot's base
   and grounded so the model's bottom sits at BASE_TOP_Y. Bbox metrics come
   from the manifest (computed once at build-manifest time by
   scripts/build-manifest.ts), so the model mounts at the right transform
   from the first frame — no scale-then-shrink flicker.

   The wrapping <group userData={{ slot }} /> is what the raycaster walks up
   to figure out which slot was clicked. */
function GroundedModel({
  slot,
  playAnimation,
  onAnimInfo,
}: {
  slot: Slot;
  playAnimation?: string;
  onAnimInfo: (slotIndex: number, info: AnimationInfo | null) => void;
}) {
  const [sx, _sy, sz] = slot.position;
  const [cw, cd] = slot.cellSize;
  const [cxLocal, czLocal] = slot.model.cxz ?? [0, 0];
  // Cell centre in world coords, then offset by the GLB's local bbox centre
  // so the model's bbox lands centred on its base. Vast majority of GLBs are
  // origin-centred and cxz is ~0, but some have off-origin meshes.
  const x = sx + cw / 2 - cxLocal;
  const z = sz + cd / 2 - czLocal;
  const y = BASE_TOP_Y - (slot.model.minY ?? 0);

  const slotIndex = slot.index;
  const reportAnim = useCallback(
    (info: AnimationInfo | null) => onAnimInfo(slotIndex, info),
    [onAnimInfo, slotIndex],
  );

  return (
    <group position={[x, y, z]} userData={{ slot }}>
      <Model
        url={slot.model.file}
        playAnimation={playAnimation}
        onAnimationsLoaded={reportAnim}
      />
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
        <group
          key={pl.pack.id}
          position={[pl.bounds.minX - 1.5, 3.4, pl.bounds.minZ]}
        >
          <Billboard follow>
            <Text fontSize={0.55} color="#ffd84d" anchorX="left" anchorY="middle">
              {`${pl.pack.vendor} · ${pl.pack.label} (${pl.pack.count})`}
            </Text>
          </Billboard>
          <Html
            position={[0, -0.7, 0]}
            transform
            sprite
            distanceFactor={6}
            zIndexRange={[100, 0]}
          >
            <a
              href={`/api/packs/${pl.pack.vendor}/${pl.pack.pack}/zip`}
              download={`${pl.pack.vendor}_${pl.pack.pack}.zip`}
              title="Esc to unlock cursor, then click"
              style={downloadBtnStyle}
            >
              ⬇ download pack
            </a>
          </Html>
        </group>
      ))}
    </>
  );
}

const downloadBtnStyle: CSSProperties = {
  display: "inline-block",
  padding: "4px 10px",
  background: "#ffd84d",
  color: "#1a1a20",
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 4,
  textDecoration: "none",
  whiteSpace: "nowrap",
  fontFamily: "system-ui, -apple-system, sans-serif",
  boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
  border: "1px solid rgba(0,0,0,0.2)",
  userSelect: "none",
};

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

/* Centered crosshair. When the crosshair sits over a clickable model within
   SELECT_RADIUS, swap the plain dot for a yellow magnifying-glass icon so the
   user knows clicking will open the inspector. */
function Crosshair({ hovering }: { hovering: boolean }) {
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
      {hovering ? (
        <svg
          width="28"
          height="28"
          viewBox="0 0 28 28"
          fill="none"
          style={{
            filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.75))",
            transition: "transform 90ms ease-out",
            transform: "scale(1)",
          }}
        >
          <circle
            cx="11.5"
            cy="11.5"
            r="6.5"
            stroke="rgba(255,255,255,0.95)"
            strokeWidth="2"
            fill="rgba(255,255,255,0.08)"
          />
          <line
            x1="16.5"
            y1="16.5"
            x2="23"
            y2="23"
            stroke="rgba(255,255,255,0.95)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            border: "1px solid rgba(255,255,255,0.7)",
            boxShadow: "0 0 4px rgba(0,0,0,0.5)",
          }}
        />
      )}
    </div>
  );
}

/* On-screen help / status */
function HUD({ panelOpen }: { panelOpen: boolean }) {
  return (
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
      {panelOpen
        ? "Click canvas to resume walking"
        : "Click canvas to lock cursor"}
      {" · "}WASD walk · Space up · C down · Shift sprint · click a nearby model
      to inspect
      <br />
      <a href="/" style={{ color: "#ffd84d" }}>
        ← back to packs
      </a>
    </div>
  );
}

/* Right-side panel for the selected model. Plain HTML so it can capture
   pointer events while pointer-lock is released. */
function ModelPanel({
  slot,
  animationInfo,
  playAnim,
  onPlay,
  onClose,
}: {
  slot: Slot;
  animationInfo: AnimationInfo | null;
  playAnim: string | null;
  onPlay: (name: string | null) => void;
  onClose: () => void;
}) {
  const license = licenseForVendor(slot.pack.vendor);
  const downloadName = `${slot.model.label.replace(/\s+/g, "_")}.glb`;
  return (
    <div
      style={{
        position: "fixed",
        top: 12,
        right: 12,
        bottom: 12,
        width: 320,
        background: "rgba(16,16,22,0.92)",
        color: "white",
        fontSize: 13,
        borderRadius: 8,
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        border: "1px solid rgba(255,255,255,0.08)",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        overflowY: "auto",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 11,
              color: "#8a8a93",
              textTransform: "uppercase",
              letterSpacing: 0.05,
            }}
          >
            {slot.pack.vendor} · {slot.pack.label}
          </div>
          <div
            style={{
              fontWeight: 600,
              fontSize: 16,
              wordBreak: "break-word",
            }}
          >
            {slot.model.label}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          style={{
            background: "transparent",
            color: "white",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 4,
            padding: "0 8px",
            cursor: "pointer",
            fontSize: 16,
            lineHeight: 1.5,
            height: 28,
          }}
        >
          ×
        </button>
      </div>

      <a
        href={slot.model.file}
        download={downloadName}
        style={{
          display: "inline-block",
          textAlign: "center",
          background: "#ffd84d",
          color: "#1a1a20",
          padding: "8px 12px",
          borderRadius: 6,
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        Download GLB
      </a>

      <div style={{ fontSize: 11, color: "#8a8a93" }}>
        File:{" "}
        <span style={{ color: "#cfcfd4", wordBreak: "break-all" }}>
          {slot.model.file}
        </span>
      </div>

      <Section title="License">
        <div>
          <strong>{license.license}</strong>
          {license.licenseUrl && (
            <>
              {" "}·{" "}
              <a
                href={license.licenseUrl}
                target="_blank"
                rel="noreferrer"
                style={{ color: "#ffd84d" }}
              >
                terms
              </a>
            </>
          )}
        </div>
        <div style={{ fontSize: 11, color: "#8a8a93", marginTop: 4 }}>
          {license.vendorUrl ? (
            <>
              by{" "}
              <a
                href={license.vendorUrl}
                target="_blank"
                rel="noreferrer"
                style={{ color: "#cfcfd4" }}
              >
                {license.vendorLabel}
              </a>
            </>
          ) : (
            <>by {license.vendorLabel}</>
          )}
          {license.attributionRequired
            ? " · attribution required"
            : " · attribution optional"}
        </div>
        {license.notes && (
          <div style={{ fontSize: 11, color: "#8a8a93", marginTop: 4 }}>
            {license.notes}
          </div>
        )}
      </Section>

      <Section title="Animations">
        {animationInfo && animationInfo.names.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {animationInfo.names.map((name) => {
              const active = playAnim === name;
              return (
                <button
                  type="button"
                  key={name}
                  onClick={() => onPlay(active ? null : name)}
                  style={{
                    textAlign: "left",
                    background: active
                      ? "rgba(255,216,77,0.18)"
                      : "rgba(255,255,255,0.04)",
                    color: active ? "#ffd84d" : "white",
                    border: `1px solid ${
                      active ? "#ffd84d" : "rgba(255,255,255,0.08)"
                    }`,
                    borderRadius: 4,
                    padding: "6px 8px",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: 12,
                  }}
                >
                  {name}
                </button>
              );
            })}
          </div>
        ) : (
          <div style={{ color: "#8a8a93", fontSize: 12 }}>
            No animations in this model.
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          color: "#8a8a93",
          textTransform: "uppercase",
          letterSpacing: 0.08,
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}
