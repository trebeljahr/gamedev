import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPORT_PATH = join(process.cwd(), ".cache", "frame-group-classifications.json");

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404 });
  }
  try {
    const raw = await readFile(REPORT_PATH, "utf8");
    return new NextResponse(raw, {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Report not found. Run: cd showcase && ASSETS_DIR=../assets pnpm exec tsx scripts/analyze-frame-groups.ts",
        detail: (err as Error).message,
      },
      { status: 404 },
    );
  }
}
