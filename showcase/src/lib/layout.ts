/**
 * Deterministic spatial layout of every model in the manifest. Used by the
 * /all view so cells stay in fixed positions; the active-model loader picks
 * cells by world-distance from the camera.
 *
 * Models keep their *true* XZ footprint (taken from the GLB bbox, computed
 * by scripts/build-manifest.ts). We then shelf-pack ("masonry") them into
 * pack blocks, and shelf-pack the pack blocks themselves into the world.
 *
 *   - Inside a pack: each model is given a cell of (size.x + CELL_PAD) by
 *     (size.z + CELL_PAD). Cells tile edge-to-edge along +X until the row
 *     reaches the pack's target width (roughly square; ~sqrt of summed cell
 *     area). The pad ensures adjacent *bases* (which are sized to the raw
 *     model footprint) end up with CELL_PAD between them — no overlap.
 *   - Across packs: same shelf packing on the world. Each pack's footprint
 *     flows along +X until shelfX exceeds TARGET_WORLD_WIDTH, then wraps.
 *     Vendor changes always force a new shelf.
 *
 * Slot.position is the cell's NW corner (min X, 0, min Z). Slot.cellSize is
 * the cell's padded XZ footprint; the renderer centres model + base inside
 * it. The base itself is sized to model.size (raw) so neighbours have a
 * CELL_PAD-wide gap on each side.
 */
import { manifest, type Pack, type Model } from "./manifest";

// Gap added to every model cell. Adjacent cells touch edge-to-edge, but the
// base inside each cell is only sized to the model's raw bbox — so two
// neighbouring bases end up CELL_PAD apart (no overlap, visible gap).
export const CELL_PAD = 1.0;
// Gap between adjacent packs on a shelf.
export const PACK_GAP = 4;
// Gap between shelves on the world floor.
export const SHELF_GAP = 6;
// Extra gap when the vendor changes.
export const VENDOR_GAP = 12;

// World tries to stay roughly this wide; pack shelves wrap when they exceed it.
const TARGET_WORLD_WIDTH = 240;

export type Slot = {
  index: number;
  pack: Pack;
  model: Model;
  // NW corner of the cell on the world floor.
  position: [number, number, number];
  // Cell footprint (includes CELL_PAD). The renderer centres the model and
  // its (smaller) base inside this rect.
  cellSize: [number, number];
  isPackHead: boolean;
};

export type PackBounds = { minX: number; maxX: number; minZ: number; maxZ: number };

export type PackLayout = {
  pack: Pack;
  slots: Slot[];
  bounds: PackBounds;
};

/* Shelf-pack a sequence of (w, d) rectangles into a target-width row layout.
   Returns each rect's local (x, z) NW corner plus the overall (w, d). */
function shelfPack(
  items: Array<{ w: number; d: number }>,
  targetW: number,
): {
  positions: Array<{ x: number; z: number }>;
  width: number;
  depth: number;
} {
  const positions: Array<{ x: number; z: number }> = [];
  let shelfX = 0;
  let shelfZ = 0;
  let shelfD = 0;
  let maxX = 0;
  let maxZ = 0;
  for (const item of items) {
    // Always place the first item on the shelf (avoids infinite zero-width loop).
    if (shelfX > 0 && shelfX + item.w > targetW) {
      shelfZ += shelfD;
      shelfX = 0;
      shelfD = 0;
    }
    positions.push({ x: shelfX, z: shelfZ });
    shelfX += item.w;
    if (item.d > shelfD) shelfD = item.d;
    if (shelfX > maxX) maxX = shelfX;
    if (shelfZ + item.d > maxZ) maxZ = shelfZ + item.d;
  }
  return { positions, width: maxX, depth: maxZ };
}

/* Pack each pack's models into a roughly-square block, then pack those
   blocks into the world. */
function computeSlots(): {
  slots: Slot[];
  packs: PackLayout[];
  bounds: { min: [number, number, number]; max: [number, number, number] };
} {
  const slots: Slot[] = [];
  const packs: PackLayout[] = [];

  // Pre-compute each pack's internal layout (local coords). Pack target
  // width = sqrt(sum of cell areas) → result is roughly square.
  type PackPlan = {
    pack: Pack;
    cells: Array<{ model: Model; w: number; d: number; localX: number; localZ: number }>;
    width: number;
    depth: number;
  };
  const plans: PackPlan[] = [];
  for (const pack of manifest.packs) {
    const items = pack.models.map((m) => {
      const w = (m.size?.[0] ?? 1) + CELL_PAD;
      const d = (m.size?.[2] ?? 1) + CELL_PAD;
      return { model: m, w, d };
    });
    const area = items.reduce((acc, it) => acc + it.w * it.d, 0);
    // Bias the row width slightly higher than sqrt(area) so rows end up
    // wider than they are deep — easier to scan visually.
    const target = Math.max(Math.sqrt(area) * 1.1, items[0]?.w ?? 1);
    const { positions, width, depth } = shelfPack(items, target);
    plans.push({
      pack,
      cells: items.map((it, i) => ({
        model: it.model,
        w: it.w,
        d: it.d,
        localX: positions[i].x,
        localZ: positions[i].z,
      })),
      width,
      depth,
    });
  }

  // Place the pack blocks themselves: shelf-pack along +X, wrap on +Z,
  // VENDOR_GAP when vendor changes (mirrors the previous behaviour).
  let shelfX = 0;
  let shelfZ = 0;
  let shelfDepth = 0;
  let prevVendor: string | null = null;
  let maxX = 0;
  let maxZ = 0;

  for (const plan of plans) {
    if (prevVendor !== null && plan.pack.vendor !== prevVendor) {
      shelfZ += shelfDepth + VENDOR_GAP;
      shelfX = 0;
      shelfDepth = 0;
    } else if (shelfX > 0 && shelfX + plan.width > TARGET_WORLD_WIDTH) {
      shelfZ += shelfDepth + SHELF_GAP;
      shelfX = 0;
      shelfDepth = 0;
    }
    prevVendor = plan.pack.vendor;

    const packOriginX = shelfX;
    const packOriginZ = shelfZ;
    const packSlots: Slot[] = [];

    for (let i = 0; i < plan.cells.length; i++) {
      const c = plan.cells[i];
      const x = packOriginX + c.localX;
      const z = packOriginZ + c.localZ;
      const slot: Slot = {
        index: slots.length,
        pack: plan.pack,
        model: c.model,
        position: [x, 0, z],
        cellSize: [c.w, c.d],
        isPackHead: i === 0,
      };
      slots.push(slot);
      packSlots.push(slot);
    }

    packs.push({
      pack: plan.pack,
      slots: packSlots,
      bounds: {
        minX: packOriginX,
        maxX: packOriginX + plan.width,
        minZ: packOriginZ,
        maxZ: packOriginZ + plan.depth,
      },
    });

    shelfX += plan.width + PACK_GAP;
    if (plan.depth > shelfDepth) shelfDepth = plan.depth;
    if (shelfX > maxX) maxX = shelfX;
    if (shelfZ + plan.depth > maxZ) maxZ = shelfZ + plan.depth;
  }

  return {
    slots,
    packs,
    bounds: { min: [0, 0, 0], max: [maxX, 10, maxZ] },
  };
}

const _data = computeSlots();
export const allSlots = _data.slots;
export const packLayouts = _data.packs;
export const worldBounds = _data.bounds;

/* Distance from (cx,cz) to the nearest point of an axis-aligned rect.
   Zero when the point is inside the rect. */
export function distToPackXZ(cx: number, cz: number, b: PackBounds): number {
  const dx = Math.max(0, b.minX - cx, cx - b.maxX);
  const dz = Math.max(0, b.minZ - cz, cz - b.maxZ);
  return Math.hypot(dx, dz);
}
