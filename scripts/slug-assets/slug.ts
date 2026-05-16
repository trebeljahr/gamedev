// Shared slug helpers for the asset-rename pipeline.
//
// "URL-safe slug" here means: lowercase, [a-z0-9.-] only, no `%XX` escapes
// when used as a URL path segment. We allow `.` so file extensions survive,
// and `-` as the only separator (underscores get normalized to `-` so we
// don't ship a mix of conventions).

const KNOWN_COMPOUND_EXTS = [".gltf.glb", ".tar.gz"] as const;

export function slugifyStem(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function splitExt(name: string): { stem: string; ext: string } {
  const lower = name.toLowerCase();
  for (const ext of KNOWN_COMPOUND_EXTS) {
    if (lower.endsWith(ext) && name.length > ext.length) {
      return { stem: name.slice(0, -ext.length), ext };
    }
  }
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return { stem: name, ext: "" };
  return { stem: name.slice(0, dot), ext: name.slice(dot).toLowerCase() };
}

export function slugifyFilename(name: string): string {
  const { stem, ext } = splitExt(name);
  const slugStem = slugifyStem(stem) || "file";
  return slugStem + ext;
}

export function slugifyDirname(name: string): string {
  return slugifyStem(name) || "dir";
}

// True if the current name is already URL-safe (no escaping needed) AND
// matches our slug convention (lowercase, no underscores).
export function isAlreadySlug(name: string, kind: "dir" | "file"): boolean {
  const target = kind === "dir" ? slugifyDirname(name) : slugifyFilename(name);
  return target === name;
}
