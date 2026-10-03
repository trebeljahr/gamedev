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

/** The app only hands off an immutable object; transfer lifetime belongs to storage. */
export function redirectDownload(
  request: Request,
  artifact: DownloadArtifact | undefined,
  assetBase: string,
): Response {
  if (!artifact) return new Response("Download is not published.", { status: 503 });
  if (
    !/^[a-f0-9]{64}$/.test(artifact.sha256) ||
    artifact.path !== `/downloads/v1/${artifact.sha256}/${encodeURIComponent(artifact.filename)}` ||
    !/^[a-z0-9._-]+$/i.test(artifact.filename) || [".", ".."].includes(artifact.filename) ||
    !Number.isSafeInteger(artifact.bytes) || artifact.bytes <= 0
  ) return new Response("Download metadata is invalid.", { status: 503 });

  let origin: URL;
  try { origin = new URL(assetBase); }
  catch { return new Response("Download storage is not configured.", { status: 503 }); }
  const source = new URL(request.url);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
  if (
    (origin.protocol !== "https:" && !(origin.protocol === "http:" && local)) ||
    origin.username || origin.password || origin.search || origin.hash ||
    origin.origin === source.origin || !["", "/"].includes(origin.pathname)
  ) return new Response("Independent download storage is required.", { status: 503 });

  return new Response(null, {
    status: 307,
    headers: {
      Location: new URL(artifact.path, origin).href,
      "Cache-Control": "no-store",
      "X-Download-Sha256": artifact.sha256,
    },
  });
}
