const EXTENSION_TOKENS = /\s+(?:Mp3|Ogg|Wav|Flac|Aif|Aiff|M4a)$/i;
const LEADING_NUMERIC_ID = /^\d{3,}\s+/;
const TRAILING_NUMERIC_ID = /\s+\d{4,}$/;
const DELETED_USER = /\bDeleted User \d+\b/gi;

/**
 * Cleans display labels for audio (sound effects + music) catalog rows.
 * Strips Freesound IDs, "Deleted User <id>", trailing file-extension tokens
 * baked into labels by the catalog title-caser, and trailing Pixabay/Freesound
 * suffix IDs. Pure display normalization — does not affect search text.
 */
export function cleanAudioLabel(raw: string | undefined | null): string {
  if (!raw) return raw ?? "";
  let value = raw;
  value = value.replace(DELETED_USER, "Anonymous");
  value = value.replace(LEADING_NUMERIC_ID, "");
  value = value.replace(EXTENSION_TOKENS, "");
  value = value.replace(TRAILING_NUMERIC_ID, "");
  value = value.replace(/\s{2,}/g, " ").trim();
  return value || raw;
}
