import { assetUrl } from "@/lib/manifest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_PREFIXES = ["/glb/", "/raw/"];

function fallbackName(file: string): string {
  const path = file.split(/[?#]/, 1)[0];
  const last = path.split("/").filter(Boolean).pop() ?? "model";
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

function attachmentName(value: string): string {
  return value.replace(/[\\"]/g, "_").replace(/[\r\n]/g, " ").slice(0, 140) || "model";
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const file = url.searchParams.get("file") ?? "";
  const name = url.searchParams.get("name") ?? fallbackName(file);

  if (!ALLOWED_PREFIXES.some((prefix) => file.startsWith(prefix))) {
    return new Response("unsupported asset path", { status: 400 });
  }

  const upstream = assetUrl(file);
  const upstreamUrl = upstream.startsWith("/") ? new URL(upstream, req.url).toString() : upstream;
  let res: Response;
  try {
    res = await fetch(upstreamUrl);
  } catch {
    return new Response("asset fetch failed", { status: 502 });
  }
  if (!res.ok) {
    return new Response(`asset fetch failed: ${res.status}`, {
      status: res.status === 404 ? 404 : 502,
    });
  }

  const headers = new Headers();
  headers.set("Content-Type", res.headers.get("Content-Type") ?? "application/octet-stream");
  headers.set("Content-Disposition", `attachment; filename="${attachmentName(name)}"`);
  headers.set("Cache-Control", "public, max-age=86400");
  const length = res.headers.get("Content-Length");
  if (length) headers.set("Content-Length", length);

  return new Response(res.body, { headers });
}
