import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { NextResponse } from "next/server";
import { Readable } from "node:stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ASSETS_ROOT = resolve(
  process.env.ASSETS_DIR ?? join(process.cwd(), "..", "assets"),
);

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404 });
  }
  const url = new URL(req.url);
  const rel = url.searchParams.get("path") ?? "";
  if (!rel) return new NextResponse("missing path", { status: 400 });

  const normalized = normalize(rel).replace(/^[/\\]+/, "");
  const abs = resolve(ASSETS_ROOT, normalized);
  if (!abs.startsWith(ASSETS_ROOT + sep) && abs !== ASSETS_ROOT) {
    return new NextResponse("forbidden", { status: 403 });
  }

  let st: Awaited<ReturnType<typeof stat>>;
  try {
    st = await stat(abs);
  } catch {
    return new NextResponse("not found", { status: 404 });
  }
  if (!st.isFile()) return new NextResponse("not a file", { status: 404 });

  const ext = extname(abs).toLowerCase();
  const mime = MIME[ext] ?? "application/octet-stream";
  const nodeStream = createReadStream(abs);
  const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream<Uint8Array>;
  return new NextResponse(webStream, {
    status: 200,
    headers: {
      "content-type": mime,
      "content-length": String(st.size),
      "cache-control": "no-store",
    },
  });
}
