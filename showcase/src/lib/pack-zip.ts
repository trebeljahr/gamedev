import { assetUrl, type Pack } from "@/lib/manifest";

export type PackZipFile = {
  url: string;
  entryName: string;
};

export type PackZipProgress = {
  completed: number;
  total: number;
  current?: string;
  bytes: number;
  skipped: number;
};

export type PackZipWorkerRequest = {
  type: "start";
  filename: string;
  files: PackZipFile[];
};

export type PackZipWorkerMessage =
  | ({ type: "progress" } & PackZipProgress)
  | { type: "chunk"; chunk: Uint8Array }
  | { type: "done"; filename: string; bytes: number; skipped: string[] }
  | { type: "error"; message: string };

function decodePathSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function filenamePart(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "pack";
}

export function packZipFilename(pack: Pick<Pack, "vendor" | "pack">): string {
  return `${filenamePart(pack.vendor)}_${filenamePart(pack.pack)}.zip`;
}

export function packZipApiHref(pack: Pick<Pack, "vendor" | "pack">): string {
  return `/api/packs/${encodeURIComponent(pack.vendor)}/${encodeURIComponent(pack.pack)}/zip`;
}

export function packZipEntryName(file: string, vendor: string, pack: string): string {
  const match = file.match(/^\/(?:glb|raw)\/(.+)$/);
  const decoded = (match ? match[1] : file.replace(/^\/+/, ""))
    .split("/")
    .map(decodePathSegment)
    .join("/");
  const prefix = `${vendor}/${pack}/`;
  const relative = decoded.startsWith(prefix) ? decoded.slice(prefix.length) : decoded;
  return `${pack}/${relative.replace(/^\/+/, "")}`;
}

export function packZipFiles(pack: Pack): PackZipFile[] {
  return pack.models.map((model) => ({
    url: assetUrl(model.file),
    entryName: packZipEntryName(model.file, pack.vendor, pack.pack),
  }));
}
