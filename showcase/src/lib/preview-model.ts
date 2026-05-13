import type { Pack } from "@/lib/manifest";

const preferredCategories = new Set([
  "character",
  "creature",
  "building",
  "vehicle",
  "environment",
  "nature",
  "sci-fi",
]);
const tinyCategories = new Set(["projectile", "weapon", "effect"]);

function previewScore(model: Pack["models"][number]) {
  const glb = /\.glb($|[?#])/i.test(model.file);
  const mirroredGlb = model.file.startsWith("/glb/");
  const [w, h, d] = model.size ?? [1, 1, 1];
  const visualWeight = Math.min(Math.max(w, d, h), 8);
  return (
    (mirroredGlb ? 120 : 0) +
    (glb ? 60 : 0) +
    (preferredCategories.has(model.category) ? 30 : 0) -
    (tinyCategories.has(model.category) ? 35 : 0) +
    visualWeight
  );
}

export function previewModelsFor(pack: Pack) {
  return pack.models
    .slice()
    .sort((a, b) => previewScore(b) - previewScore(a));
}

export function previewModelFilesFor(pack: Pack) {
  return previewModelsFor(pack).map((model) => model.file);
}

export function previewModelFor(pack: Pack) {
  return previewModelsFor(pack)[0];
}
