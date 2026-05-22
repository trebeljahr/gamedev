const CREATOR_SLUG_ALIASES: Record<string, string> = {
  "kay lousberg": "kaykit",
  "kay lousberg kaykit": "kaykit",
  kaykit: "kaykit",
  "kevin macleod": "kevin-macleod",
  "kevin macleod incompetech": "kevin-macleod",
  "poly haven": "poly-haven",
  polyhaven: "poly-haven",
  "poly-haven": "poly-haven",
};

function normalizeCreator(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function creatorSlug(creator: string): string {
  const normalized = normalizeCreator(creator);
  return CREATOR_SLUG_ALIASES[normalized] ?? (normalized.replace(/\s+/g, "-") || "unknown");
}

export function creatorHref(creator: string): string {
  return `/creators/${creatorSlug(creator)}`;
}
