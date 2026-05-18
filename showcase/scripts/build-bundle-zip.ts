import { createReadStream, createWriteStream, existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, readFile, stat } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { Zip, ZipPassThrough, strToU8 } from "fflate";

const SHOWCASE_DIR = join(__dirname, "..");
const REPO_ROOT = join(SHOWCASE_DIR, "..");
const ASSETS_ROOT = resolve(process.env.ASSETS_DIR ?? join(REPO_ROOT, "assets"));
const BUNDLE_DIR = join(REPO_ROOT, "bundle");
const ALLOWLIST_PATH = resolve(process.env.BUNDLE_ALLOWLIST_PATH ?? join(BUNDLE_DIR, "allowlist.json"));
const OUTPUT_PATH = resolve(process.env.BUNDLE_OUTPUT_PATH ?? join(BUNDLE_DIR, "gamedev-asset-library-bundle.zip"));
const LIVE_SITE_URL = process.env.BUNDLE_LIVE_SITE_URL ?? "https://gamedev.trebeljahr.com";
const TOP_LEVEL_DIRS = ["models", "sprites", "sounds", "music", "textures"] as const;
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".ogg", ".m4a", ".flac", ".opus", ".aif", ".aiff"]);
const MODEL_EXTENSIONS = new Set([".glb", ".gltf", ".fbx", ".obj", ".dae", ".stl", ".blend", ".mtl"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".tga", ".exr", ".hdr"]);
const DIRECT_ASSET_PREFIXES = ["assets/", "glb/", "raw/", "2D/", "2d/", "3D/", "3d/", "sounds/", "textures/"];
const GLOB_SUFFIX = "/**";

type BundleCategory = (typeof TOP_LEVEL_DIRS)[number];
type RawAllowlistEntry = string | Record<string, unknown>;

type ManifestDownload = {
  file?: string;
};

type ManifestModel = {
  name?: string;
  file?: string;
  downloads?: ManifestDownload[];
  title?: string;
};

type ManifestPack = {
  id?: string;
  vendor?: string;
  pack?: string;
  title?: string;
  source?: string;
  license?: string;
  models?: ManifestModel[];
};

type Manifest = {
  packs?: ManifestPack[];
};

type MediaSample = {
  path?: string;
  src?: string;
  label?: string;
};

type ArtPack = {
  folder?: string;
  title?: string;
  author?: string;
  author_url?: string;
  url?: string;
  license_class?: string;
  attribution?: string;
};

type SoundCollection = {
  id?: string;
  title?: string;
  source?: string;
  path?: string;
  license?: string;
  notes?: string;
  samples?: MediaSample[];
};

type MusicTrack = {
  path?: string;
  src?: string;
  title?: string;
  source?: string;
  license?: string;
  notes?: string;
};

type MediaSource = {
  name?: string;
  url?: string | null;
  license?: string;
  license_url?: string | null;
  notes?: string;
};

type MediaCatalog = {
  artPacks?: ArtPack[];
  soundCollections?: SoundCollection[];
  musicTracks?: MusicTrack[];
  sources?: Record<string, MediaSource>;
};

type AttributionInput = {
  title?: string;
  creator?: string;
  source?: string;
  sourceUrl?: string;
  license?: string;
  licenseUrl?: string;
  attribution?: string;
  notes?: string;
  pack?: string;
};

type NormalizedEntry = {
  raw: RawAllowlistEntry;
  categoryHint?: BundleCategory;
  metadata: AttributionInput;
};

type AttributionRecord = Required<AttributionInput> & {
  category: BundleCategory;
  sourcePath: string;
  bundlePath: string;
};

type ResolvedAsset = {
  absPath: string;
  sourcePath: string;
  bundlePath: string;
  category: BundleCategory;
  packKey: string;
  attribution: AttributionRecord;
};

type LicenseCopy = {
  absPath: string;
  sourcePath: string;
  bundlePath: string;
  packKey: string;
};

type Exclusion = {
  label: string;
  reason: string;
  url?: string;
};

type BuildStats = {
  files: number;
  bytes: number;
  byCategory: Record<BundleCategory, number>;
};

function die(message: string): never {
  console.error(message);
  process.exit(1);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function mergeMetadata(...items: AttributionInput[]): AttributionInput {
  return items.reduce<AttributionInput>((out, item) => {
    for (const [key, value] of Object.entries(item) as [keyof AttributionInput, string | undefined][]) {
      if (value && !out[key]) out[key] = value;
    }
    return out;
  }, {});
}

function isInDir(child: string, parent: string): boolean {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function slugPart(value: string): string {
  return value
    .replace(/\\/g, "/")
    .replace(/[^a-z0-9._/-]+/gi, "-")
    .replace(/\/+/g, "/")
    .replace(/^-+|-+$/g, "")
    .replace(/\/-+|-+\//g, "/")
    .slice(0, 180) || "asset";
}

function safeZipPath(value: string): string {
  const normalized = normalize(value.replace(/\\/g, "/")).replace(/\\/g, "/");
  const clean = normalized.replace(/^\/+/, "");
  if (!clean || clean === "." || clean.startsWith("../") || clean.includes("/../")) {
    throw new Error(`Unsafe zip path: ${value}`);
  }
  return clean;
}

function pathForJson(path: string): string {
  return path.split(sep).join("/");
}

function stripUrlPath(value: string): string {
  const clean = value.split(/[?#]/, 1)[0].trim();
  try {
    const url = new URL(clean);
    return decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  } catch {
    try {
      return decodeURIComponent(clean.replace(/^\/+/, ""));
    } catch {
      return clean.replace(/^\/+/, "");
    }
  }
}

function assetPathToAbs(assetPath: string): string {
  if (assetPath.startsWith("/") && existsSync(assetPath)) {
    const absolute = resolve(assetPath);
    if (!isInDir(absolute, ASSETS_ROOT)) {
      throw new Error(`Absolute asset path is outside ASSETS_DIR: ${assetPath}`);
    }
    return absolute;
  }

  const stripped = stripUrlPath(assetPath);
  if (!stripped) throw new Error("Empty allowlisted asset path.");
  if (stripped.startsWith("assets/")) return resolve(REPO_ROOT, stripped);
  return resolve(ASSETS_ROOT, stripped);
}

function sourcePathForAbs(absPath: string): string {
  if (isInDir(absPath, ASSETS_ROOT)) return pathForJson(relative(ASSETS_ROOT, absPath));
  if (isInDir(absPath, REPO_ROOT)) return pathForJson(relative(REPO_ROOT, absPath));
  return basename(absPath);
}

function normalizeCategory(value: string | undefined): BundleCategory | undefined {
  const clean = value?.toLowerCase().trim();
  if (!clean) return undefined;
  if (clean === "model" || clean === "models" || clean === "3d") return "models";
  if (clean === "sprite" || clean === "sprites" || clean === "art" || clean === "2d") return "sprites";
  if (clean === "sound" || clean === "sounds" || clean === "sfx") return "sounds";
  if (clean === "music" || clean === "track" || clean === "tracks") return "music";
  if (clean === "texture" || clean === "textures" || clean === "material" || clean === "materials") return "textures";
  return undefined;
}

function inferCategory(assetPath: string, hint?: BundleCategory): BundleCategory {
  if (hint) return hint;
  const clean = stripUrlPath(assetPath).toLowerCase();
  const ext = extname(clean);
  if (clean.startsWith("glb/") || clean.startsWith("raw/") || clean.startsWith("3d/") || MODEL_EXTENSIONS.has(ext)) {
    return "models";
  }
  if (clean.startsWith("sounds/music/") || clean.includes("/music/")) return "music";
  if (clean.startsWith("sounds/") || AUDIO_EXTENSIONS.has(ext)) return "sounds";
  if (clean.startsWith("textures/") || clean.includes("/textures/") || clean.includes("/texture/")) return "textures";
  if (clean.startsWith("2d/") || IMAGE_EXTENSIONS.has(ext)) return "sprites";
  return "sprites";
}

function metadataFromRecord(record: Record<string, unknown>): AttributionInput {
  return {
    title: asString(record.title) ?? asString(record.name) ?? asString(record.label),
    creator: asString(record.creator) ?? asString(record.author) ?? asString(record.vendor),
    source: asString(record.source) ?? asString(record.sourceName),
    sourceUrl: asString(record.sourceUrl) ?? asString(record.source_url) ?? asString(record.url),
    license: asString(record.license) ?? asString(record.license_class),
    licenseUrl: asString(record.licenseUrl) ?? asString(record.license_url),
    attribution: asString(record.attribution) ?? asString(record.credit),
    notes: asString(record.notes) ?? asString(record.reason),
    pack: asString(record.packTitle) ?? asString(record.pack) ?? asString(record.id) ?? asString(record.folder),
  };
}

function metadataFromPack(pack: ManifestPack): AttributionInput {
  return {
    title: pack.title ?? pack.pack ?? pack.id,
    creator: pack.source ?? pack.vendor,
    source: pack.source ?? pack.vendor,
    license: pack.license,
    attribution: pack.license?.toLowerCase().includes("cc0") ? "Optional" : "See source license",
    pack: pack.id ?? [pack.vendor, pack.pack].filter(Boolean).join("/"),
  };
}

function metadataFromArtPack(pack: ArtPack): AttributionInput {
  return {
    title: pack.title ?? pack.folder,
    creator: pack.author,
    source: pack.author,
    sourceUrl: pack.url ?? pack.author_url,
    license: pack.license_class,
    attribution: pack.attribution,
    pack: pack.folder,
  };
}

function metadataFromSoundCollection(collection: SoundCollection): AttributionInput {
  return {
    title: collection.title ?? collection.id,
    creator: collection.source,
    source: collection.source,
    license: collection.license,
    notes: collection.notes,
    pack: collection.id ?? collection.path,
  };
}

function metadataFromMusicTrack(track: MusicTrack): AttributionInput {
  return {
    title: track.title ?? track.path,
    creator: track.source,
    source: track.source,
    license: track.license,
    notes: track.notes,
    pack: track.path ? packKeyFromSourcePath(track.path, "music") : undefined,
  };
}

function sourceInfoFor(metadata: AttributionInput, mediaCatalog: MediaCatalog): AttributionInput {
  const sources = mediaCatalog.sources ?? {};
  const key = Object.entries(sources).find(([, source]) => source.name === metadata.source)?.[0] ?? metadata.source;
  const source = key ? sources[key] : undefined;
  if (!source) return {};
  return {
    source: source.name,
    sourceUrl: source.url ?? undefined,
    license: source.license,
    licenseUrl: source.license_url ?? undefined,
    notes: source.notes,
  };
}

async function readJsonFile<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

function loadManifest(): Manifest {
  const path = join(SHOWCASE_DIR, "public", "manifest.json");
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) as Manifest : {};
}

function loadMediaCatalog(): MediaCatalog {
  const path = join(SHOWCASE_DIR, "public", "media-catalog.json");
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) as MediaCatalog : {};
}

function pathFromRecord(record: Record<string, unknown>): string | undefined {
  return (
    asString(record.path) ??
    asString(record.file) ??
    asString(record.src) ??
    asString(record.asset) ??
    asString(record.assetPath)
  );
}

function collectAllowlistEntries(raw: unknown): { entries: NormalizedEntry[]; exclusions: Exclusion[] } {
  const entries: NormalizedEntry[] = [];
  const exclusions: Exclusion[] = [];

  function push(value: unknown, categoryHint?: BundleCategory, inherited: AttributionInput = {}) {
    if (typeof value === "string") {
      entries.push({ raw: value, categoryHint, metadata: inherited });
      return;
    }
    if (!isRecord(value)) return;

    const localCategory = normalizeCategory(asString(value.category) ?? asString(value.type)) ?? categoryHint;
    const localMetadata = mergeMetadata(metadataFromRecord(value), inherited);
    const nested = [
      ...asArray(value.files),
      ...asArray(value.paths),
      ...asArray(value.assets),
      ...asArray(value.include),
      ...asArray(value.includes),
    ];

    if (nested.length) {
      for (const item of nested) push(item, localCategory, localMetadata);
      return;
    }

    entries.push({ raw: value, categoryHint: localCategory, metadata: localMetadata });
  }

  function pushExclusion(value: unknown) {
    if (typeof value === "string") {
      exclusions.push({ label: value, reason: "Excluded from supporter bundle", url: LIVE_SITE_URL });
      return;
    }
    if (!isRecord(value)) return;
    exclusions.push({
      label: asString(value.title) ?? asString(value.name) ?? asString(value.path) ?? asString(value.id) ?? "Excluded asset",
      reason: asString(value.reason) ?? asString(value.notes) ?? "Excluded from supporter bundle",
      url: asString(value.url) ?? asString(value.sourceUrl) ?? LIVE_SITE_URL,
    });
  }

  if (Array.isArray(raw)) {
    raw.forEach((item) => push(item));
    return { entries, exclusions };
  }
  if (!isRecord(raw)) throw new Error("bundle/allowlist.json must be an object or array.");

  for (const key of ["files", "assets", "include", "includes", "included"]) {
    for (const item of asArray(raw[key])) push(item);
  }
  for (const category of TOP_LEVEL_DIRS) {
    for (const item of asArray(raw[category])) push(item, category);
  }
  for (const item of asArray(raw.packs)) push(item);
  for (const item of asArray(raw.modelPacks)) push(item, "models");
  for (const item of asArray(raw.artPacks)) push(item, "sprites");
  for (const item of asArray(raw.soundCollections)) push(item, "sounds");
  for (const item of asArray(raw.musicTracks)) push(item, "music");
  for (const item of asArray(raw.texturePacks)) push(item, "textures");
  for (const key of ["exclude", "excludes", "excluded", "exclusions"]) {
    for (const item of asArray(raw[key])) pushExclusion(item);
  }

  return { entries, exclusions };
}

function manifestPackKeys(pack: ManifestPack): string[] {
  return [
    pack.id,
    [pack.vendor, pack.pack].filter(Boolean).join("/"),
    pack.pack,
    pack.title,
  ].filter((value): value is string => Boolean(value));
}

function findManifestPack(entry: RawAllowlistEntry, manifest: Manifest): ManifestPack | undefined {
  const packs = manifest.packs ?? [];
  if (typeof entry === "string") return packs.find((pack) => manifestPackKeys(pack).includes(entry));
  if (!isRecord(entry)) return undefined;
  const id = asString(entry.id) ?? asString(entry.packId);
  const vendor = asString(entry.vendor);
  const packName = asString(entry.pack);
  if (id) {
    const byId = packs.find((pack) => manifestPackKeys(pack).includes(id));
    if (byId) return byId;
  }
  if (vendor && packName) return packs.find((pack) => pack.vendor === vendor && pack.pack === packName);
  return undefined;
}

function findArtPack(entry: RawAllowlistEntry, mediaCatalog: MediaCatalog): ArtPack | undefined {
  const key =
    typeof entry === "string"
      ? entry
      : isRecord(entry)
        ? asString(entry.folder) ?? asString(entry.id) ?? asString(entry.pack) ?? asString(entry.path)
        : undefined;
  if (!key) return undefined;
  return (mediaCatalog.artPacks ?? []).find((pack) => pack.folder === key || pack.title === key);
}

function findSoundCollection(entry: RawAllowlistEntry, mediaCatalog: MediaCatalog): SoundCollection | undefined {
  const key =
    typeof entry === "string"
      ? entry
      : isRecord(entry)
        ? asString(entry.id) ?? asString(entry.path) ?? asString(entry.title)
        : undefined;
  if (!key) return undefined;
  return (mediaCatalog.soundCollections ?? []).find(
    (collection) => collection.id === key || collection.path === key || collection.title === key,
  );
}

function findMusicTrack(entry: RawAllowlistEntry, mediaCatalog: MediaCatalog): MusicTrack | undefined {
  const key =
    typeof entry === "string"
      ? entry
      : isRecord(entry)
        ? asString(entry.path) ?? asString(entry.src) ?? asString(entry.title)
        : undefined;
  if (!key) return undefined;
  return (mediaCatalog.musicTracks ?? []).find((track) => track.path === key || track.src === key || track.title === key);
}

function isDirectAssetPath(value: string): boolean {
  const clean = stripUrlPath(value);
  if (value.startsWith("/")) return true;
  if (DIRECT_ASSET_PREFIXES.some((prefix) => clean.startsWith(prefix))) return true;
  const ext = extname(clean).toLowerCase();
  return MODEL_EXTENSIONS.has(ext) || AUDIO_EXTENSIONS.has(ext) || IMAGE_EXTENSIONS.has(ext);
}

async function walkFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) stack.push(path);
      else if (entry.isFile()) files.push(path);
    }
  }
  return files.sort((a, b) => a.localeCompare(b));
}

function packKeyFromSourcePath(sourcePath: string, category: BundleCategory): string {
  const parts = sourcePath.split("/").filter(Boolean);
  if (category === "models" && (parts[0] === "glb" || parts[0] === "raw") && parts.length >= 3) {
    return `${parts[1]}/${parts[2]}`;
  }
  if (category === "sprites" && parts[0]?.toLowerCase() === "2d") {
    if (parts[1] === "kenney" && parts[2]) return `kenney/${parts[2]}`;
    if (parts[1]) return parts[1];
  }
  if (category === "music" && parts[0] === "sounds") {
    if (parts[1] === "music" && parts[2]) return parts[2];
    if (parts[1] && parts[2]) return `${parts[1]}/${parts[2]}`;
    return parts[1] ?? "music";
  }
  if (category === "sounds" && parts[0] === "sounds") return parts[1] ?? "sounds";
  if (category === "textures" && parts[0] === "textures") return parts[1] ?? "textures";
  return parts[0] ?? category;
}

function normalizePackKey(packKey: string | undefined, category: BundleCategory): string | undefined {
  if (!packKey) return undefined;
  const parts = packKey.split("/").filter(Boolean);
  if (category === "sprites" && parts[0]?.toLowerCase() === "2d") return parts.slice(1).join("/") || undefined;
  if ((category === "sounds" || category === "music") && parts[0] === "sounds") {
    const start = category === "music" && parts[1] === "music" ? 2 : 1;
    return parts.slice(start).join("/") || undefined;
  }
  if (category === "textures" && parts[0] === "textures") return parts.slice(1).join("/") || undefined;
  return packKey;
}

function relativeWithinPack(sourcePath: string, category: BundleCategory): string {
  const parts = sourcePath.split("/").filter(Boolean);
  let relativeParts = parts;
  if (category === "models" && (parts[0] === "glb" || parts[0] === "raw") && parts.length > 3) {
    relativeParts = parts.slice(3);
  } else if (category === "sprites" && parts[0]?.toLowerCase() === "2d") {
    relativeParts = parts[1] === "kenney" ? parts.slice(3) : parts.slice(2);
  } else if (category === "music" && parts[0] === "sounds") {
    relativeParts = parts.slice(3);
  } else if (category === "sounds" && parts[0] === "sounds") {
    relativeParts = parts.slice(2);
  } else if (category === "textures" && parts[0] === "textures") {
    relativeParts = parts.slice(2);
  }
  return safeZipPath(relativeParts.join("/") || basename(sourcePath));
}

function defaultBundlePath(sourcePath: string, category: BundleCategory, packKey: string): string {
  return safeZipPath(`${category}/${slugPart(packKey)}/${relativeWithinPack(sourcePath, category)}`);
}

function isUpstreamLicenseFile(path: string): boolean {
  return basename(path).toLowerCase() === "license.txt";
}

function attributionRecord(
  sourcePath: string,
  bundlePath: string,
  category: BundleCategory,
  metadata: AttributionInput,
): AttributionRecord {
  const title = metadata.title ?? basename(sourcePath);
  const creator = metadata.creator ?? metadata.source ?? "Unknown";
  const source = metadata.source ?? metadata.creator ?? "Unknown";
  const license = metadata.license ?? "See bundled license or source page";
  return {
    title,
    creator,
    source,
    sourceUrl: metadata.sourceUrl ?? "",
    license,
    licenseUrl: metadata.licenseUrl ?? "",
    attribution: metadata.attribution ?? `${title} by ${creator} - ${license}`,
    notes: metadata.notes ?? "",
    pack: metadata.pack ?? dirname(sourcePath),
    category,
    sourcePath,
    bundlePath,
  };
}

async function addExplicitAsset(
  out: Map<string, ResolvedAsset>,
  assetPath: string,
  categoryHint: BundleCategory | undefined,
  metadata: AttributionInput,
  bundlePathOverride?: string,
) {
  const absPath = assetPathToAbs(assetPath);
  const stats = await stat(absPath).catch(() => undefined);
  if (!stats) throw new Error(`Allowlisted asset not found: ${assetPath} -> ${absPath}`);

  if (stats.isDirectory()) {
    await addDirectoryAssets(out, assetPath, inferCategory(assetPath, categoryHint), metadata);
    return;
  }
  if (!stats.isFile()) throw new Error(`Allowlisted asset is not a file: ${assetPath} -> ${absPath}`);

  const sourcePath = sourcePathForAbs(absPath);
  const category = inferCategory(assetPath, categoryHint);
  const packKey = normalizePackKey(metadata.pack, category) ?? packKeyFromSourcePath(sourcePath, category);
  const bundlePath = bundlePathOverride ? safeZipPath(bundlePathOverride) : defaultBundlePath(sourcePath, category, packKey);
  const attribution = attributionRecord(sourcePath, bundlePath, category, metadata);
  out.set(bundlePath, { absPath, sourcePath, bundlePath, category, packKey, attribution });
}

async function addDirectoryAssets(
  out: Map<string, ResolvedAsset>,
  rootPath: string,
  category: BundleCategory,
  metadata: AttributionInput,
) {
  const absRoot = assetPathToAbs(rootPath);
  const stats = await stat(absRoot).catch(() => undefined);
  if (!stats?.isDirectory()) throw new Error(`Allowlisted asset directory not found: ${rootPath} -> ${absRoot}`);

  for (const file of await walkFiles(absRoot)) {
    if (isUpstreamLicenseFile(file)) continue;
    const sourcePath = sourcePathForAbs(file);
    const relFromRoot = safeZipPath(pathForJson(relative(absRoot, file)));
    const packKey = normalizePackKey(metadata.pack, category) ?? packKeyFromSourcePath(sourcePath, category);
    const bundlePath = safeZipPath(`${category}/${slugPart(packKey)}/${relFromRoot}`);
    const attribution = attributionRecord(sourcePath, bundlePath, category, metadata);
    out.set(bundlePath, { absPath: file, sourcePath, bundlePath, category, packKey, attribution });
  }
}

function modelDownloads(model: ManifestModel): string[] {
  const files = new Set<string>();
  if (model.file) files.add(model.file);
  for (const download of model.downloads ?? []) {
    if (download.file) files.add(download.file);
  }
  return [...files];
}

function artPackAssetRoot(folder: string): string {
  return folder.toLowerCase().startsWith("2d/") ? folder : `2D/${folder}`;
}

async function resolveAssets(entries: NormalizedEntry[], manifest: Manifest, mediaCatalog: MediaCatalog) {
  const out = new Map<string, ResolvedAsset>();

  for (const entry of entries) {
    const record = isRecord(entry.raw) ? entry.raw : undefined;
    const explicitPath = record ? pathFromRecord(record) : typeof entry.raw === "string" ? entry.raw : undefined;
    const bundlePath = record
      ? asString(record.bundlePath) ?? asString(record.entryName) ?? asString(record.entry)
      : undefined;

    if (explicitPath?.endsWith(GLOB_SUFFIX)) {
      await addDirectoryAssets(
        out,
        explicitPath.slice(0, -GLOB_SUFFIX.length),
        inferCategory(explicitPath.slice(0, -GLOB_SUFFIX.length), entry.categoryHint),
        entry.metadata,
      );
      continue;
    }

    if (explicitPath && isDirectAssetPath(explicitPath)) {
      await addExplicitAsset(out, explicitPath, entry.categoryHint, entry.metadata, bundlePath);
      continue;
    }

    const manifestPack = findManifestPack(entry.raw, manifest);
    if (manifestPack) {
      const packMetadata = mergeMetadata(
        entry.metadata,
        metadataFromPack(manifestPack),
        sourceInfoFor(metadataFromPack(manifestPack), mediaCatalog),
      );
      for (const model of manifestPack.models ?? []) {
        for (const file of modelDownloads(model)) {
          await addExplicitAsset(out, file, "models", mergeMetadata({ title: model.title ?? model.name }, packMetadata));
        }
      }
      continue;
    }

    const artPack = findArtPack(entry.raw, mediaCatalog);
    if (artPack?.folder) {
      await addDirectoryAssets(out, artPackAssetRoot(artPack.folder), "sprites", mergeMetadata(entry.metadata, metadataFromArtPack(artPack)));
      continue;
    }

    const soundCollection = findSoundCollection(entry.raw, mediaCatalog);
    if (soundCollection) {
      const metadata = mergeMetadata(entry.metadata, metadataFromSoundCollection(soundCollection));
      if (soundCollection.path?.endsWith(GLOB_SUFFIX)) {
        await addDirectoryAssets(out, soundCollection.path.slice(0, -GLOB_SUFFIX.length), "sounds", metadata);
      } else {
        for (const sample of soundCollection.samples ?? []) {
          if (sample.path) await addExplicitAsset(out, sample.path, "sounds", mergeMetadata({ title: sample.label }, metadata));
        }
      }
      continue;
    }

    const musicTrack = findMusicTrack(entry.raw, mediaCatalog);
    if (musicTrack?.path) {
      await addExplicitAsset(out, musicTrack.path, "music", mergeMetadata(entry.metadata, metadataFromMusicTrack(musicTrack)));
      continue;
    }

    if (explicitPath) {
      await addExplicitAsset(out, explicitPath, entry.categoryHint, entry.metadata, bundlePath);
      continue;
    }

    throw new Error(`Could not resolve allowlist entry: ${JSON.stringify(entry.raw)}`);
  }

  return [...out.values()].sort((a, b) => a.bundlePath.localeCompare(b.bundlePath));
}

async function findLicense(absPath: string): Promise<string | undefined> {
  let dir = dirname(absPath);
  while (isInDir(dir, ASSETS_ROOT)) {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    const match = entries.find((entry) => entry.isFile() && entry.name.toLowerCase() === "license.txt");
    if (match) return join(dir, match.name);
    if (dir === ASSETS_ROOT) break;
    dir = dirname(dir);
  }
  return undefined;
}

async function collectLicenses(assets: ResolvedAsset[]): Promise<LicenseCopy[]> {
  const licenses = new Map<string, LicenseCopy>();
  for (const asset of assets) {
    const license = await findLicense(asset.absPath);
    if (!license) continue;
    const bundlePath = safeZipPath(`LICENSES/${slugPart(asset.packKey)}/License.txt`);
    licenses.set(bundlePath, {
      absPath: license,
      sourcePath: sourcePathForAbs(license),
      bundlePath,
      packKey: asset.packKey,
    });
  }
  return [...licenses.values()].sort((a, b) => a.bundlePath.localeCompare(b.bundlePath));
}

function makeAttributionJson(assets: ResolvedAsset[], licenses: LicenseCopy[], exclusions: Exclusion[], stats: BuildStats) {
  return JSON.stringify(
    {
      schema: "gamedev.supporter-bundle.attribution.v1",
      generatedAt: new Date().toISOString(),
      liveSiteUrl: LIVE_SITE_URL,
      stats,
      assets: assets.map((asset) => asset.attribution),
      licenses: licenses.map((license) => ({
        sourcePath: license.sourcePath,
        bundlePath: license.bundlePath,
        packKey: license.packKey,
      })),
      exclusions,
    },
    null,
    2,
  ) + "\n";
}

function makeAttributionMd(assets: ResolvedAsset[], licenses: LicenseCopy[]): string {
  const rows = assets.map((asset) => {
    const data = asset.attribution;
    const source = data.sourceUrl ? `[${data.source}](${data.sourceUrl})` : data.source;
    const license = data.licenseUrl ? `[${data.license}](${data.licenseUrl})` : data.license;
    return `| ${data.category} | \`${data.bundlePath}\` | ${data.title} | ${data.creator} | ${source} | ${license} | ${data.attribution} |`;
  });
  const licenseRows = licenses.map((license) => `- \`${license.bundlePath}\` copied from \`${license.sourcePath}\`.`);
  return [
    "# Attribution",
    "",
    "This file is generated by `pnpm bundle:zip` from `bundle/allowlist.json`.",
    "Verify license terms before shipping any derived product.",
    "",
    "| Category | Bundle file | Title | Creator | Source | License | Attribution |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...rows,
    "",
    "## Bundled License Files",
    "",
    ...(licenseRows.length ? licenseRows : ["No upstream `License.txt` files were found for the included packs."]),
    "",
  ].join("\n");
}

function makeTopReadme(stats: BuildStats, exclusions: Exclusion[]): string {
  const categoryRows = TOP_LEVEL_DIRS.map((category) => `- \`${category}/\`: ${stats.byCategory[category]} files`);
  const exclusionRows = exclusions.slice(0, 50).map((item) => {
    const url = item.url ?? LIVE_SITE_URL;
    return `- ${item.label}: ${item.reason}. See ${url}`;
  });
  return [
    "# Gamedev Asset Library Supporter Bundle",
    "",
    "This zip is generated from `bundle/allowlist.json` by `showcase/scripts/build-bundle-zip.ts`.",
    "It contains only assets allowlisted for the supporter storefront artifact.",
    "",
    "## Included",
    "",
    ...categoryRows,
    "",
    "Top-level generated files:",
    "",
    "- `README.md`: this overview.",
    "- `ATTRIBUTION.md`: human-readable credits.",
    "- `attribution.json`: machine-readable credits and bundle metadata.",
    "- `LICENSES/`: upstream per-pack `License.txt` files when they were present beside bundled assets.",
    "",
    "## Excluded",
    "",
    `Assets not present in this zip are intentionally excluded by the allowlist. Browse the live library for previews, source context, and assets that are not redistributed in this bundle: ${LIVE_SITE_URL}`,
    "",
    ...(exclusionRows.length ? ["Allowlist exclusions:", "", ...exclusionRows, ""] : []),
    "## Notes",
    "",
    "Keep `ATTRIBUTION.md`, `attribution.json`, and `LICENSES/` with any redistributed copy of this bundle.",
    "Some source sites publish permissive terms while still requiring attribution or forbidding resale of raw files; the allowlist is the final filter for this artifact.",
    "",
  ].join("\n");
}

function makeFolderReadme(category: BundleCategory, count: number): string {
  if (count > 0) return `${category}/ contains ${count} allowlisted files for this bundle.\n`;
  return `${category}/ is included for bundle structure consistency. No files in this category were allowlisted.\n`;
}

class ZipFileWriter {
  private readonly zip = new Zip();
  private readonly output = createWriteStream(OUTPUT_PATH);
  private pendingDrain: Promise<void> | undefined;
  private streamError: Error | undefined;
  readonly done: Promise<void>;

  constructor() {
    this.output.on("error", (error) => {
      this.streamError = error;
    });
    this.done = new Promise<void>((resolveDone, rejectDone) => {
      this.output.on("finish", () => resolveDone());
      this.output.on("error", rejectDone);
      this.zip.ondata = (error, data, final) => {
        if (error) {
          this.output.destroy(error);
          rejectDone(error);
          return;
        }
        if (data?.byteLength) this.writeChunk(data);
        if (final) this.output.end();
      };
    });
  }

  async addText(path: string, text: string) {
    const entry = new ZipPassThrough(safeZipPath(path));
    this.zip.add(entry);
    entry.push(strToU8(text), true);
    await this.flush();
  }

  async addFile(path: string, absPath: string) {
    const entry = new ZipPassThrough(safeZipPath(path));
    this.zip.add(entry);
    for await (const chunk of createReadStream(absPath, { highWaterMark: 1024 * 1024 })) {
      entry.push(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk), false);
      await this.flush();
    }
    entry.push(new Uint8Array(0), true);
    await this.flush();
  }

  async end() {
    this.zip.end();
    await this.done;
  }

  private writeChunk(data: Uint8Array) {
    if (!this.output.write(Buffer.from(data)) && !this.pendingDrain) {
      this.pendingDrain = new Promise<void>((resolveDrain, rejectDrain) => {
        this.output.once("drain", resolveDrain);
        this.output.once("error", rejectDrain);
      });
    }
  }

  private async flush() {
    if (this.streamError) throw this.streamError;
    if (this.pendingDrain) {
      await this.pendingDrain;
      this.pendingDrain = undefined;
    }
    if (this.streamError) throw this.streamError;
  }
}

async function build() {
  if (!existsSync(ALLOWLIST_PATH)) {
    die(
      [
        `Missing bundle allowlist: ${ALLOWLIST_PATH}`,
        "",
        "Run `pnpm bundle:filter` first to generate bundle/allowlist.json, then rerun `pnpm bundle:zip`.",
      ].join("\n"),
    );
  }

  const rawAllowlist = await readJsonFile<unknown>(ALLOWLIST_PATH);
  const { entries, exclusions } = collectAllowlistEntries(rawAllowlist);
  if (entries.length === 0) throw new Error("bundle/allowlist.json did not include any assets or packs.");

  const manifest = loadManifest();
  const mediaCatalog = loadMediaCatalog();
  const assets = await resolveAssets(entries, manifest, mediaCatalog);
  if (assets.length === 0) throw new Error("No allowlisted assets resolved to bundle files.");

  const licenses = await collectLicenses(assets);
  const byCategory = Object.fromEntries(TOP_LEVEL_DIRS.map((category) => [category, 0])) as Record<BundleCategory, number>;
  let bytes = 0;
  for (const asset of assets) {
    byCategory[asset.category] += 1;
    bytes += (await stat(asset.absPath)).size;
  }
  const stats: BuildStats = { files: assets.length, bytes, byCategory };

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  const writer = new ZipFileWriter();
  await writer.addText("README.md", makeTopReadme(stats, exclusions));
  await writer.addText("ATTRIBUTION.md", makeAttributionMd(assets, licenses));
  await writer.addText("attribution.json", makeAttributionJson(assets, licenses, exclusions, stats));
  await writer.addText("LICENSES/README.md", "Upstream per-pack License.txt files are copied here when present.\n");
  for (const category of TOP_LEVEL_DIRS) {
    await writer.addText(`${category}/README.md`, makeFolderReadme(category, byCategory[category]));
  }
  for (const license of licenses) {
    await writer.addFile(license.bundlePath, license.absPath);
  }
  for (const asset of assets) {
    await writer.addFile(asset.bundlePath, asset.absPath);
  }
  await writer.end();

  const zipStats = await stat(OUTPUT_PATH);
  console.log(`Built ${pathForJson(relative(REPO_ROOT, OUTPUT_PATH))}`);
  console.log(`Included ${assets.length} files (${bytes.toLocaleString("en-US")} source bytes).`);
  console.log(`Zip size: ${zipStats.size.toLocaleString("en-US")} bytes.`);
}

build().catch((error) => {
  console.error(errorMessage(error));
  process.exit(1);
});
