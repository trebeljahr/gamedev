import { findArtPack, withResolvedSampleUrls } from "@/lib/media";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ folder: string }>;
};

export async function GET(_req: Request, ctx: RouteContext) {
  const { folder } = await ctx.params;
  const pack = findArtPack(folder);
  if (!pack) return new Response("art pack not found", { status: 404 });
  return Response.json(withResolvedSampleUrls(pack));
}
