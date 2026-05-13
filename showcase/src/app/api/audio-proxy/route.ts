const DEFAULT_ASSET_ORIGIN = "https://assets.gamedev.trebeljahr.com";

function originFrom(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function allowedAudioOrigins(): Set<string> {
  return new Set(
    [
      DEFAULT_ASSET_ORIGIN,
      originFrom(process.env.NEXT_PUBLIC_ASSETS_BASE_URL),
      originFrom(process.env.NEXT_PUBLIC_LANDING_ASSETS_BASE_URL),
    ].filter((origin): origin is string => Boolean(origin)),
  );
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const rawSrc = requestUrl.searchParams.get("src");
  if (!rawSrc) return Response.json({ error: "Missing src" }, { status: 400 });

  let target: URL;
  try {
    target = new URL(rawSrc);
  } catch {
    return Response.json({ error: "Invalid src" }, { status: 400 });
  }

  if (!["http:", "https:"].includes(target.protocol)) {
    return Response.json({ error: "Unsupported protocol" }, { status: 400 });
  }

  if (!allowedAudioOrigins().has(target.origin)) {
    return Response.json({ error: "Audio origin is not allowed" }, { status: 403 });
  }

  const upstream = await fetch(target, { headers: { Accept: "audio/*" } });
  if (!upstream.ok || !upstream.body) {
    return Response.json({ error: "Audio fetch failed" }, { status: upstream.status || 502 });
  }

  const headers = new Headers({
    "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
  });
  const contentLength = upstream.headers.get("content-length");
  if (contentLength) headers.set("Content-Length", contentLength);

  return new Response(upstream.body, { headers });
}
