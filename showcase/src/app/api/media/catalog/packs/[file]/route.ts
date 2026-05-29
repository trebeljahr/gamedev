import { findArtPack } from "@/lib/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ file: string }>;
};

function folderFromFile(file: string): string {
  const decoded = decodeURIComponent(file);
  return decoded.replace(/\.json$/i, "").replace(/__/g, "/");
}

export async function GET(_req: Request, ctx: RouteContext) {
  const { file } = await ctx.params;
  const pack = findArtPack(folderFromFile(file));
  if (!pack) return new Response("art pack not found", { status: 404 });
  return Response.json(pack, {
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
