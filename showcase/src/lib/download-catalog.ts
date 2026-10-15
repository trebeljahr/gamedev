import { readFileSync } from "node:fs";
import { join } from "node:path";
import { artifactUrl, type DownloadArtifact, type DownloadCatalog } from "./durable-download";

// Generated and verified before publication. No asset bytes or storage credential
// are loaded by the application; the public objects outlive every deployment.
export const downloadCatalog = JSON.parse(
  readFileSync(join(process.cwd(), "public", "downloads.json"), "utf8"),
) as DownloadCatalog;

if (downloadCatalog.schema !== 1) throw new Error("Unsupported download catalog.");

const SITE_ORIGIN = "https://gamedev.trebeljahr.com";

function assetBase(): string {
  return process.env.NEXT_PUBLIC_ASSETS_BASE_URL ?? "";
}

/** The artifact a model download link names: the one with the UI filename, else the only one. */
export function modelArtifact(file: string, filename?: string): DownloadArtifact | undefined {
  const artifacts = downloadCatalog.models[file];
  return artifacts?.find((item) => item.filename === filename) ?? artifacts?.[0];
}

/** Direct storage URL of a model download. Throws when the catalog has no valid object. */
export function modelDownloadUrl(file: string, filename?: string): string {
  return artifactUrl(modelArtifact(file, filename), assetBase(), SITE_ORIGIN);
}

/** Direct storage URL of a pack ZIP. Throws when the catalog has no valid object. */
export function packZipUrl(vendor: string, pack: string): string {
  return artifactUrl(downloadCatalog.packs[`${vendor}/${pack}`], assetBase(), SITE_ORIGIN);
}
