export type ArtKind = "character" | "sprite" | "icon" | "tile" | "effect" | "ui" | "image";

const ACTION_WORDS =
  "idle|walk|run|jump|fall|attack|attacks|hurt|hit|death|die|move|dash|roll|slide|crouch|sleep|sleeping|damaged|charge|teleport";

function parts(path: string): string[] {
  return path.split(/[\\/]+/).filter(Boolean);
}

function basename(path: string): string {
  return parts(path).pop() ?? path;
}

function basenameWithoutExtension(path: string): string {
  return basename(path).replace(/\.[^.]+$/i, "");
}

function tokenText(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([a-z])(\d)/gi, "$1 $2")
    .replace(/(\d)([a-z])/gi, "$1 $2")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function hasToken(text: string, pattern: string): boolean {
  return new RegExp(`(^|\\s)(${pattern})(\\s|$)`, "i").test(tokenText(text));
}

export function isLikelySeparateFramePath(path: string): boolean {
  if (/\.(gif)$/i.test(path)) return false;
  if (/(^|[\\/])(spritesheets?|sheets?|strips?)([\\/]|$)/i.test(path)) return false;
  if (hasToken(path, "spritesheet|sprite sheet|sheet|strip|atlas|allanim|all anim")) return false;

  const name = tokenText(basenameWithoutExtension(path));
  const frameSuffix = /(^|\s)(?:frame\s*)?\d{1,4}$/.test(name);
  const compactFrameSuffix = /[a-z]\d{1,4}$/i.test(basenameWithoutExtension(path));
  const frameFolder = /(^|[\\/])(sprites?|frames?|pngs?|individual|separate)([\\/]|$)/i.test(path);
  const actionHint = hasToken(name, ACTION_WORDS) || hasToken(path, ACTION_WORDS);
  const words = name.split(/\s+/).filter(Boolean);
  const onlyActionAndNumber = words.length <= 2 && hasToken(words[0] ?? "", ACTION_WORDS) && /^\d{1,4}$/.test(words.at(-1) ?? "");

  return (frameSuffix && (frameFolder || (actionHint && !onlyActionAndNumber))) || (compactFrameSuffix && frameFolder);
}

export function isLikelySpriteSheetPath(path: string): boolean {
  if (/\.(gif)$/i.test(path)) return true;
  if (isLikelySeparateFramePath(path)) return false;
  if (/(^|[\\/])(spritesheets?|sheets?|strips?)([\\/]|$)/i.test(path)) return true;
  if (hasToken(path, "spritesheet|sprite sheet|sheet|strip|atlas|allanim|all anim|animation")) return true;

  const name = basenameWithoutExtension(path);
  if (/\b\d{2,4}x\d{2,4}\b/i.test(name) && hasToken(name, ACTION_WORDS)) return true;
  if (hasToken(name, ACTION_WORDS) && !/(cover|preview|base|portrait|icon|button|ui|hud)/i.test(name)) return true;

  return false;
}

export function inferArtKind(path: string): ArtKind {
  const name = basenameWithoutExtension(path).toLowerCase();
  if (hasToken(path, "icon|icons|item|items|inventory|weapon|weapons|coin|coins|chest|pickup|potion|gem|gems")) return "icon";
  if (hasToken(path, "tile|tiles|tileset|terrain|forest|dungeon|platform|ground|wall|walls|props")) return "tile";
  if (hasToken(path, "effect|effects|fx|fire|smoke|slash|impact|bullet|explosion|spell|magic")) return "effect";
  if (hasToken(path, "button|buttons|ui|hud|panel|cursor|menu|fullscreen|memoryprofiler") || /progress\s*bar/i.test(path)) return "ui";
  if (hasToken(path, "character|characters|hero|knight|warrior|mage|witch|dino|frog|cat|skeleton|monster|enemy|creature|samurai|archer|bandit|huntress|wizard|npc|villager|ronin|ship|fighter|bomber")) {
    return "character";
  }
  if (isLikelySpriteSheetPath(path) || /\bspr(ite)?\b/i.test(name)) return "sprite";
  return "image";
}

export function isAnimatedArtPath(path: string): boolean {
  return isLikelySpriteSheetPath(path);
}

export function artDesignKey(path: string): string {
  const pathParts = parts(path);
  const parent = pathParts.slice(-3, -1).map(tokenText).join(" ");
  let name = tokenText(basenameWithoutExtension(path));

  name = name
    .replace(new RegExp(`(^|\\s)(${ACTION_WORDS})\\s*\\d*($|\\s)`, "gi"), " ")
    .replace(/(^|\s)(?:frame\s*)?\d{1,4}$/i, " ")
    .replace(/\b(sprite\s*sheet|spritesheet|sheet|strip|atlas|allanim|all anim|animation|preview|final|base|shadow)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (name.length < 3 || /^(png|free|asset|sprite|character)$/.test(name)) {
    return `${parent} ${tokenText(basenameWithoutExtension(path))}`.replace(/\s+/g, " ").trim();
  }

  return `${parent} ${name}`.replace(/\s+/g, " ").trim();
}

export function scoreArtSample(path: string): number {
  const lower = path.toLowerCase();
  let score = 0;
  if (/\.(png|webp|gif)$/i.test(path)) score += 8;
  if (isLikelySpriteSheetPath(path)) score += 18;
  if (/(preview|sample|demo)/.test(lower)) score += 10;
  if (hasToken(path, ACTION_WORDS)) score += 4;
  if (/(character|hero|knight|warrior|monster|enemy|icon|item|effect|fx|npc|ship)/.test(lower)) score += 8;
  if (isLikelySeparateFramePath(path)) score -= 10;
  if (/(license|readme|credit|cover|banner|thumbnail|__macosx|[\\/]\._)/.test(lower)) score -= 40;
  return score;
}

export function selectRepresentativeArtSamples(paths: string[], limit: number): string[] {
  const sorted = [...paths].sort((a, b) => scoreArtSample(b) - scoreArtSample(a) || a.localeCompare(b));
  const selected: string[] = [];
  const seenDesigns = new Set<string>();

  for (const path of sorted) {
    const key = artDesignKey(path);
    if (seenDesigns.has(key)) continue;
    seenDesigns.add(key);
    selected.push(path);
    if (selected.length >= limit) return selected;
  }

  for (const path of sorted) {
    if (!selected.includes(path)) selected.push(path);
    if (selected.length >= limit) return selected;
  }

  return selected;
}
