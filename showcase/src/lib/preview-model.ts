import type { Model, Pack, PackPreview } from "@/lib/manifest";

type PreviewModelInput = Pick<Model, "category" | "file" | "name" | "size" | "title">;

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

function previewScore(model: PreviewModelInput): number {
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

export function selectPreviewModels<T extends PreviewModelInput>(models: readonly T[]): T[] {
  return models
    .slice()
    .sort((a, b) => previewScore(b) - previewScore(a) || a.title.localeCompare(b.title));
}

export function selectPreviewModel<T extends PreviewModelInput>(models: readonly T[]): T | undefined {
  return selectPreviewModels(models)[0];
}

export function buildPackPreviewMetadata(models: readonly PreviewModelInput[]): PackPreview | undefined {
  const model = selectPreviewModel(models);
  if (!model) return undefined;

  return {
    modelFile: model.file,
    modelName: model.name,
    modelTitle: model.title,
    category: model.category,
  };
}

export function previewModelsFor(pack: Pack): Model[] {
  const sorted = selectPreviewModels(pack.models);
  const metadataModel = pack.preview
    ? sorted.find((model) => model.file === pack.preview?.modelFile)
    : undefined;

  if (!metadataModel) return sorted;
  return [
    metadataModel,
    ...sorted.filter((model) => model.file !== metadataModel.file),
  ];
}

export function previewModelFilesFor(pack: Pack): string[] {
  return previewModelsFor(pack).map((model) => model.file);
}

export function previewModelFor(pack: Pack): Model | undefined {
  return previewModelsFor(pack)[0];
}
