import { findPack } from "@/lib/manifest";
import { downloadCatalog } from "@/lib/download-catalog";
import { redirectDownload } from "@/lib/durable-download";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ vendor: string; pack: string }> },
) {
  const { vendor, pack } = await params;
  if (!findPack(vendor, pack)) return new Response("pack not found", { status: 404 });
  return redirectDownload(
    request,
    downloadCatalog.packs[`${vendor}/${pack}`],
    process.env.NEXT_PUBLIC_ASSETS_BASE_URL ?? "",
  );
}
