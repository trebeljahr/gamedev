import { downloadsForModel, manifest } from "@/lib/manifest";
import { downloadCatalog } from "@/lib/download-catalog";
import { redirectDownload } from "@/lib/durable-download";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const file = url.searchParams.get("file") ?? "";
  if (!file.startsWith("/glb/") && !file.startsWith("/raw/")) {
    return new Response("unsupported asset path", { status: 400 });
  }
  const allowed = manifest.packs.some((pack) =>
    pack.models.some((model) => model.file === file || downloadsForModel(model).some((d) => d.file === file)),
  );
  if (!allowed) return new Response("asset download not available", { status: 404 });
  const artifacts = downloadCatalog.models[file];
  const artifact = artifacts?.find((item) => item.filename === url.searchParams.get("name")) ?? artifacts?.[0];
  return redirectDownload(req, artifact, process.env.NEXT_PUBLIC_ASSETS_BASE_URL ?? "");
}
