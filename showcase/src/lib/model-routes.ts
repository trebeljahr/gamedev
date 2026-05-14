import type { Model, Pack } from "@/lib/manifest";

export type ModelRouteRef = {
  index: number;
  number: number;
  slug: string;
  model: Model;
};

function fileStem(value: string): string {
  return value
    .split(/[?#]/, 1)[0]
    .split("/")
    .pop()
    ?.replace(/\.[^.]+$/i, "") ?? value;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function slugifyModelTitle(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function baseSlugForModel(model: Model): string {
  return (
    slugifyModelTitle(model.title) ||
    slugifyModelTitle(model.name) ||
    slugifyModelTitle(fileStem(model.file)) ||
    "model"
  );
}

export function modelRouteRefsForPack(pack: Pack): ModelRouteRef[] {
  const baseCounts = new Map<string, number>();
  const baseSlugs = pack.models.map((model) => {
    const base = baseSlugForModel(model);
    baseCounts.set(base, (baseCounts.get(base) ?? 0) + 1);
    return base;
  });

  return pack.models.map((model, index) => {
    const base = baseSlugs[index];
    const number = index + 1;

    return {
      index,
      number,
      slug: baseCounts.get(base) === 1 ? base : `${base}-${number}`,
      model,
    };
  });
}

export function modelRouteRefForModel(pack: Pack, model: Model): ModelRouteRef | undefined {
  return modelRouteRefsForPack(pack).find((ref) => ref.model.file === model.file);
}

export function modelHref(pack: Pack, modelOrRef: Model | ModelRouteRef): string {
  const ref = "slug" in modelOrRef ? modelOrRef : modelRouteRefForModel(pack, modelOrRef);
  const fallbackModel = "model" in modelOrRef ? modelOrRef.model : modelOrRef;
  const slug = ref?.slug ?? (slugifyModelTitle(fallbackModel.title || fallbackModel.name) || "model");
  return `/${pack.vendor}/${pack.pack}/${slug}`;
}

export function findModelRouteRef(pack: Pack, value: string): ModelRouteRef | undefined {
  const decoded = safeDecode(value).trim();
  if (!decoded) return undefined;
  const normalizedSlug = slugifyModelTitle(decoded);
  const numericIndex = /^\d+$/.test(decoded) ? Number(decoded) : null;
  const refs = modelRouteRefsForPack(pack);

  return (
    refs.find((ref) => ref.slug === decoded) ??
    refs.find((ref) => ref.slug === normalizedSlug) ??
    refs.find((ref) => {
      const model = ref.model;
      return model.file === decoded || model.name === decoded || model.title === decoded;
    }) ??
    refs.find((ref) => ref.number === numericIndex)
  );
}
