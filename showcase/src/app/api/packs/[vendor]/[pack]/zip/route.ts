import { Zip, ZipPassThrough } from "fflate";
import { assetUrl, findPack } from "@/lib/manifest";
import { packZipEntryName, packZipFilename } from "@/lib/pack-zip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
          // Source of truth for asset bytes is the asset HTTP origin
          // (dev: scripts/serve-assets.mjs on :9101, prod: R2 custom
          // domain). The Next server fetches → re-streams as a zip
          // entry. Higher latency than a local file read, but it works
          // identically in both environments and the showcase server
          // never needs the ~50 GB of assets co-located.
          for (const m of p.models) {
            const src = assetUrl(m.file);
            const res = await fetch(src);
            if (!res.ok) {
              console.warn(`[zip] skipping ${src}: ${res.status}`);
              continue;
            }
            const buf = new Uint8Array(await res.arrayBuffer());
            const entry = new ZipPassThrough(packZipEntryName(m.file, vendor, pack));
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
      "Content-Disposition": `attachment; filename="${packZipFilename(p)}"`,
      "Cache-Control": "no-store",
    },
  });
}
