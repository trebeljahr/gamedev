/**
 * Deterministic spatial layout of every model in the manifest. Used by the
 * /all view so cells stay in fixed positions; the active-model loader picks
 * cells by world-distance from the camera.
 *
 * Layout:
 *   - Each pack is a roughly square block (cols × rows). Big packs (200+ models)
 *     fold into ~14-wide blocks instead of a 600-unit straight line.
 *   - Packs flow along +X on a "shelf", wrapping to a new shelf on +Z when the
 *     shelf exceeds TARGET_WORLD_WIDTH. This keeps the whole world ~square.
 *   - Vendor changes force a shelf break and add VENDOR_GAP.
 */
import { manifest, type Pack, type Model } from "./manifest";

export const CELL = 3; // X/Z spacing between cells within a pack
export const PACK_GAP = 4; // gap on +X between adjacent packs on a shelf
export const SHELF_GAP = 6; // gap on +Z between shelves
export const VENDOR_GAP = 12; // extra +Z gap between vendors

// World tries to stay roughly this wide; shelves wrap when they exceed it.
const TARGET_WORLD_WIDTH = 220;

export type Slot = {
  index: number;
  pack: Pack;
  model: Model;
  position: [number, number, number];
  isPackHead: boolean;
};

export type PackBounds = { minX: number; maxX: number; minZ: number; maxZ: number };

export type PackLayout = {
  pack: Pack;
  slots: Slot[];
  bounds: PackBounds;
};

// Pack footprint: cols × rows that holds all models, biased to roughly square.
function packDims(count: number): { cols: number; rows: number } {
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.ceil(count / cols);
  return { cols, rows };
}

function computeSlots(): {
  slots: Slot[];
  packs: PackLayout[];
  bounds: { min: [number, number, number]; max: [number, number, number] };
} {
  const slots: Slot[] = [];
  const packs: PackLayout[] = [];
  // Shelf layout state — packs flow along +X, then wrap to a new shelf on +Z.
  let shelfX = 0;
  let shelfZ = 0;
  let shelfDepth = 0;
  let prevVendor: string | null = null;
  let maxX = 0;
  let maxZ = 0;

  for (const pack of manifest.packs) {
    const { cols, rows } = packDims(pack.count);
    const packW = cols * CELL;
    const packD = rows * CELL;

    if (prevVendor !== null && pack.vendor !== prevVendor) {
      // Vendor change → new shelf with extra spacing.
      shelfZ += shelfDepth + VENDOR_GAP;
      shelfX = 0;
      shelfDepth = 0;
    } else if (shelfX > 0 && shelfX + packW > TARGET_WORLD_WIDTH) {
      // Same vendor, pack doesn't fit on this shelf — wrap.
      shelfZ += shelfDepth + SHELF_GAP;
      shelfX = 0;
      shelfDepth = 0;
    }
    prevVendor = pack.vendor;

    const packSlots: Slot[] = [];
    let pMinX = Infinity,
      pMaxX = -Infinity,
      pMinZ = Infinity,
      pMaxZ = -Infinity;

    for (let i = 0; i < pack.count; i++) {
      const model = pack.models[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = shelfX + col * CELL;
      const z = shelfZ + row * CELL;
      const slot: Slot = {
        index: slots.length,
        pack,
        model,
        position: [x, 0, z],
        isPackHead: i === 0,
      };
      slots.push(slot);
      packSlots.push(slot);
      if (x < pMinX) pMinX = x;
      if (x > pMaxX) pMaxX = x;
      if (z < pMinZ) pMinZ = z;
      if (z > pMaxZ) pMaxZ = z;
      if (x > maxX) maxX = x;
      if (z > maxZ) maxZ = z;
    }

    packs.push({
      pack,
      slots: packSlots,
      bounds: { minX: pMinX, maxX: pMaxX, minZ: pMinZ, maxZ: pMaxZ },
    });

    shelfX += packW + PACK_GAP;
    if (packD > shelfDepth) shelfDepth = packD;
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

/* Distance from (cx,cz) to the nearest point of an axis-aligned rect. Zero
   when the point is inside the rect. */
export function distToPackXZ(cx: number, cz: number, b: PackBounds): number {
  const dx = Math.max(0, b.minX - cx, cx - b.maxX);
  const dz = Math.max(0, b.minZ - cz, cz - b.maxZ);
  return Math.hypot(dx, dz);
}
