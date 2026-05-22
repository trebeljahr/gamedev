import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Manifest = {
  packs: Array<{
    id: string;
    vendor: string;
    source: string;
    title: string;
    license: string;
    models: Array<{
      name: string;
      title: string;
      file: string;
      downloads?: Array<{
        format?: string;
        file: string;
        optimized?: boolean;
      }>;
    }>;
  }>;
};

type MediaCatalog = {
  artPacks: Array<{
    folder: string;
    title: string;
    author: string;
    author_url?: string;
    url?: string;
    license_class: string;
  }>;
  soundCollections: Array<{
    id: string;
    title: string;
    source: string;
    url?: string;
    samples: Array<{
      path: string;
      src: string;
      label: string;
    }>;
  }>;
  musicTracks: Array<{
    title: string;
    source: string;
    path: string;
    src: string;
    url?: string;
  }>;
  sourceMappings: Array<{
    id: string;
    pathPattern: string;
    title: string;
    medium: string;
    source: string;
    url?: string;
    likelyCreator?: string;
  }>;
  sources: Record<string, {
    name?: string;
    url?: string | null;
    license?: string;
  } | undefined>;
};

type MediaAssets = {
  artSamples: Array<CatalogAsset>;
  soundSamples: Array<CatalogAsset>;
  musicTracks: Array<CatalogAsset>;
};

type CatalogAsset = {
    packFolder: string;
    path: string;
    src: string;
    label: string;
};

type LinkKind = "r2" | "source";

type LinkReference = {
  id: string;
  label: string;
  sourceFile: string;
};

type LinkCheck = {
  kind: LinkKind;
  url: string;
  references: LinkReference[];
};

type LinkResult = LinkCheck & {
  ok: boolean;
  status?: number;
  statusText?: string;
  location?: string | null;
  error?: string;
  durationMs: number;
};

type CliOptions = {
  reportPath: string;
  maxR2?: number;
  maxSource?: number;
  failOnStale: boolean;
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const showcaseDir = join(repoRoot, "showcase");

const DEFAULT_ASSET_BASE_URL = "https://assets.gamedev.trebeljahr.com";
const ASSET_BASE_URL = trimTrailingSlash(
  process.env.STALE_LINKS_ASSET_BASE_URL ||
    process.env.NEXT_PUBLIC_ASSETS_BASE_URL ||
    DEFAULT_ASSET_BASE_URL,
);
const REQUEST_TIMEOUT_MS = intEnv("STALE_LINKS_TIMEOUT_MS", 5000);
const R2_CONCURRENCY = intEnv("STALE_LINKS_R2_CONCURRENCY", 6);
const SOURCE_CONCURRENCY = intEnv("STALE_LINKS_SOURCE_CONCURRENCY", 2);
const REPORT_MAX_ROWS = intEnv("STALE_LINKS_REPORT_MAX_ROWS", 200);
const R2_OK_STATUSES = new Set([200]);
const SOURCE_OK_STATUSES = new Set([200, 301, 302]);

const SOURCE_ALIASES: Record<string, string> = {
  kaykit: "kay-lousberg",
  "kay-kit": "kay-lousberg",
  "kay lousberg": "kay-lousberg",
  "kenney.nl": "kenney",
  "freesound.org": "freesound",
  "poly haven": "poly-haven",
  polyhaven: "poly-haven",
};

const MODEL_VENDOR_URLS: Record<string, string> = {
  kaykit: "https://kaylousberg.com/",
  kenney: "https://kenney.nl/",
  quaternius: "https://quaternius.com/",
};

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseArgs(argv: string[]): CliOptions {
  let reportPath = process.env.STALE_LINKS_REPORT_PATH || "stale-links-report.md";
  let maxR2: number | undefined;
  let maxSource: number | undefined;
  let failOnStale = process.env.STALE_LINKS_FAIL_ON_STALE === "1";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--") {
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    if (arg === "--report" && next) {
      reportPath = next;
      index += 1;
      continue;
    }
    if (arg === "--max-r2" && next) {
      maxR2 = positiveIntArg(arg, next);
      index += 1;
      continue;
    }
    if (arg === "--max-source" && next) {
      maxSource = positiveIntArg(arg, next);
      index += 1;
      continue;
    }
    if (arg === "--fail-on-stale") {
      failOnStale = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { reportPath, maxR2, maxSource, failOnStale };
}

function positiveIntArg(flag: string, value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${flag} requires a positive integer`);
  }
  return parsed;
}

function printHelp(): void {
  console.log(`Usage: pnpm links:check [-- --report path] [-- --fail-on-stale]

Checks committed catalog asset URLs with HEAD requests and writes a markdown report.

Options:
  --report <path>      Markdown report path. Defaults to stale-links-report.md.
  --max-r2 <count>     Check only first N R2 URLs. For smoke tests only.
  --max-source <count> Check only first N source URLs. For smoke tests only.
  --fail-on-stale      Exit non-zero when any checked URL fails.
`);
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

function modelFormatForFile(file: string): string {
  const clean = file.split(/[?#]/, 1)[0].toLowerCase();
  if (clean.endsWith(".gltf")) return "gltf";
  const ext = clean.match(/\.([a-z0-9]+)$/)?.[1];
  return ext || "file";
}

function downloadsForModel(model: Manifest["packs"][number]["models"][number]) {
  const rawDownloads =
    model.downloads && model.downloads.length > 0
      ? model.downloads
      : [
          {
            format: modelFormatForFile(model.file),
            file: model.file,
            optimized: model.file.startsWith("/glb/"),
          },
        ];
  const seen = new Set<string>();
  const downloads: Array<{ format: string; file: string; optimized?: boolean }> = [];

  for (const download of rawDownloads) {
    if (!download.file || seen.has(download.file)) continue;
    seen.add(download.file);
    downloads.push({
      ...download,
      format: (download.format || modelFormatForFile(download.file)).toLowerCase(),
      optimized: download.optimized ?? download.file.startsWith("/glb/"),
    });
  }

  return downloads.sort((a, b) => {
    if (a.optimized !== b.optimized) return a.optimized ? -1 : 1;
    return a.format.localeCompare(b.format);
  });
}

function normalizeSourceKey(value: string | null | undefined): string {
  const key = (value ?? "").trim().toLowerCase().replace(/[\s_]+/g, "-");
  return SOURCE_ALIASES[key] ?? key;
}

function sourceInfoFor(mediaCatalog: MediaCatalog, source: string | null | undefined) {
  const normalized = normalizeSourceKey(source);
  return mediaCatalog.sources[normalized] ?? mediaCatalog.sources[SOURCE_ALIASES[normalized]] ?? {};
}

function normalizeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function r2UrlForAsset(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;

  if (/^https?:\/\//i.test(raw)) {
    const parsed = normalizeHttpUrl(raw);
    if (!parsed) return null;
    const url = new URL(parsed);
    if (url.hostname === new URL(ASSET_BASE_URL).hostname) return url.toString();
    if (url.hostname === "gamedev.trebeljahr.com" && isAssetPath(url.pathname)) {
      return new URL(`${url.pathname}${url.search}`, `${ASSET_BASE_URL}/`).toString();
    }
    return null;
  }

  if (raw.startsWith("/api/")) return null;
  return new URL(raw.startsWith("/") ? raw : `/${raw}`, `${ASSET_BASE_URL}/`).toString();
}

function isAssetPath(pathname: string): boolean {
  return (
    pathname.startsWith("/glb/") ||
    pathname.startsWith("/raw/") ||
    pathname.startsWith("/2D/") ||
    pathname.startsWith("/sounds/") ||
    pathname.startsWith("/textures/")
  );
}

function addCheck(map: Map<string, LinkCheck>, kind: LinkKind, url: string, reference: LinkReference): void {
  const existing = map.get(url);
  if (existing) {
    existing.references.push(reference);
    return;
  }
  map.set(url, { kind, url, references: [reference] });
}

function addR2Check(map: Map<string, LinkCheck>, assetPath: string, reference: LinkReference): void {
  const url = r2UrlForAsset(assetPath);
  if (!url) return;
  addCheck(map, "r2", url, reference);
}

function addSourceCheck(map: Map<string, LinkCheck>, sourceUrl: string | null | undefined, reference: LinkReference): void {
  if (!sourceUrl) return;
  const url = normalizeHttpUrl(sourceUrl);
  if (!url) {
    addCheck(map, "source", `invalid:${sourceUrl}`, reference);
    return;
  }
  addCheck(map, "source", url, reference);
}

function buildChecks(manifest: Manifest, mediaCatalog: MediaCatalog, mediaAssets: MediaAssets) {
  const r2Checks = new Map<string, LinkCheck>();
  const sourceChecks = new Map<string, LinkCheck>();

  for (const pack of manifest.packs) {
    const sourceUrl = MODEL_VENDOR_URLS[pack.vendor] ?? null;
    for (const model of pack.models) {
      const modelId = `model:${pack.id}/${model.name}`;
      addSourceCheck(sourceChecks, sourceUrl, {
        id: modelId,
        label: `${model.title} (${pack.source})`,
        sourceFile: "showcase/public/manifest.json",
      });

      for (const download of downloadsForModel(model)) {
        addR2Check(r2Checks, download.file, {
          id: `${modelId}:${download.format}`,
          label: `${model.title} ${download.format}`,
          sourceFile: "showcase/public/manifest.json",
        });
      }
    }
  }

  for (const sample of mediaAssets.artSamples) {
    addR2Check(r2Checks, sample.src || sample.path, {
      id: `sprite-sample:${sample.path}`,
      label: `${sample.label} (${sample.packFolder})`,
      sourceFile: "showcase/src/lib/media-assets.json",
    });
  }

  for (const sample of mediaAssets.soundSamples) {
    addR2Check(r2Checks, sample.src || sample.path, {
      id: `sound-asset:${sample.path}`,
      label: `${sample.label} (${sample.packFolder})`,
      sourceFile: "showcase/src/lib/media-assets.json",
    });
  }

  for (const track of mediaAssets.musicTracks) {
    addR2Check(r2Checks, track.src || track.path, {
      id: `music-asset:${track.path}`,
      label: `${track.label} (${track.packFolder})`,
      sourceFile: "showcase/src/lib/media-assets.json",
    });
  }

  for (const pack of mediaCatalog.artPacks) {
    addSourceCheck(sourceChecks, pack.url, {
      id: `sprite:${pack.folder}`,
      label: `${pack.title} (${pack.author})`,
      sourceFile: "showcase/public/media-catalog.json",
    });
    addSourceCheck(sourceChecks, pack.author_url, {
      id: `sprite-author:${pack.folder}`,
      label: `${pack.author} (${pack.title})`,
      sourceFile: "showcase/public/media-catalog.json",
    });
  }

  for (const collection of mediaCatalog.soundCollections) {
    const sourceInfo = sourceInfoFor(mediaCatalog, collection.source);
    const sourceUrl = collection.url ?? sourceInfo.url ?? null;
    addSourceCheck(sourceChecks, sourceUrl, {
      id: `sound:${collection.id}`,
      label: collection.title,
      sourceFile: "showcase/public/media-catalog.json",
    });

    for (const sample of collection.samples) {
      addR2Check(r2Checks, sample.src || sample.path, {
        id: `sound-sample:${collection.id}/${sample.path}`,
        label: `${sample.label} (${collection.title})`,
        sourceFile: "showcase/public/media-catalog.json",
      });
    }
  }

  for (const track of mediaCatalog.musicTracks) {
    const sourceInfo = sourceInfoFor(mediaCatalog, track.source);
    const sourceUrl = track.url ?? sourceInfo.url ?? null;
    addSourceCheck(sourceChecks, sourceUrl, {
      id: `music:${track.path}`,
      label: track.title,
      sourceFile: "showcase/public/media-catalog.json",
    });
    addR2Check(r2Checks, track.src || track.path, {
      id: `music:${track.path}`,
      label: track.title,
      sourceFile: "showcase/public/media-catalog.json",
    });
  }

  for (const mapping of mediaCatalog.sourceMappings) {
    if (mapping.medium !== "texture") continue;
    const sourceInfo = sourceInfoFor(mediaCatalog, mapping.source);
    const sourceUrl = mapping.url ?? sourceInfo.url ?? null;
    addSourceCheck(sourceChecks, sourceUrl, {
      id: `texture:${mapping.id}`,
      label: mapping.title,
      sourceFile: "showcase/public/media-catalog.json",
    });
  }

  return {
    r2Checks: [...r2Checks.values()].sort((a, b) => a.url.localeCompare(b.url)),
    sourceChecks: [...sourceChecks.values()].sort((a, b) => a.url.localeCompare(b.url)),
  };
}

async function checkUrl(check: LinkCheck): Promise<LinkResult> {
  const started = Date.now();

  if (check.url.startsWith("invalid:")) {
    return {
      ...check,
      ok: false,
      error: "Invalid http(s) URL",
      durationMs: 0,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const acceptedStatuses = check.kind === "r2" ? R2_OK_STATUSES : SOURCE_OK_STATUSES;

  try {
    const response = await fetch(check.url, {
      method: "HEAD",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        Accept: "*/*",
        "User-Agent": "gamedev-stale-links-checker/1.0",
      },
    });

    return {
      ...check,
      ok: acceptedStatuses.has(response.status),
      status: response.status,
      statusText: response.statusText,
      location: response.headers.get("location"),
      durationMs: Date.now() - started,
    };
  } catch (error) {
    const message = error instanceof Error
      ? error.name === "AbortError"
        ? `Timed out after ${REQUEST_TIMEOUT_MS}ms`
        : error.message
      : String(error);

    return {
      ...check,
      ok: false,
      error: message,
      durationMs: Date.now() - started,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function runLimited(checks: LinkCheck[], concurrency: number, label: string): Promise<LinkResult[]> {
  if (checks.length === 0) return [];
  const results = new Array<LinkResult>(checks.length);
  let index = 0;
  let done = 0;
  let nextProgress = Math.min(500, checks.length);
  const workerCount = Math.min(Math.max(1, concurrency), checks.length);

  async function worker(): Promise<void> {
    for (;;) {
      const current = index;
      index += 1;
      if (current >= checks.length) return;
      results[current] = await checkUrl(checks[current]);
      done += 1;
      if (done >= nextProgress || done === checks.length) {
        console.log(`[${label}] ${done}/${checks.length}`);
        nextProgress += 500;
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function summarize(results: LinkResult[]) {
  const failures = results.filter((result) => !result.ok);
  return {
    total: results.length,
    ok: results.length - failures.length,
    failed: failures.length,
    failures,
  };
}

function escapeMd(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function referenceSummary(references: LinkReference[]): string {
  const shown = references
    .slice(0, 3)
    .map((reference) => `${reference.id} (${reference.sourceFile})`);
  if (references.length > shown.length) shown.push(`+${references.length - shown.length} more`);
  return shown.join("<br>");
}

function statusSummary(result: LinkResult): string {
  if (result.error) return result.error;
  const status = result.status ? `${result.status} ${result.statusText ?? ""}`.trim() : "No status";
  if (result.location) return `${status}; Location: ${result.location}`;
  return status;
}

function renderFailureTable(results: LinkResult[]): string {
  if (results.length === 0) return "None.\n";

  const shown = results.slice(0, REPORT_MAX_ROWS);
  const rows = [
    "| URL | Status | References |",
    "| --- | --- | --- |",
    ...shown.map((result) =>
      `| ${escapeMd(result.url)} | ${escapeMd(statusSummary(result))} | ${escapeMd(referenceSummary(result.references))} |`,
    ),
  ];

  if (results.length > shown.length) {
    rows.push(`\nShowing first ${shown.length} of ${results.length} failures.`);
  }

  return `${rows.join("\n")}\n`;
}

function checkedReferenceCount(checks: LinkCheck[]): number {
  return checks.reduce((total, check) => total + check.references.length, 0);
}

function renderReport(params: {
  r2Checks: LinkCheck[];
  sourceChecks: LinkCheck[];
  r2Results: LinkResult[];
  sourceResults: LinkResult[];
  startedAt: Date;
  finishedAt: Date;
  options: CliOptions;
}): string {
  const r2 = summarize(params.r2Results);
  const source = summarize(params.sourceResults);
  const durationSeconds = Math.round((params.finishedAt.getTime() - params.startedAt.getTime()) / 100) / 10;
  const runUrl =
    process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : null;
  const sampled = params.options.maxR2 || params.options.maxSource;

  return `# Stale link check

Generated: ${params.finishedAt.toISOString()}
Duration: ${durationSeconds}s
Asset base URL: ${ASSET_BASE_URL}
Timeout: ${REQUEST_TIMEOUT_MS}ms
Concurrency: R2 ${R2_CONCURRENCY}, source ${SOURCE_CONCURRENCY}
${runUrl ? `Workflow run: ${runUrl}\n` : ""}${sampled ? "Mode: sampled smoke run. Scheduled workflow checks the full catalog.\n" : ""}
## Summary

| Check | Unique URLs | Catalog refs | OK | Failed | Accepted status |
| --- | ---: | ---: | ---: | ---: | --- |
| R2 assets | ${r2.total} | ${checkedReferenceCount(params.r2Checks)} | ${r2.ok} | ${r2.failed} | 200 |
| Upstream sourceUrl | ${source.total} | ${checkedReferenceCount(params.sourceChecks)} | ${source.ok} | ${source.failed} | 200, 301, 302 |

## R2 asset failures

${renderFailureTable(r2.failures)}

## Upstream sourceUrl failures

${renderFailureTable(source.failures)}
`;
}

async function writeReport(reportPath: string, report: string): Promise<string> {
  const absolutePath = isAbsolute(reportPath) ? reportPath : join(repoRoot, reportPath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, report, "utf8");
  return absolutePath;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const startedAt = new Date();
  const [manifest, mediaCatalog, mediaAssets] = await Promise.all([
    readJson<Manifest>(join(showcaseDir, "public", "manifest.json")),
    readJson<MediaCatalog>(join(showcaseDir, "public", "media-catalog.json")),
    readJson<MediaAssets>(join(showcaseDir, "src", "lib", "media-assets.json")),
  ]);

  const checks = buildChecks(manifest, mediaCatalog, mediaAssets);
  const r2Checks = options.maxR2 ? checks.r2Checks.slice(0, options.maxR2) : checks.r2Checks;
  const sourceChecks = options.maxSource ? checks.sourceChecks.slice(0, options.maxSource) : checks.sourceChecks;

  console.log(`R2 URLs: ${r2Checks.length} unique (${checkedReferenceCount(r2Checks)} refs)`);
  console.log(`sourceUrl URLs: ${sourceChecks.length} unique (${checkedReferenceCount(sourceChecks)} refs)`);

  const r2Results = await runLimited(r2Checks, R2_CONCURRENCY, "r2");
  const sourceResults = await runLimited(sourceChecks, SOURCE_CONCURRENCY, "source");
  const finishedAt = new Date();
  const report = renderReport({
    r2Checks,
    sourceChecks,
    r2Results,
    sourceResults,
    startedAt,
    finishedAt,
    options,
  });
  const absoluteReportPath = await writeReport(options.reportPath, report);
  const failures = r2Results.filter((result) => !result.ok).length + sourceResults.filter((result) => !result.ok).length;

  console.log(`Report written: ${absoluteReportPath}`);
  console.log(`Failures: ${failures}`);

  if (options.failOnStale && failures > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
