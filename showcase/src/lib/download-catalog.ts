import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DownloadCatalog } from "./durable-download";

// Generated and verified before publication. No asset bytes or storage credential
// are loaded by the application; the public objects outlive every app container.
export const downloadCatalog = JSON.parse(
  readFileSync(join(process.cwd(), "public", "downloads.json"), "utf8"),
) as DownloadCatalog;

if (downloadCatalog.schema !== 1) throw new Error("Unsupported download catalog.");
