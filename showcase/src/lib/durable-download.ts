export type DownloadArtifact = {
  path: string;
  sha256: string;
  bytes: number;
  filename: string;
};

export type DownloadCatalog = {
  schema: 1;
  manifestSha256: string;
  models: Record<string, DownloadArtifact[]>;
  packs: Record<string, DownloadArtifact>;
};

/**
 * The direct storage URL of an immutable download object. The site links
 * here (and its `_redirects` point pack ZIP URLs here); transfer lifetime
 * belongs to storage. Throws on metadata or storage origins that could hand
 * out anything other than the content-addressed object.
 */
export function artifactUrl(artifact: DownloadArtifact | undefined, assetBase: string, siteOrigin?: string): string {
  if (!artifact) throw new Error("Download is not published.");
  if (
    !/^[a-f0-9]{64}$/.test(artifact.sha256) ||
    artifact.path !== `/downloads/v1/${artifact.sha256}/${encodeURIComponent(artifact.filename)}` ||
    !/^[a-z0-9._-]+$/i.test(artifact.filename) || [".", ".."].includes(artifact.filename) ||
    !Number.isSafeInteger(artifact.bytes) || artifact.bytes <= 0
  ) throw new Error(`Download metadata is invalid for ${artifact.path}.`);

  let origin: URL;
  try { origin = new URL(assetBase); }
  catch { throw new Error("Download storage is not configured."); }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
  if (
    (origin.protocol !== "https:" && !(origin.protocol === "http:" && local)) ||
    origin.username || origin.password || origin.search || origin.hash ||
    (siteOrigin !== undefined && origin.origin === new URL(siteOrigin).origin) ||
    !["", "/"].includes(origin.pathname)
  ) throw new Error("Independent download storage is required.");

  return new URL(artifact.path, origin).href;
}
