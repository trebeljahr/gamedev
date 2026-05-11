/**
 * Deterministic spatial layout of every model in the manifest. Used by the
 * /all view so cells stay in fixed positions; the active-model loader picks
 * cells by world-distance from the camera.
 *
 * Layout:
 *   - One row per pack, models laid out along +X
 *   - Packs stacked along +Z (alphabetical by vendor/pack)
 *   - Vendor gap between vendors
 */
import { manifest, type Pack, type Model } from "./manifest";

export const CELL = 3; // X spacing between models within a pack
export const PACK_GAP = 5; // Z spacing between pack rows
export const VENDOR_GAP = 10; // extra Z gap between vendors

export type Slot = {
  index: number;
  pack: Pack;
  model: Model;
  position: [number, number, number];
  isPackHead: boolean;
};

function computeSlots(): {
  slots: Slot[];
  bounds: { min: [number, number, number]; max: [number, number, number] };
} {
  const slots: Slot[] = [];
  let z = 0;
  let prevVendor: string | null = null;
  let maxX = 0;
  for (const pack of manifest.packs) {
    if (prevVendor !== null && pack.vendor !== prevVendor) z += VENDOR_GAP;
    prevVendor = pack.vendor;
    for (let i = 0; i < pack.models.length; i++) {
      const model = pack.models[i];
      const x = i * CELL;
      const position: [number, number, number] = [x, 0, z];
      slots.push({ index: slots.length, pack, model, position, isPackHead: i === 0 });
      if (x > maxX) maxX = x;
    }
    z += PACK_GAP;
  }
  return {
    slots,
    bounds: { min: [0, 0, 0], max: [maxX, 10, z] },
  };
}

const _data = computeSlots();
export const allSlots = _data.slots;
export const worldBounds = _data.bounds;
