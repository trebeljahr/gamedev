"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Billboard,
  Environment,
  Text,
  PointerLockControls,
} from "@react-three/drei";
import {
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
  allModelsLayout,
  distToPackXZ,
  layoutForPackId,
  layoutPackModels,
  type PackLayout,
  type Slot,
  type WorldBounds,
} from "@/lib/layout";
import { assetUrl, type Pack } from "@/lib/manifest";
import { licenseForVendor } from "@/lib/license";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LicenseLink } from "@/components/LicenseLink";
import { uniqueTags } from "@/lib/tags";

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

type SceneTheme = {
  background: string;
  fog: [string, number, number];
  floor: string;
  base: string;
  ambient: number;
  directionalPosition: [number, number, number];
  directionalIntensity: number;
  hemisphere: [string, string, number];
  environmentPreset: "warehouse" | "city";
  environmentIntensity: number;
};

const ARCHIVE_THEME: SceneTheme = {
  background: "#1a1a20",
  fog: ["#1a1a20", 80, 380],
  floor: "#0e0e12",
  base: "#5d5d6b",
  ambient: 0.65,
  directionalPosition: [60, 80, 40],
  directionalIntensity: 1.3,
  hemisphere: ["#b1c1d4", "#2a2a32", 0.4],
  environmentPreset: "warehouse",
  environmentIntensity: 0.35,
};

const PACK_STUDIO_THEME: SceneTheme = {
  background: "#f5efe6",
  fog: ["#f5efe6", 120, 420],
  floor: "#eadfce",
  base: "#3a3e48",
  ambient: 0.72,
  directionalPosition: [22, 28, 16],
  directionalIntensity: 1.55,
  hemisphere: ["#fff4d0", "#7a756c", 0.58],
  environmentPreset: "city",
  environmentIntensity: 0.5,
};

type ModelGridSceneProps = {
  slots: Slot[];
  layouts: PackLayout[];
  bounds: WorldBounds;
  title: string;
  backHref: string;
  backLabel: string;
  theme: SceneTheme;
  start?: [number, number, number];
  loadAll?: boolean;
  showHud?: boolean;
  showPackLabels?: boolean;
  showModelPanel?: boolean;
  allowArrowWalk?: boolean;
  selectedIndex?: number | null;
  onSelectedIndexChange?: (index: number) => void;
};

function startForBounds(bounds: WorldBounds): [number, number, number] {
  const [width, _height, depth] = bounds.max;
  return [
    Math.min(Math.max(width * 0.18, 4), 18),
    WORLD_HEIGHT + 1.5,
    -Math.min(Math.max(depth * 0.08, 4), 14),
  ];
}

export function AllModelsScene({
  packId,
}: {
  packId?: string;
}) {
  const sceneLayout = useMemo(
    () => (packId ? layoutForPackId(packId) ?? allModelsLayout : allModelsLayout),
    [packId],
  );
  const start = useMemo(() => startForBounds(sceneLayout.bounds), [sceneLayout]);
  const isPackScene = sceneLayout.packs.length === 1 && !!packId;
  const title = isPackScene ? sceneLayout.packs[0].pack.title : "All models";
  const backHref = isPackScene
    ? `/${sceneLayout.packs[0].pack.vendor}/${sceneLayout.packs[0].pack.pack}`
    : "/#3d-packs";
  const backLabel = isPackScene ? "back to kit" : "back to packs";

  return (
    <ModelGridScene
      slots={sceneLayout.slots}
      layouts={sceneLayout.packs}
      bounds={sceneLayout.bounds}
      title={title}
      backHref={backHref}
      backLabel={backLabel}
      theme={isPackScene ? PACK_STUDIO_THEME : ARCHIVE_THEME}
      start={start}
      loadAll={isPackScene}
      showHud
      showPackLabels={!isPackScene}
      showModelPanel
    />
  );
}

export function PackModelsScene({
  pack,
  selectedIndex,
  onSelectedIndexChange,
}: {
  pack: Pack;
  selectedIndex: number;
  onSelectedIndexChange: (index: number) => void;
}) {
  const layout = useMemo(() => layoutPackModels(pack), [pack]);
  const start = useMemo(() => startForBounds(layout.bounds), [layout]);
  return (
    <ModelGridScene
      slots={layout.slots}
      layouts={[layout.packLayout]}
      bounds={layout.bounds}
      title={pack.title}
      backHref="/#3d-packs"
      backLabel="back to packs"
      theme={PACK_STUDIO_THEME}
      start={start}
      loadAll
      showHud={false}
      showPackLabels={false}
      showModelPanel={false}
      allowArrowWalk={false}
      selectedIndex={selectedIndex}
      onSelectedIndexChange={onSelectedIndexChange}
    />
  );
}

function ModelGridScene({
  slots,
  layouts,
  bounds,
  title,
  backHref,
  backLabel,
  theme,
  start = [6, WORLD_HEIGHT + 1.5, -4],
  loadAll = false,
  showHud = false,
  showPackLabels = false,
  showModelPanel = false,
  allowArrowWalk = true,
  selectedIndex,
  onSelectedIndexChange,
}: ModelGridSceneProps) {
  const [mounted, setMounted] = useState<Slot[]>([]);
  const [internalSelected, setInternalSelected] = useState<Slot | null>(null);
  const [hoverInspect, setHoverInspect] = useState(false);
  const [playAnim, setPlayAnim] = useState<string | null>(null);
  const animsRef = useRef<Map<number, AnimationInfo>>(new Map());
  const controlledSelected = selectedIndex == null
    ? null
    : slots.find((slot) => slot.index === selectedIndex) ?? null;
  const selected = controlledSelected ?? internalSelected;
  const panelOpen = showModelPanel && !!selected;

  const onSelect = useCallback((slot: Slot) => {
    if (onSelectedIndexChange) onSelectedIndexChange(slot.index);
    else setInternalSelected(slot);
    setPlayAnim(null);
    document.exitPointerLock?.();
  }, [onSelectedIndexChange]);

  const setAnimInfo = useCallback(
    (slotIndex: number, info: AnimationInfo | null) => {
      if (info) animsRef.current.set(slotIndex, info);
      else animsRef.current.delete(slotIndex);
    },
    [],
  );

  useEffect(() => {
    setMounted([]);
    setInternalSelected(null);
    animsRef.current.clear();
  }, [slots]);

  useEffect(() => {
    setPlayAnim(null);
  }, [selected?.index]);

  return (
    <div className="model-grid-scene all-scene-canvas">
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
        <color attach="background" args={[theme.background]} />
        <fog attach="fog" args={theme.fog} />
        <ambientLight intensity={theme.ambient} />
        <directionalLight
          position={theme.directionalPosition}
          intensity={theme.directionalIntensity}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <hemisphereLight args={theme.hemisphere} />
        <Walker allowArrowKeys={allowArrowWalk} />
        <Selector
          onSelect={onSelect}
          onHoverChange={setHoverInspect}
          panelOpen={panelOpen}
          onPanelClose={() => setInternalSelected(null)}
        />
        <Placeholders slots={slots} color={theme.base} />
        <Floor bounds={bounds} color={theme.floor} />
        <ActiveModels
          slots={slots}
          layouts={layouts}
          mounted={mounted}
          onMountedChange={setMounted}
          selectedIndex={selected?.index ?? null}
          playAnim={playAnim}
          onAnimInfo={setAnimInfo}
          loadAll={loadAll}
        />
        {selected && <SelectedMarker slot={selected} />}
        {controlledSelected && <FocusSelectedSlot slot={controlledSelected} />}
        {showPackLabels && <PackLabels layouts={layouts} />}
        <Suspense fallback={null}>
          <Environment
            preset={theme.environmentPreset}
            environmentIntensity={theme.environmentIntensity}
          />
        </Suspense>
        <PointerLockControls selector=".all-scene-canvas canvas" />
      </Canvas>
      <Crosshair hovering={hoverInspect && !panelOpen} />
      {showHud && (
        <HUD
          title={title}
          count={slots.length}
          panelOpen={panelOpen}
          backHref={backHref}
          backLabel={backLabel}
        />
      )}
      {showModelPanel && selected && (
        <ModelPanel
          slot={selected}
          animationInfo={animsRef.current.get(selected.index) ?? null}
          playAnim={playAnim}
          onPlay={setPlayAnim}
          onClose={() => setInternalSelected(null)}
        />
      )}
    </div>
  );
}

/* Camera walker — WASD + Space (up) / C (down), Shift held = sprint.
   Uses raw window listeners to avoid drei API drift. */
function Walker({ allowArrowKeys = true }: { allowArrowKeys?: boolean }) {
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
    if (k.w || (allowArrowKeys && k.arrowup)) {
      dx += fwd.x;
      dz += fwd.z;
    }
    if (k.s || (allowArrowKeys && k.arrowdown)) {
      dx -= fwd.x;
      dz -= fwd.z;
    }
    if (k.d || (allowArrowKeys && k.arrowright)) {
      dx += right.x;
      dz += right.z;
    }
    if (k.a || (allowArrowKeys && k.arrowleft)) {
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
   While pointer is NOT locked AND the panel is open: a direct canvas click
   means the user is reaching for the scene; close the panel so they're back
   in walking mode. */
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
  const raycasterRef = useRef<Raycaster | null>(null);
  if (!raycasterRef.current) raycasterRef.current = new Raycaster();
  const centerRef = useRef<Vector2 | null>(null);
  if (!centerRef.current) centerRef.current = new Vector2(0, 0);
  const hoverRef = useRef(false);
  const sinceHoverCheck = useRef(0);
  useEffect(() => {
    panelOpenRef.current = panelOpen;
  }, [panelOpen]);

  // Hit-test what's under the crosshair. Returns either a model slot
  // (within SELECT_RADIUS) or a pack download link. Shared by hover (each
  // tick, slot-only) and click (both kinds).
  function pickHit(): CrosshairHit | null {
    const raycaster = raycasterRef.current!;
    raycaster.setFromCamera(centerRef.current!, camera);
    const hits = raycaster.intersectObjects(scene.children, true);
    for (const hit of hits) {
      let o: Object3D | null = hit.object;
      while (o) {
        const ud = o.userData as
          | {
              slot?: Slot;
              download?: { href: string; name: string };
            }
          | undefined;
        if (ud?.download)
          return { kind: "download", href: ud.download.href, name: ud.download.name };
        if (ud?.slot)
          return hit.distance <= SELECT_RADIUS
            ? { kind: "slot", slot: ud.slot }
            : null;
        o = o.parent;
      }
    }
    return null;
  }

  // Throttled hover detection — ~12Hz is enough for responsive cursor
  // feedback without running a full-scene raycast every frame. Only the
  // magnifying-glass cursor for inspectable models is wired up; the download
  // text doesn't get its own cursor change.
  useFrame((_, delta) => {
    sinceHoverCheck.current += delta;
    if (sinceHoverCheck.current < 0.08) return;
    sinceHoverCheck.current = 0;
    const el = gl.domElement;
    const locked = document.pointerLockElement === el;
    const hovering =
      locked && !panelOpenRef.current && pickHit()?.kind === "slot";
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
        // Not yet locked: this listener is on the canvas only. If the panel was
        // open, that means we're transitioning back to walking — close it.
        if (panelOpenRef.current) onPanelClose();
        return;
      }
      const hit = pickHit();
      if (!hit) return;
      if (hit.kind === "download") {
        triggerDownload(hit.href, hit.name);
      } else {
        onSelect(hit.slot);
      }
      // drei's PointerLockControls listens for clicks on document and calls
      // controls.lock() on every one. Without stopPropagation, our
      // exitPointerLock in onSelect fires, then drei's document handler
      // re-acquires the lock on the same click — the panel opens but the
      // cursor stays trapped. Stopping the bubble keeps drei out.
      e.stopPropagation();
    }
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
    // pickHit is stable via refs; we intentionally omit it to avoid re-binding
    // the click listener every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, onSelect, onPanelClose]);
  return null;
}

type CrosshairHit =
  | { kind: "slot"; slot: Slot }
  | { kind: "download"; href: string; name: string };

/* Massive InstancedMesh of placeholder slabs — one per slot. Each instance
   is centred on its cell and scaled to the *model's* raw XZ footprint, NOT
   the padded cell size, so adjacent bases get a CELL_PAD gap between them.
   Geometry is a unit cube; the per-instance scale matrix stretches it. */
function Placeholders({ slots, color }: { slots: Slot[]; color: string }) {
  const ref = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  useEffect(() => {
    if (!ref.current) return;
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
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
  }, [dummy, slots]);
  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, slots.length]}
      frustumCulled={false}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={color} roughness={0.7} />
    </instancedMesh>
  );
}

/* Picks whole packs near the camera each tick; renders every model in those
   packs. Loading is pack-atomic — you never see a partial pack. Mounting is
   drip-fed at MOUNT_PER_TICK to keep frames smooth as packs come into view.
   Each mounted model group carries userData.slot so the raycaster can find
   which slot was clicked. */
function ActiveModels({
  slots,
  layouts,
  mounted,
  onMountedChange,
  selectedIndex,
  playAnim,
  onAnimInfo,
  loadAll = false,
}: {
  slots: Slot[];
  layouts: PackLayout[];
  mounted: Slot[];
  onMountedChange: (next: Slot[] | ((prev: Slot[]) => Slot[])) => void;
  selectedIndex: number | null;
  playAnim: string | null;
  onAnimInfo: (slotIndex: number, info: AnimationInfo | null) => void;
  loadAll?: boolean;
}) {
  const { camera } = useThree();
  const target = useRef<Slot[]>([]);
  const targetIds = useRef<Set<number>>(new Set());
  const sinceTargetScan = useRef(0);

  useEffect(() => {
    if (!loadAll) return;
    target.current = slots;
    targetIds.current = new Set(slots.map((slot) => slot.index));
  }, [loadAll, slots]);

  useFrame((_, delta) => {
    if (!loadAll) sinceTargetScan.current += delta;
    if (!loadAll && sinceTargetScan.current >= 0.25) {
      sinceTargetScan.current = 0;
      const cx = camera.position.x;
      const cz = camera.position.z;
      const near: Array<{ pl: PackLayout; d: number }> = [];
      for (const pl of layouts) {
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
        <ErrorBoundary key={slot.index} fallback={null}>
          <Suspense fallback={null}>
            <GroundedModel
              slot={slot}
              playAnimation={
                selectedIndex === slot.index ? playAnim ?? undefined : undefined
              }
              onAnimInfo={onAnimInfo}
            />
          </Suspense>
        </ErrorBoundary>
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
  // Model recenters its geometry's XZ centroid on its local origin, so we
  // just drop it at the cell centre. Y is left alone by Model so we ground
  // it here using the manifest's bbox minY.
  const x = sx + cw / 2;
  const z = sz + cd / 2;
  const y = BASE_TOP_Y - (slot.model.minY ?? 0);

  const slotIndex = slot.index;
  const reportAnim = useCallback(
    (info: AnimationInfo | null) => onAnimInfo(slotIndex, info),
    [onAnimInfo, slotIndex],
  );

  return (
    <group position={[x, y, z]} userData={{ slot }}>
      <Model
        url={assetUrl(slot.model.file)}
        playAnimation={playAnimation}
        onAnimationsLoaded={reportAnim}
      />
    </group>
  );
}

/* Sparse Text labels for packs near the camera (real Text is expensive).
   Visibility tracks pack-rect distance so labels appear consistently for big
   and small packs. */
function PackLabels({ layouts }: { layouts: PackLayout[] }) {
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
    for (const pl of layouts) {
      if (distToPackXZ(cx, cz, pl.bounds) < PACK_LABEL_BUFFER) list.push(pl);
    }
    setVisible(list);
  });
  return (
    <>
      {visible.map((pl) => {
        const href = `/api/packs/${pl.pack.vendor}/${pl.pack.pack}/zip`;
        const filename = `${pl.pack.vendor}_${pl.pack.pack}.zip`;
        return (
          <group
            key={pl.pack.id}
            position={[pl.bounds.minX - 1.5, 3.4, pl.bounds.minZ]}
          >
            <Billboard follow>
              <Text
                fontSize={0.55}
                color="#ffd84d"
                anchorX="left"
                anchorY="middle"
                outlineWidth={0.02}
                outlineColor="#0a0a10"
              >
                {`${pl.pack.vendor} · ${pl.pack.label} (${pl.pack.count})`}
              </Text>
              <group
                position={[0, -0.5, 0]}
                userData={{ download: { href, name: filename } }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (document.pointerLockElement) return;
                  triggerDownload(href, filename);
                }}
                onPointerOver={(e) => {
                  e.stopPropagation();
                  document.body.style.cursor = "pointer";
                }}
                onPointerOut={(e) => {
                  e.stopPropagation();
                  document.body.style.cursor = "";
                }}
              >
                <Text
                  fontSize={0.3}
                  color="#ffd84d"
                  anchorX="left"
                  anchorY="middle"
                  outlineWidth={0.014}
                  outlineColor="#0a0a10"
                >
                  [ download .zip ]
                </Text>
              </group>
            </Billboard>
          </group>
        );
      })}
    </>
  );
}

function triggerDownload(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/* Big dark floor stretching across the world bounds. Sits just below y=0 to
   avoid z-fighting with anything placed on the y=0 plane. */
function Floor({ bounds, color }: { bounds: WorldBounds; color: string }) {
  const w = bounds.max[0] + 40;
  const d = bounds.max[2] + 40;
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[w / 2 - 20, -0.01, d / 2 - 20]}
      receiveShadow
    >
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial color={color} roughness={1} />
    </mesh>
  );
}

function slotCenter(slot: Slot): Vector3 {
  const [sx, _sy, sz] = slot.position;
  const [cw, cd] = slot.cellSize;
  return new Vector3(sx + cw / 2, BASE_TOP_Y + 0.5, sz + cd / 2);
}

function SelectedMarker({ slot }: { slot: Slot }) {
  const center = slotCenter(slot);
  const radius = Math.max(slot.model.size[0], slot.model.size[2], 1) / 2 + 0.42;
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[center.x, BASE_TOP_Y + 0.035, center.z]}
      renderOrder={2}
    >
      <ringGeometry args={[radius, radius + 0.08, 64]} />
      <meshBasicMaterial color="#ffd84d" transparent opacity={0.9} />
    </mesh>
  );
}

function FocusSelectedSlot({ slot }: { slot: Slot }) {
  const { camera } = useThree();
  const target = useRef<{
    position: Vector3;
    lookAt: Vector3;
  } | null>(null);

  useEffect(() => {
    const center = slotCenter(slot);
    const reach = Math.max(5, Math.max(slot.model.size[0], slot.model.size[2]) * 1.35);
    target.current = {
      position: new Vector3(
        center.x + reach,
        Math.max(WORLD_HEIGHT + 1.4, Math.min(9, slot.model.size[1] + 2.2)),
        center.z + reach,
      ),
      lookAt: center,
    };
  }, [slot]);

  useFrame((_, delta) => {
    if (!target.current) return;
    const t = Math.min(1, delta * 3.4);
    camera.position.lerp(target.current.position, t);
    camera.lookAt(target.current.lookAt);
    if (camera.position.distanceTo(target.current.position) < 0.08) {
      target.current = null;
    }
  });

  return null;
}

/* Centered crosshair. When the crosshair sits over a clickable model within
   SELECT_RADIUS, swap the plain dot for a yellow magnifying-glass icon so the
   user knows clicking will open the inspector. */
function Crosshair({ hovering }: { hovering: boolean }) {
  return (
    <div
      style={{
        position: "absolute",
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
function HUD({
  title,
  count,
  panelOpen,
  backHref,
  backLabel,
}: {
  title: string;
  count: number;
  panelOpen: boolean;
  backHref: string;
  backLabel: string;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: "var(--scene-header-offset)",
        left: 12,
        right: 12,
        maxWidth: "calc(100vw - 24px)",
        padding: "8px 12px",
        background: "rgba(0,0,0,0.55)",
        color: "white",
        fontSize: 12,
        borderRadius: 6,
        boxSizing: "border-box",
        pointerEvents: "auto",
        lineHeight: 1.5,
      }}
    >
      <strong>{title}</strong> — {count.toLocaleString()} slots
      <br />
      {panelOpen
        ? "Click canvas to resume walking"
        : "Click canvas to lock cursor"}
      <br />
      WASD walk · Space/C vertical · Shift sprint · click model to inspect
      <br />
      <a href={backHref} style={{ color: "#ffd84d" }}>
        ← {backLabel}
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
  const downloadName = `${slot.model.title.replace(/\s+/g, "_")}.glb`;
  return (
    <div
      style={{
        position: "absolute",
        top: "var(--scene-header-offset)",
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
            {slot.model.title}
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
        href={assetUrl(slot.model.file)}
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

      <Section title="Metadata">
        <div style={{ color: "#cfcfd4", lineHeight: 1.45 }}>
          {slot.model.description}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
          {uniqueTags(slot.model.tags).slice(0, 8).map((tag) => (
            <span
              key={tag}
              style={{
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 999,
                color: "#8a8a93",
                fontSize: 11,
                padding: "2px 6px",
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      </Section>

      <div style={{ fontSize: 11, color: "#8a8a93" }}>
        File:{" "}
        <span style={{ color: "#cfcfd4", wordBreak: "break-all" }}>
          {slot.model.file}
        </span>
      </div>

      <Section title="License">
        <div>
          <LicenseLink
            license={license.license}
            source={license.vendorLabel}
            fallbackUrl={license.licenseUrl}
            style={{ color: "#ffd84d", fontWeight: 800 }}
          />
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
            <AnimButton
              label="No animation"
              active={playAnim === null}
              onClick={() => onPlay(null)}
              muted
            />
            {animationInfo.names.map((name) => (
              <AnimButton
                key={name}
                label={name}
                active={playAnim === name}
                onClick={() => onPlay(playAnim === name ? null : name)}
              />
            ))}
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

function AnimButton({
  label,
  active,
  onClick,
  muted = false,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: "left",
        background: active
          ? "rgba(255,216,77,0.18)"
          : "rgba(255,255,255,0.04)",
        color: active ? "#ffd84d" : muted ? "#8a8a93" : "white",
        border: `1px solid ${active ? "#ffd84d" : "rgba(255,255,255,0.08)"}`,
        borderRadius: 4,
        padding: "6px 8px",
        cursor: "pointer",
        fontFamily: "inherit",
        fontSize: 12,
        fontStyle: muted && !active ? "italic" : "normal",
      }}
    >
      {label}
    </button>
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
