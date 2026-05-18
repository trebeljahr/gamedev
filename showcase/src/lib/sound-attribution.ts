import type { SourceMapping } from "@/lib/media";

export type SoundAttribution = {
  license: string;
  source: string;
  creator?: string;
  creatorUrl?: string;
  sourceUrl?: string;
  fallbackUrl?: string;
  attributionRequired: boolean;
  notes?: string;
};

const FREESOUND_FILE = /(?:^|\/)(\d+)__([^_/]+?)__/;

function patternPrefix(pattern: string): string | null {
  if (pattern.endsWith("/**")) return pattern.slice(0, -3);
  if (!/[*{]/.test(pattern)) return pattern;
  return null;
}

function pathMatchesPrefix(path: string, prefix: string): boolean {
  if (prefix === path) return true;
  const normalized = prefix.endsWith("/") ? prefix : `${prefix}/`;
  return path.startsWith(normalized);
}

function normalizeSourceLabel(value: string | undefined): string {
  const v = (value ?? "").trim();
  if (!v) return "";
  if (/freesound/i.test(v)) return "Freesound";
  if (/kenney/i.test(v)) return "Kenney";
  if (/pixabay/i.test(v)) return "Pixabay";
  return v;
}

function requiresAttribution(license: string, source: string): boolean {
  const combined = `${license} ${source}`.toLowerCase();
  if (/cc0|public domain|creative commons zero/.test(combined)) return false;
  if (/kenney/.test(combined)) return false;
  if (/cc[- ]?by/.test(combined)) return true;
  return false;
}

export function resolveSoundAttribution(
  sample: { path: string },
  collection: { source: string; license: string; url?: string },
  sourceMappings: SourceMapping[],
): SoundAttribution {
  const path = sample.path;

  const best = sourceMappings
    .map((m) => ({ m, prefix: patternPrefix(m.pathPattern) }))
    .filter((entry): entry is { m: SourceMapping; prefix: string } => {
      if (!entry.prefix) return false;
      if (!(entry.m.author || entry.m.url || entry.m.license)) return false;
      return pathMatchesPrefix(path, entry.prefix);
    })
    .sort((a, b) => b.prefix.length - a.prefix.length)[0]?.m;

  let source = normalizeSourceLabel(best?.source ?? collection.source);
  let creator = best?.author ?? undefined;
  let creatorUrl: string | undefined;
  let sourceUrl: string | undefined = best?.url ?? undefined;
  const license = best?.license ?? collection.license;
  const notes = best?.notes ?? undefined;

  if (source === "Freesound" && creator) {
    creatorUrl = `https://freesound.org/people/${creator}/`;
  }

  const fs = path.match(FREESOUND_FILE);
  if (fs) {
    const [, id, username] = fs;
    source = "Freesound";
    creator = creator ?? username;
    creatorUrl = creatorUrl ?? `https://freesound.org/people/${username}/`;
    sourceUrl = `https://freesound.org/people/${username}/sounds/${id}/`;
  }

  if (source === "Kenney") {
    creator = creator ?? "Kenney";
    creatorUrl = creatorUrl ?? "https://kenney.nl/";
  }

  return {
    license: license || "Unknown",
    source: source || collection.source,
    creator,
    creatorUrl,
    sourceUrl,
    fallbackUrl: collection.url,
    attributionRequired: requiresAttribution(license, source),
    notes,
  };
}
