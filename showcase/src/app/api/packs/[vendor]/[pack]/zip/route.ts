import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Zip, ZipPassThrough } from "fflate";
import { findPack } from "@/lib/manifest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ASSETS_ROOT = join(process.cwd(), "..");

function urlToDisk(url: string): string | null {
  const m = url.match(/^\/(glb|raw)\/(.+)$/);
  if (!m) return null;
  const root = m[1] === "glb" ? "glb-optimized" : "models";
  const decoded = m[2].split("/").map(decodeURIComponent).join("/");
  return join(ASSETS_ROOT, root, decoded);
}

function entryName(url: string, vendor: string, pack: string): string {
  const m = url.match(/^\/(glb|raw)\/(.+)$/);
  const decoded = (m ? m[2] : url).split("/").map(decodeURIComponent).join("/");
  const prefix = `${vendor}/${pack}/`;
  const rel = decoded.startsWith(prefix) ? decoded.slice(prefix.length) : decoded;
  return `${pack}/${rel}`;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ vendor: string; pack: string }> },
) {
  const { vendor, pack } = await params;
  const p = findPack(vendor, pack);
  if (!p) return new Response("pack not found", { status: 404 });

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const zip = new Zip();
      zip.ondata = (err, data, final) => {
        if (err) {
          controller.error(err);
          return;
        }
        if (data && data.byteLength) controller.enqueue(data);
        if (final) controller.close();
      };
      (async () => {
        try {
          for (const m of p.models) {
            const disk = urlToDisk(m.file);
            if (!disk) continue;
            const buf = await readFile(disk);
            const entry = new ZipPassThrough(entryName(m.file, vendor, pack));
            zip.add(entry);
            entry.push(buf, true);
          }
          zip.end();
        } catch (e) {
          controller.error(e);
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${vendor}_${pack}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
