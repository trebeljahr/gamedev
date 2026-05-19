import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";

const SHOWCASE_DIR = join(__dirname, "..");
const REPO_ROOT = join(SHOWCASE_DIR, "..");
const BUNDLE_DIR = join(REPO_ROOT, "bundle");
const ALLOWLIST_PATH = join(BUNDLE_DIR, "allowlist.json");
const AUDIT_JSON_PATH = join(BUNDLE_DIR, "audit.json");
const AUDIT_MD_PATH = join(BUNDLE_DIR, "audit.md");
const SOURCE_DIRS = [join(SHOWCASE_DIR, "data"), join(SHOWCASE_DIR, "public")];

type Manifest = {
  packs?: ManifestPack[];
};

type ManifestPack = {
  id?: string;
  vendor?: string;
  pack?: string;
  title?: string;
  source?: string;
  license?: string;
};

type MediaCatalog = {
  artPacks?: ArtPack[];
  soundCollections?: SoundCollection[];
  musicTracks?: MusicTrack[];
  sourceMappings?: SourceMapping[];
  sources?: Record<string, SourceInfo>;
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
};

type MusicTrack = {
  path?: string;
  src?: string;
  title?: string;
  source?: string;
  url?: string;
  license?: string;
  notes?: string;
};

type SourceMapping = {
  id?: string;
  pathPattern?: string;
  path_pattern?: string;
  source?: string;
  title?: string;
  author?: string;
  likelyCreator?: string;
  likely_creator?: string;
  url?: string;
  license?: string;
  license_url?: string;
  notes?: string;
  medium?: string;
  category?: string;
};

type SourceInfo = {
  name?: string;
  url?: string | null;
  license?: string;
  license_url?: string | null;
  notes?: string;
};

type CandidateType = "modelPack" | "artPack" | "soundCollection" | "musicTrack" | "sourceMapping";
type AllowlistCategory = "models" | "sprites" | "sounds" | "music" | "textures";
type LicenseKind = "cc0" | "cc-by" | "pixabay";
type Decision = "include" | "exclude";

type Candidate = {
  type: CandidateType;
  id: string;
  title: string;
  path?: string;
  source?: string;
  sourceUrl?: string;
  creator?: string;
  license?: string;
  licenseUrl?: string;
  attribution?: string;
  notes?: string;
  raw: ManifestPack | ArtPack | SoundCollection | MusicTrack | SourceMapping;
};

type LicenseVerdict =
  | {
      include: true;
      kind: LicenseKind;
      reason: string;
      attributionRequired: boolean;
    }
  | {
      include: false;
      reason: string;
    };

type AuditEntry = {
  id: string;
  type: CandidateType;
  title: string;
  path: string | null;
  source: string | null;
  sourceUrl: string | null;
  creator: string | null;
  license: string | null;
  licenseUrl: string | null;
  attribution: string | null;
  decision: Decision;
  reason: string;
  allowlistCategory: AllowlistCategory | null;
};

type AllowlistRecord = {
  id?: string;
  folder?: string;
  path?: string;
  title: string;
  creator?: string;
  author?: string;
  source?: string;
  sourceUrl?: string;
  url?: string;
  license: string;
  licenseUrl?: string;
  attribution?: string;
  notes?: string;
  pack?: string;
};

type Allowlist = {
  schema: "gamedev.supporter-bundle.allowlist.v1";
  sourceFiles: string[];
  policy: {
    include: string[];
    exclude: string[];
  };
  stats: {
    included: number;
    excluded: number;
    byType: Record<CandidateType, { included: number; excluded: number }>;
  };
  models: AllowlistRecord[];
  sprites: AllowlistRecord[];
  sounds: AllowlistRecord[];
  music: AllowlistRecord[];
  textures: AllowlistRecord[];
  modelPacks: AllowlistRecord[];
  artPacks: AllowlistRecord[];
  soundCollections: AllowlistRecord[];
  musicTracks: AllowlistRecord[];
  exclusions: { label: string; reason: string; url?: string }[];
};

const POLICY = {
  include: [
    "CC0 / Creative Commons Zero",
    "CC-BY only when attribution metadata is recorded",
    "Pixabay License",
  ],
  exclude: [
    "CC-BY-NC and other non-commercial licenses",
    "CC-BY-SA and other share-alike licenses",
    "Mixamo / Adobe raw asset redistribution terms",
    "Adobe Fuse raw asset redistribution terms",
    "Sketchfab personal-use-only or non-commercial assets",
    "Missing, unknown, varied, custom, or otherwise non-permissive license fields",
  ],
};

const EMPTY_STATS = {
  included: 0,
  excluded: 0,
};

function die(message: string): never {
  console.error(message);
  process.exit(1);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function pathForJson(path: string): string {
  return path.split(sep).join("/");
}

function rel(path: string): string {
  return pathForJson(relative(REPO_ROOT, path));
}

function normalizeLicense(value: string | undefined): string {
  return (value ?? "").toLowerCase().replace(/[_\s]+/g, " ").trim();
}

function normalizeSourceKey(value: string | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function sourceInfoFor(source: string | undefined, sources: Record<string, SourceInfo>): SourceInfo | undefined {
  if (!source) return undefined;
  const sourceKey = normalizeSourceKey(source);
  return Object.entries(sources).find(([key, value]) => {
    return normalizeSourceKey(key) === sourceKey || normalizeSourceKey(value.name) === sourceKey;
  })?.[1];
}

function ccByLicenseUrl(license: string): string | undefined {
  if (/4\.0/.test(license)) return "https://creativecommons.org/licenses/by/4.0/";
  if (/3\.0/.test(license)) return "https://creativecommons.org/licenses/by/3.0/";
  return "https://creativecommons.org/licenses/by/4.0/";
}

function defaultLicenseUrl(kind: LicenseKind, license: string): string | undefined {
  if (kind === "cc0") return "https://creativecommons.org/publicdomain/zero/1.0/";
  if (kind === "cc-by") return ccByLicenseUrl(license);
  if (kind === "pixabay") return "https://pixabay.com/service/terms/#license";
  return undefined;
}

function isMissingOrVagueLicense(cleanLicense: string): boolean {
  if (!cleanLicense) return true;
  return (
    cleanLicense === "unknown" ||
    cleanLicense.includes("varies") ||
    cleanLicense.includes("check source") ||
    cleanLicense.includes("see source") ||
    cleanLicense.includes("custom") ||
    cleanLicense.includes("royalty-free") ||
    cleanLicense.includes("bundled") ||
    cleanLicense.includes("database terms") ||
    cleanLicense.includes("free for any use")
  );
}

function licenseVerdict(candidate: Candidate): LicenseVerdict {
  const license = candidate.license;
  const cleanLicense = normalizeLicense(license);
  const searchText = normalizeLicense(
    [
      candidate.id,
      candidate.title,
      candidate.path,
      candidate.source,
      candidate.creator,
      candidate.notes,
      license,
    ]
      .filter(Boolean)
      .join(" "),
  );

  if (searchText.includes("mixamo") || cleanLicense.includes("adobe mixamo")) {
    return {
      include: false,
      reason: "Mixamo / Adobe terms do not allow redistribution of raw assets in the bundle.",
    };
  }
  if (searchText.includes("adobe fuse") || searchText.includes("adobe-fuse") || cleanLicense.includes("adobe fuse")) {
    return {
      include: false,
      reason: "Adobe Fuse assets are not cleared for raw asset redistribution in the bundle.",
    };
  }
  if (
    cleanLicense.includes("cc-by-nc") ||
    cleanLicense.includes("cc by nc") ||
    cleanLicense.includes("by-nc") ||
    cleanLicense.includes("non-commercial") ||
    cleanLicense.includes("noncommercial")
  ) {
    return {
      include: false,
      reason: "Non-commercial license is not safe for commercial redistribution.",
    };
  }
  if (
    cleanLicense.includes("cc-by-sa") ||
    cleanLicense.includes("cc by sa") ||
    cleanLicense.includes("by-sa") ||
    cleanLicense.includes("share alike") ||
    cleanLicense.includes("share-alike")
  ) {
    return {
      include: false,
      reason: "Share-alike license is excluded from the commercial redistribution bundle.",
    };
  }
  if (
    cleanLicense.includes("personal use") ||
    cleanLicense.includes("personal-use") ||
    searchText.includes("personal use only") ||
    cleanLicense.includes("no redistribution") ||
    cleanLicense.includes("no resale") ||
    cleanLicense.includes("no resell")
  ) {
    return {
      include: false,
      reason: "License text restricts personal use, resale, or raw redistribution.",
    };
  }
  if (searchText.includes("sketchfab") && (searchText.includes("personal") || searchText.includes("non-commercial"))) {
    return {
      include: false,
      reason: "Sketchfab personal-use or non-commercial asset is excluded.",
    };
  }
  if (isMissingOrVagueLicense(cleanLicense)) {
    return {
      include: false,
      reason: license
        ? `License field is not a concrete bundle-safe license: ${license}.`
        : "Missing license field.",
    };
  }
  if (cleanLicense.includes("pixabay")) {
    return {
      include: true,
      kind: "pixabay",
      reason: "Included: Pixabay License is commercial-redistribution safe for this bundle.",
      attributionRequired: false,
    };
  }
  if (/\bcc0\b|creative commons zero/.test(cleanLicense)) {
    return {
      include: true,
      kind: "cc0",
      reason: "Included: CC0 / Creative Commons Zero.",
      attributionRequired: false,
    };
  }
  if (/\bcc[- ]?by\b/.test(cleanLicense) || cleanLicense.includes("creative commons attribution")) {
    if (!candidate.creator || normalizeSourceKey(candidate.creator) === "unknown") {
      return {
        include: false,
        reason: "CC-BY requires attribution, but no creator/author attribution is recorded.",
      };
    }
    return {
      include: true,
      kind: "cc-by",
      reason: "Included: CC-BY with attribution metadata recorded.",
      attributionRequired: true,
    };
  }

  return {
    include: false,
    reason: `License field is not in the bundle-safe allowlist: ${license}.`,
  };
}

function attributionFor(candidate: Candidate, verdict: LicenseVerdict): string | undefined {
  if (!verdict.include) return candidate.attribution;
  if (candidate.attribution) return candidate.attribution;
  if (verdict.kind === "cc0") return "Optional";
  if (verdict.kind === "pixabay") return "Not required";
  return `${candidate.title} by ${candidate.creator} - ${candidate.license}`;
}

function patternFromSourceMapping(mapping: SourceMapping): string | undefined {
  return asString(mapping.pathPattern) ?? asString(mapping.path_pattern) ?? asString(mapping.id);
}

function artPackRoot(folder: string): string {
  return folder.toLowerCase().startsWith("2d/") ? folder : `2D/${folder}`;
}

function inferCategory(path: string | undefined, type: CandidateType): AllowlistCategory | null {
  if (type === "artPack") return "sprites";
  if (type === "soundCollection") return "sounds";
  if (type === "musicTrack") return "music";
  if (type === "modelPack") return null;
  const clean = (path ?? "").toLowerCase();
  if (clean.startsWith("textures/")) return "textures";
  if (clean.startsWith("sounds/music/")) return "music";
  if (clean.startsWith("sounds/")) return "sounds";
  if (clean.startsWith("2d/")) return "sprites";
  if (clean.startsWith("3d/") || clean.startsWith("raw/") || clean.startsWith("glb/")) return "models";
  return null;
}

function isResolvablePathPattern(path: string | undefined): boolean {
  if (!path) return false;
  if (path.endsWith("/**")) return true;
  return !/[{}*]/.test(path);
}

function packFromPathPattern(path: string | undefined, category: AllowlistCategory | null): string | undefined {
  if (!path) return undefined;
  const clean = path.replace(/\/\*\*$/, "");
  const parts = clean.split("/").filter(Boolean);
  if (category === "models" && parts[0]?.toLowerCase() === "3d" && parts.length >= 3) return parts[2];
  if (category === "sprites" && parts[0]?.toLowerCase() === "2d") {
    if (parts[1] === "kenney" && parts[2]) return `kenney/${parts[2]}`;
    return parts[1];
  }
  if (category === "sounds" && parts[0] === "sounds") return parts.slice(1, 3).join("/") || undefined;
  if (category === "music" && parts[0] === "sounds" && parts[1] === "music") {
    return parts[2]?.includes(".") ? undefined : parts[2];
  }
  if (category === "textures" && parts[0] === "textures") return parts[1];
  return parts.at(-1);
}

function candidateFromManifestPack(pack: ManifestPack): Candidate {
  const id = pack.id ?? [pack.vendor, pack.pack].filter(Boolean).join("/") ?? pack.title ?? "unknown-model-pack";
  return {
    type: "modelPack",
    id,
    title: pack.title ?? pack.pack ?? id,
    source: pack.source ?? pack.vendor,
    creator: pack.source ?? pack.vendor,
    license: pack.license,
    raw: pack,
  };
}

function candidateFromArtPack(pack: ArtPack): Candidate {
  const id = pack.folder ?? pack.title ?? "unknown-art-pack";
  return {
    type: "artPack",
    id,
    title: pack.title ?? id,
    path: pack.folder ? artPackRoot(pack.folder) : undefined,
    source: pack.author,
    sourceUrl: pack.url ?? pack.author_url,
    creator: pack.author,
    license: pack.license_class,
    attribution: pack.attribution,
    raw: pack,
  };
}

function candidateFromSoundCollection(collection: SoundCollection): Candidate {
  const id = collection.id ?? collection.path ?? collection.title ?? "unknown-sound-collection";
  return {
    type: "soundCollection",
    id,
    title: collection.title ?? id,
    path: collection.path,
    source: collection.source,
    creator: collection.source,
    license: collection.license,
    notes: collection.notes,
    raw: collection,
  };
}

function candidateFromMusicTrack(track: MusicTrack): Candidate {
  const id = track.path ?? track.src ?? track.title ?? "unknown-music-track";
  return {
    type: "musicTrack",
    id,
    title: track.title ?? id,
    path: track.path ?? track.src?.replace(/^\//, ""),
    source: track.source,
    sourceUrl: track.url,
    creator: track.source,
    license: track.license,
    notes: track.notes,
    raw: track,
  };
}

function candidateFromSourceMapping(mapping: SourceMapping, sources: Record<string, SourceInfo>): Candidate {
  const sourceInfo = sourceInfoFor(mapping.source, sources);
  const path = patternFromSourceMapping(mapping);
  const sourceName = sourceInfo?.name ?? mapping.source;
  const creator = asString(mapping.author) ?? asString(mapping.likelyCreator) ?? asString(mapping.likely_creator);
  const license = asString(mapping.license);
  return {
    type: "sourceMapping",
    id: mapping.id ?? path ?? mapping.title ?? "unknown-source-mapping",
    title: mapping.title ?? mapping.id ?? path ?? "Unknown source mapping",
    path,
    source: sourceName,
    sourceUrl: mapping.url ?? sourceInfo?.url ?? undefined,
    creator,
    license,
    licenseUrl: mapping.license_url,
    notes: mapping.notes,
    raw: mapping,
  };
}

function candidateSort(a: Candidate, b: Candidate): number {
  return a.type.localeCompare(b.type) || a.id.localeCompare(b.id);
}

function auditSort(a: AuditEntry, b: AuditEntry): number {
  return a.type.localeCompare(b.type) || a.id.localeCompare(b.id);
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

function findSourceFile(fileName: string): string {
  for (const dir of SOURCE_DIRS) {
    const path = join(dir, fileName);
    if (existsSync(path)) return path;
  }
  die(`Missing source JSON: expected ${SOURCE_DIRS.map((dir) => join(dir, fileName)).join(" or ")}`);
}

function recordBase(candidate: Candidate, licenseUrl: string | undefined, attribution: string | undefined): AllowlistRecord {
  return {
    title: candidate.title,
    creator: candidate.creator,
    author: candidate.creator,
    source: candidate.source,
    sourceUrl: candidate.sourceUrl,
    url: candidate.sourceUrl,
    license: candidate.license ?? "",
    licenseUrl,
    attribution,
    notes: candidate.notes,
  };
}

function allowlistRecord(candidate: Candidate, verdict: LicenseVerdict): AllowlistRecord | undefined {
  if (!verdict.include || !candidate.license) return undefined;
  const licenseUrl = candidate.licenseUrl ?? defaultLicenseUrl(verdict.kind, candidate.license);
  const attribution = attributionFor(candidate, verdict);
  const base = recordBase(candidate, licenseUrl, attribution);
  const category = inferCategory(candidate.path, candidate.type);

  if (candidate.type === "modelPack") return { ...base, id: candidate.id, pack: candidate.id };
  if (candidate.type === "artPack") return { ...base, folder: candidate.id, pack: candidate.id };
  if (candidate.type === "soundCollection") return { ...base, id: candidate.id, path: candidate.path, pack: candidate.id };
  if (candidate.type === "musicTrack") return { ...base, path: candidate.path, pack: packFromPathPattern(candidate.path, "music") };
  if (candidate.type === "sourceMapping" && candidate.path && category) {
    return {
      ...base,
      id: candidate.id,
      path: candidate.path,
      pack: packFromPathPattern(candidate.path, category) ?? candidate.title,
    };
  }
  return undefined;
}

function coverageKey(path: string | undefined): string | undefined {
  return path?.replace(/^\/+/, "").replace(/\/+$/, "");
}

function sourceMappingCovered(candidate: Candidate, coveredPaths: Set<string>): boolean {
  const key = coverageKey(candidate.path);
  if (!key) return false;
  if (coveredPaths.has(key)) return true;
  if (key === "2D/kenney/**") return [...coveredPaths].some((path) => path.startsWith("2D/kenney/"));
  return false;
}

function maybeAddCoveredPath(candidate: Candidate, verdict: LicenseVerdict, coveredPaths: Set<string>) {
  if (!verdict.include) return;
  const key = coverageKey(candidate.path);
  if (key) coveredPaths.add(key);
}

function makeAuditEntry(candidate: Candidate, verdict: LicenseVerdict, allowlistCategory: AllowlistCategory | null): AuditEntry {
  const included = verdict.include;
  const attribution = attributionFor(candidate, verdict);
  return {
    id: candidate.id,
    type: candidate.type,
    title: candidate.title,
    path: candidate.path ?? null,
    source: candidate.source ?? null,
    sourceUrl: candidate.sourceUrl ?? null,
    creator: candidate.creator ?? null,
    license: candidate.license ?? null,
    licenseUrl: candidate.licenseUrl ?? (verdict.include && candidate.license ? defaultLicenseUrl(verdict.kind, candidate.license) : undefined) ?? null,
    attribution: attribution ?? null,
    decision: included ? "include" : "exclude",
    reason: verdict.reason,
    allowlistCategory,
  };
}

function emptyTypeStats(): Record<CandidateType, { included: number; excluded: number }> {
  return {
    modelPack: { ...EMPTY_STATS },
    artPack: { ...EMPTY_STATS },
    soundCollection: { ...EMPTY_STATS },
    musicTrack: { ...EMPTY_STATS },
    sourceMapping: { ...EMPTY_STATS },
  };
}

function makeAllowlist(sourceFiles: string[], audit: AuditEntry[], includedRecords: Map<string, AllowlistRecord[]>): Allowlist {
  const byType = emptyTypeStats();
  for (const entry of audit) {
    byType[entry.type][entry.decision === "include" ? "included" : "excluded"] += 1;
  }
  const included = audit.filter((entry) => entry.decision === "include").length;
  const excluded = audit.length - included;
  return {
    schema: "gamedev.supporter-bundle.allowlist.v1",
    sourceFiles,
    policy: POLICY,
    stats: {
      included,
      excluded,
      byType,
    },
    models: includedRecords.get("models") ?? [],
    sprites: includedRecords.get("sprites") ?? [],
    sounds: includedRecords.get("sounds") ?? [],
    music: includedRecords.get("music") ?? [],
    textures: includedRecords.get("textures") ?? [],
    modelPacks: includedRecords.get("modelPack") ?? [],
    artPacks: includedRecords.get("artPack") ?? [],
    soundCollections: includedRecords.get("soundCollection") ?? [],
    musicTracks: includedRecords.get("musicTrack") ?? [],
    exclusions: audit
      .filter((entry) => entry.decision === "exclude")
      .map((entry) => ({
        label: entry.path ? `${entry.title} (${entry.path})` : entry.title,
        reason: entry.reason,
        url: entry.sourceUrl ?? undefined,
      })),
  };
}

function escapeMd(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\n/g, " ");
}

function makeAuditMarkdown(sourceFiles: string[], audit: AuditEntry[]): string {
  const included = audit.filter((entry) => entry.decision === "include");
  const excluded = audit.filter((entry) => entry.decision === "exclude");
  const rows = audit.map((entry) => {
    const path = entry.path ? `\`${escapeMd(entry.path)}\`` : "";
    const source = entry.sourceUrl && entry.source ? `[${escapeMd(entry.source)}](${entry.sourceUrl})` : escapeMd(entry.source);
    return [
      entry.decision,
      entry.type,
      escapeMd(entry.title),
      path,
      source,
      escapeMd(entry.creator),
      escapeMd(entry.license),
      escapeMd(entry.reason),
    ].join(" | ");
  });

  return [
    "# Supporter Bundle License Audit",
    "",
    "Generated by `pnpm bundle:filter`.",
    "",
    "## Source Files",
    "",
    ...sourceFiles.map((file) => `- \`${file}\``),
    "",
    "## Policy",
    "",
    "Included licenses:",
    "",
    ...POLICY.include.map((item) => `- ${item}`),
    "",
    "Excluded licenses/sources:",
    "",
    ...POLICY.exclude.map((item) => `- ${item}`),
    "",
    "## Summary",
    "",
    `- Included: ${included.length}`,
    `- Excluded: ${excluded.length}`,
    "",
    "## Per-Asset Decisions",
    "",
    "Decision | Type | Title | Path | Source | Creator | License | Reason",
    "--- | --- | --- | --- | --- | --- | --- | ---",
    ...rows,
    "",
  ].join("\n");
}

function toJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function writeJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, toJson(value), "utf8");
}

async function writeText(path: string, value: string) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value, "utf8");
}

function addRecord(out: Map<string, AllowlistRecord[]>, key: string, record: AllowlistRecord) {
  const records = out.get(key) ?? [];
  records.push(record);
  out.set(key, records);
}

async function build() {
  const manifestPath = findSourceFile("manifest.json");
  const mediaCatalogPath = findSourceFile("media-catalog.json");
  const sourceFiles = [rel(manifestPath), rel(mediaCatalogPath)];
  const manifest = await readJson<Manifest>(manifestPath);
  const mediaCatalog = await readJson<MediaCatalog>(mediaCatalogPath);
  const sources = mediaCatalog.sources ?? {};

  const typedCandidates = [
    ...(manifest.packs ?? []).map(candidateFromManifestPack),
    ...(mediaCatalog.artPacks ?? []).map(candidateFromArtPack),
    ...(mediaCatalog.soundCollections ?? []).map(candidateFromSoundCollection),
    ...(mediaCatalog.musicTracks ?? []).map(candidateFromMusicTrack),
  ].sort(candidateSort);
  const sourceMappingCandidates = (mediaCatalog.sourceMappings ?? [])
    .map((mapping) => candidateFromSourceMapping(mapping, sources))
    .sort(candidateSort);

  const audit: AuditEntry[] = [];
  const includedRecords = new Map<string, AllowlistRecord[]>();
  const coveredPaths = new Set<string>();

  for (const candidate of typedCandidates) {
    const verdict = licenseVerdict(candidate);
    const category = inferCategory(candidate.path, candidate.type);
    const record = allowlistRecord(candidate, verdict);
    audit.push(makeAuditEntry(candidate, verdict, verdict.include ? category : null));
    maybeAddCoveredPath(candidate, verdict, coveredPaths);
    if (!record) continue;
    addRecord(includedRecords, candidate.type, record);
  }

  for (const candidate of sourceMappingCandidates) {
    const category = inferCategory(candidate.path, candidate.type);
    const initialVerdict = licenseVerdict(candidate);
    let verdict = initialVerdict;
    let allowlistCategory: AllowlistCategory | null = initialVerdict.include ? category : null;

    if (initialVerdict.include && !isResolvablePathPattern(candidate.path)) {
      verdict = {
        include: false,
        reason: `License is safe, but path pattern is not resolvable by the bundle builder: ${candidate.path}.`,
      };
      allowlistCategory = null;
    }

    const coveredByTypedEntry = verdict.include && sourceMappingCovered(candidate, coveredPaths);
    const record = !coveredByTypedEntry ? allowlistRecord(candidate, verdict) : undefined;
    audit.push(
      makeAuditEntry(
        candidate,
        coveredByTypedEntry
          ? {
              ...verdict,
              reason: `${verdict.reason} Covered by a typed manifest/media catalog entry.`,
            }
          : verdict,
        allowlistCategory,
      ),
    );

    if (record && allowlistCategory) {
      addRecord(includedRecords, allowlistCategory, record);
      maybeAddCoveredPath(candidate, verdict, coveredPaths);
    }
  }

  audit.sort(auditSort);
  for (const records of includedRecords.values()) {
    records.sort((a, b) => (a.path ?? a.folder ?? a.id ?? a.title).localeCompare(b.path ?? b.folder ?? b.id ?? b.title));
  }

  const allowlist = makeAllowlist(sourceFiles, audit, includedRecords);
  const auditJson = {
    schema: "gamedev.supporter-bundle.audit.v1",
    sourceFiles,
    policy: POLICY,
    summary: allowlist.stats,
    assets: audit,
  };

  await writeJson(ALLOWLIST_PATH, allowlist);
  await writeJson(AUDIT_JSON_PATH, auditJson);
  await writeText(AUDIT_MD_PATH, makeAuditMarkdown(sourceFiles, audit));

  console.log(`Wrote ${rel(ALLOWLIST_PATH)}`);
  console.log(`Wrote ${rel(AUDIT_JSON_PATH)}`);
  console.log(`Wrote ${rel(AUDIT_MD_PATH)}`);
  console.log(`Included ${allowlist.stats.included}; excluded ${allowlist.stats.excluded}.`);
}

build().catch((error: unknown) => {
  if (error instanceof Error) die(error.message);
  die(String(error));
});
