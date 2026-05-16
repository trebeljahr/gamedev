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
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Euler,
  type InstancedMesh,
  Object3D,
  Raycaster,
  Vector2,
  Vector3,
} from "three";
import type { JoystickOnMove } from "joystick-controller";
import { Model, type AnimationInfo } from "./Model";
import {
  distToPackXZ,
  layoutPackModels,
  type PackLayout,
  type SceneLayout,
  type Slot,
  type WorldBounds,
} from "@/lib/layout";
import { assetUrl, displayPackTitle, type Pack } from "@/lib/manifest";
import { downloadPackZip } from "@/lib/download-pack-zip";
import { licenseForVendor } from "@/lib/license";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LicenseLink } from "@/components/LicenseLink";
import { packZipFilename } from "@/lib/pack-zip";
import { ModelDownloadLinks } from "@/components/ModelDownloadLinks";
import { uniqueTags } from "@/lib/tags";
import {
  CameraFloorGuard,
  clampCameraAboveFloor,
} from "@/components/CameraFloorGuard";
import { useJoystick } from "@/hooks/use-joystick";
import { useTouchDevice } from "@/hooks/use-touch-device";

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
// Keep this low — even 2 dense GLBs in one frame can spike past one frame
// budget, which the Walker would feel as a hop.
const MOUNT_PER_TICK = 2;
const MOVE_SPEED = 12; // units/sec
const WORLD_HEIGHT = 2;
// Joystick max-range in pixels — must match `defaultParameters.maxRange`
// in `use-joystick.ts`. Used to normalise the library's raw x/y back
// into [-1, 1].
const JOYSTICK_MAX_RANGE = 60;
const MOVE_DEADZONE = 0.15;
const LOOK_DEADZONE = 0.15;
// Look stick → angular velocity (rad/s). Binary above the deadzone:
// any drag past LOOK_DEADZONE turns at LOOK_SPEED in the stick's
// direction, so fine aim is a short tap, full turn is a sustained hold.
const LOOK_SPEED = 1.6;
const PITCH_LIMIT = Math.PI / 2 - 0.05;

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
  lookAt?: [number, number, number];
  loadAll?: boolean;
  showHud?: boolean;
  showPackLabels?: boolean;
  showModelPanel?: boolean;
  showPlinths?: boolean;
  allowArrowWalk?: boolean;
  selectedIndex?: number | null;
  onSelectedIndexChange?: (index: number) => void;
};

type CameraPose = {
  position: [number, number, number];
  lookAt: [number, number, number];
};

function startForBounds(bounds: WorldBounds): [number, number, number] {
  const [width, _height, depth] = bounds.max;
  return [
    Math.min(Math.max(width * 0.18, 4), 18),
    WORLD_HEIGHT + 1.5,
    -Math.min(Math.max(depth * 0.08, 4), 14),
  ];
}

function walkthroughCameraForBounds(bounds: WorldBounds): CameraPose {
  const position = startForBounds(bounds);
  return {
    position,
    lookAt: [
      position[0],
      WORLD_HEIGHT + 0.25,
      Math.min(Math.max(bounds.max[2] * 0.12, 8), 28),
    ],
  };
}

function packOverviewCameraForBounds(bounds: WorldBounds): CameraPose {
  const [width, _height, depth] = bounds.max;
  const longest = Math.max(width, depth, 1);
  const centerX = width / 2;
  const centerZ = depth / 2;

  return {
    position: [
      centerX,
      Math.min(
        Math.max(longest * 0.28 + WORLD_HEIGHT, WORLD_HEIGHT + 4),
        WORLD_HEIGHT + 16,
      ),
      depth + Math.min(Math.max(depth * 0.72 + width * 0.08, 7), 30),
    ],
    lookAt: [centerX, 1.25, centerZ],
  };
}

export function AllModelsScene({ sceneLayout }: { sceneLayout: SceneLayout }) {
  const cameraPose = useMemo(
    () => walkthroughCameraForBounds(sceneLayout.bounds),
    [sceneLayout],
  );

  return (
    <ModelGridScene
      slots={sceneLayout.slots}
      layouts={sceneLayout.packs}
      bounds={sceneLayout.bounds}
      title="All models"
      backHref="/#3d-packs"
      backLabel="back to packs"
      theme={ARCHIVE_THEME}
      start={cameraPose.position}
      lookAt={cameraPose.lookAt}
      loadAll={false}
      showHud
      showPackLabels
      showModelPanel
    />
  );
}

export function PackModelsScene({
  pack,
  selectedIndex = null,
  onSelectedIndexChange,
}: {
  pack: Pack;
  selectedIndex?: number | null;
  onSelectedIndexChange?: (index: number) => void;
}) {
  const layout = useMemo(() => layoutPackModels(pack), [pack]);
  const cameraPose = useMemo(() => packOverviewCameraForBounds(layout.bounds), [layout]);
  return (
    <ModelGridScene
      slots={layout.slots}
      layouts={[layout.packLayout]}
      bounds={layout.bounds}
      title={displayPackTitle(pack)}
      backHref="/#3d-packs"
      backLabel="back to packs"
      theme={PACK_STUDIO_THEME}
      start={cameraPose.position}
      lookAt={cameraPose.lookAt}
      loadAll
      showHud={false}
      showPackLabels={false}
      showModelPanel={false}
      showPlinths={false}
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
  lookAt,
  loadAll = false,
  showHud = false,
  showPackLabels = false,
  showModelPanel = false,
  showPlinths = true,
  allowArrowWalk = true,
  selectedIndex,
  onSelectedIndexChange,
}: ModelGridSceneProps) {
  // From the pack-overview top-down camera, the slab plinths read as raised
  // floor tiles and visually intersect models that have geometry near y=0.
  // Hiding them lets the model rest directly on the world floor (no z-fight
  // and no "raised tile" illusion). The /all walkthrough keeps the slabs so
  // each model still has a visible footprint when seen from eye level.
  const groundY = showPlinths ? BASE_TOP_Y : 0.005;
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

  // Mobile UX: replace pointer-lock + WASD with two on-screen joysticks
  // (movement on the left, look on the right). Pointer lock is unreliable
  // on touch — joysticks own look there instead.
  const sceneHostRef = useRef<HTMLDivElement | null>(null);
  const isTouch = useTouchDevice() === true;
  const joysticksActive = isTouch && !panelOpen;
  const moveJoystick = useJoystick({
    enabled: joysticksActive,
    params: { x: "14%", y: "18%" },
    parentRef: sceneHostRef,
  });
  const lookJoystick = useJoystick({
    enabled: joysticksActive,
    params: { x: "86%", y: "18%" },
    parentRef: sceneHostRef,
  });

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
    <div className="model-grid-scene all-scene-canvas" ref={sceneHostRef}>
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
        <InitialCameraView position={start} lookAt={lookAt} />
        <Walker
          allowArrowKeys={allowArrowWalk}
          moveGetter={isTouch ? moveJoystick.getData : undefined}
          lookGetter={isTouch ? lookJoystick.getData : undefined}
        />
        <Selector
          onSelect={onSelect}
          onHoverChange={setHoverInspect}
          panelOpen={panelOpen}
          onPanelClose={() => setInternalSelected(null)}
        />
        {showPlinths && <Placeholders slots={slots} color={theme.base} />}
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
          groundY={groundY}
        />
        {selected && <SelectedMarker slot={selected} groundY={groundY} />}
        {controlledSelected && <FocusSelectedSlot slot={controlledSelected} groundY={groundY} />}
        {showPackLabels && <PackLabels layouts={layouts} />}
        <Suspense fallback={null}>
          <Environment
            preset={theme.environmentPreset}
            environmentIntensity={theme.environmentIntensity}
          />
        </Suspense>
        {!isTouch && <PointerLockControls selector=".all-scene-canvas canvas" />}
        <CameraFloorGuard minY={WORLD_HEIGHT} />
      </Canvas>
      <Crosshair hovering={hoverInspect && !panelOpen} />
      {showHud && (
        <HUD
          title={title}
          count={slots.length}
          panelOpen={panelOpen}
          backHref={backHref}
          backLabel={backLabel}
          isTouch={isTouch}
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

function InitialCameraView({
  position,
  lookAt,
}: {
  position: [number, number, number];
  lookAt?: [number, number, number];
}) {
  const { camera } = useThree();
  const syncFrames = useRef(0);

  const syncCamera = useCallback(() => {
    camera.position.set(...position);
    if (lookAt) camera.lookAt(...lookAt);
    camera.updateMatrixWorld();
  }, [camera, position, lookAt]);

  useLayoutEffect(() => {
    syncFrames.current = 2;
    syncCamera();
  }, [syncCamera]);

  useFrame(() => {
    if (syncFrames.current <= 0) return;
    syncFrames.current -= 1;
    syncCamera();
  });

  return null;
}

/* Camera walker — WASD + Space (up) / C (down), Shift held = sprint.
   On touch devices a movement joystick contributes to the same vector
   and a look joystick rotates the camera (proxy for mouse-look since
   pointer lock is unreliable on mobile).
   Uses raw window listeners to avoid drei API drift. */
const _walkerLookEuler = new Euler(0, 0, 0, "YXZ");
const _walkerForward = new Vector3();
const _walkerRight = new Vector3();
const _walkerUp = new Vector3(0, 1, 0);

function Walker({
  allowArrowKeys = true,
  moveGetter,
  lookGetter,
}: {
  allowArrowKeys?: boolean;
  moveGetter?: () => JoystickOnMove;
  lookGetter?: () => JoystickOnMove;
}) {
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
    if (lookGetter) {
      const look = lookGetter();
      const lx = look.x / JOYSTICK_MAX_RANGE;
      const ly = look.y / JOYSTICK_MAX_RANGE;
      const lmag = Math.hypot(lx, ly);
      if (lmag > LOOK_DEADZONE) {
        const nx = lx / lmag;
        const ny = ly / lmag;
        _walkerLookEuler.setFromQuaternion(camera.quaternion, "YXZ");
        _walkerLookEuler.y -= nx * LOOK_SPEED * delta;
        _walkerLookEuler.x += ny * LOOK_SPEED * delta;
        if (_walkerLookEuler.x > PITCH_LIMIT) _walkerLookEuler.x = PITCH_LIMIT;
        if (_walkerLookEuler.x < -PITCH_LIMIT) _walkerLookEuler.x = -PITCH_LIMIT;
        _walkerLookEuler.z = 0;
        camera.quaternion.setFromEuler(_walkerLookEuler);
      }
    }

    const k = keys.current;
    // PointerLockControls + the joystick branch above both mutate
    // camera.quaternion. R3F only refreshes camera.matrix at render time,
    // which runs after this useFrame — so reading camera.matrix here would
    // lag the latest quaternion by one frame and the walk direction would
    // drift behind the view. Force the matrix to reflect current quaternion.
    camera.updateMatrix();
    // Right is the camera's local +X (matrix column 0). Under YXZ Euler with
    // zero roll, that column is invariantly horizontal and unit-length, so it
    // stays stable as you pitch up or down. getWorldDirection + fwd.y=0 +
    // normalize would flip sign near the ±90° pitch limit when the extracted
    // Euler crosses the gimbal-lock boundary — visible as the camera jumping
    // back and forth while walking.
    const right = _walkerRight.setFromMatrixColumn(camera.matrix, 0);
    const fwd = _walkerForward.crossVectors(_walkerUp, right);
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

    // Movement joystick contributes proportionally past the deadzone.
    // Diagonal keyboard + fully deflected stick must not double the speed,
    // so we track the joystick contribution and cap the combined planar
    // magnitude at 1 below.
    let stickT = 0;
    if (moveGetter) {
      const m = moveGetter();
      const mx = m.x / JOYSTICK_MAX_RANGE;
      const my = m.y / JOYSTICK_MAX_RANGE;
      const mmag = Math.hypot(mx, my);
      if (mmag > MOVE_DEADZONE) {
        const fx = my / mmag;
        const sx = mx / mmag;
        stickT = Math.min(1, (mmag - MOVE_DEADZONE) / (1 - MOVE_DEADZONE));
        dx += (fwd.x * fx + right.x * sx) * stickT;
        dz += (fwd.z * fx + right.z * sx) * stickT;
      }
    }

    const planarMag = Math.hypot(dx, dz);
    if (planarMag > 1) {
      dx /= planarMag;
      dz /= planarMag;
    }
    const mag = Math.hypot(dx, dy, dz);
    if (mag > 0) {
      const speed = k.shift ? MOVE_SPEED * 3 : MOVE_SPEED;
      // Clamp delta so a long stall (GLB parse, GC pause, tab refocus) does
      // not multiply into a teleport-sized step that reads as a camera hop.
      // 100ms cap = at most ~1.2 units (or ~3.6 sprinting) lost to a single
      // bad frame instead of unbounded leaps.
      const s = speed * Math.min(delta, 0.1);
      camera.position.x += dx * s;
      camera.position.y += dy * s;
      camera.position.z += dz * s;
    }
    clampCameraAboveFloor(camera, WORLD_HEIGHT);
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
              download?: { pack: Pack; name: string };
            }
          | undefined;
        if (ud?.download)
          return { kind: "download", pack: ud.download.pack };
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
    // On touch there's no pointer lock — surface the hover cue whenever
    // a model sits under the screen centre so the inspect crosshair still
    // hints what a tap will pick.
    const isTouch = window.matchMedia("(pointer: coarse)").matches;
    const active = locked || isTouch;
    const hovering =
      active && !panelOpenRef.current && pickHit()?.kind === "slot";
    if (hovering !== hoverRef.current) {
      hoverRef.current = hovering;
      onHoverChange?.(hovering);
    }
  });

  useEffect(() => {
    const el = gl.domElement;
    // Touch detection has to live inside the handler because the same
    // canvas can receive both kinds of input (e.g. desktop with a touch
    // screen). On touch we have no pointer lock — taps at the screen
    // centre raycast straight away through the crosshair.
    function onClick(e: MouseEvent) {
      if (e.button !== 0) return;
      const isTouch = window.matchMedia("(pointer: coarse)").matches;
      if (!isTouch && document.pointerLockElement !== el) {
        // Desktop, not yet locked: this listener is on the canvas only.
        // If the panel was open, we're transitioning back to walking —
        // close it.
        if (panelOpenRef.current) onPanelClose();
        return;
      }
      const hit = pickHit();
      if (!hit) return;
      if (hit.kind === "download") {
        void downloadPackZip(hit.pack);
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
  | { kind: "download"; pack: Pack };

/* Massive InstancedMesh of placeholder slabs — one per slot. Each instance
   is centred on its cell and scaled to the *model's* raw XZ footprint, NOT
   the padded cell size, so adjacent bases get a CELL_PAD gap between them.
   Geometry is a unit cube; the per-instance scale matrix stretches it. */
// Skip raycasting placeholders entirely — they're decorative and have no
// userData.slot, so Selector would discard every hit anyway. Without this,
// each hover tick ran the per-instance ray test against every slot
// (7k+ for /all) which spiked into multi-frame stalls inside dense packs.
const noopRaycast = () => {};

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
      raycast={noopRaycast}
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
  groundY,
}: {
  slots: Slot[];
  layouts: PackLayout[];
  mounted: Slot[];
  onMountedChange: (next: Slot[] | ((prev: Slot[]) => Slot[])) => void;
  selectedIndex: number | null;
  playAnim: string | null;
  onAnimInfo: (slotIndex: number, info: AnimationInfo | null) => void;
  loadAll?: boolean;
  groundY: number;
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
              groundY={groundY}
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
  groundY,
  playAnimation,
  onAnimInfo,
}: {
  slot: Slot;
  groundY: number;
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
  const y = groundY - (slot.model.minY ?? 0);

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
        const filename = packZipFilename(pl.pack);
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
                {`${pl.pack.vendor} · ${displayPackTitle(pl.pack)} (${pl.pack.count})`}
              </Text>
              <group
                position={[0, -0.5, 0]}
                userData={{ download: { pack: pl.pack, name: filename } }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (document.pointerLockElement) return;
                  void downloadPackZip(pl.pack);
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

function slotCenter(slot: Slot, groundY: number): Vector3 {
  const [sx, _sy, sz] = slot.position;
  const [cw, cd] = slot.cellSize;
  return new Vector3(sx + cw / 2, groundY + 0.5, sz + cd / 2);
}

function SelectedMarker({ slot, groundY }: { slot: Slot; groundY: number }) {
  const center = slotCenter(slot, groundY);
  const radius = Math.max(slot.model.size[0], slot.model.size[2], 1) / 2 + 0.42;
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[center.x, groundY + 0.035, center.z]}
      renderOrder={2}
    >
      <ringGeometry args={[radius, radius + 0.08, 64]} />
      <meshBasicMaterial color="#ffd84d" transparent opacity={0.9} />
    </mesh>
  );
}

function FocusSelectedSlot({ slot, groundY }: { slot: Slot; groundY: number }) {
  const { camera } = useThree();
  const target = useRef<{
    position: Vector3;
    lookAt: Vector3;
  } | null>(null);

  useEffect(() => {
    const center = slotCenter(slot, groundY);
    const reach = Math.max(5, Math.max(slot.model.size[0], slot.model.size[2]) * 1.35);
    target.current = {
      position: new Vector3(
        center.x + reach,
        Math.max(WORLD_HEIGHT + 1.4, Math.min(9, slot.model.size[1] + 2.2)),
        center.z + reach,
      ),
      lookAt: center,
    };
  }, [slot, groundY]);

  useFrame((_, delta) => {
    if (!target.current) return;
    const t = Math.min(1, delta * 3.4);
    camera.position.lerp(target.current.position, t);
    clampCameraAboveFloor(camera, WORLD_HEIGHT);
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
  isTouch,
}: {
  title: string;
  count: number;
  panelOpen: boolean;
  backHref: string;
  backLabel: string;
  isTouch: boolean;
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
      {isTouch ? (
        <>
          {panelOpen
            ? "Tap canvas to resume walking"
            : "Left stick: walk · Right stick: look"}
          <br />
          Tap model at crosshair to inspect
        </>
      ) : (
        <>
          {panelOpen
            ? "Click canvas to resume walking"
            : "Click canvas to lock cursor"}
          <br />
          WASD walk · Space/C vertical · Shift sprint · click model to inspect
        </>
      )}
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
            {slot.pack.vendor} · {displayPackTitle(slot.pack)}
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

      <ModelDownloadLinks model={slot.model} className="scene-model-downloads" />

      <Section title="Metadata">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
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
