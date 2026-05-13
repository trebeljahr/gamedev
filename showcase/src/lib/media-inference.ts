export type ArtKind = "character" | "sprite" | "icon" | "tile" | "effect" | "ui" | "image";

const ACTION_WORDS =
  "idle|walk|run|jump|fall|attack|attacks|hurt|hit|death|die|move|dash|roll|slide|crouch|sleep|sleeping|charge|teleport";
const CHARACTER_WORDS =
  "character|characters|hero|heroes|knight|knights|warrior|warriors|mage|mages|witch|witches|dino|dinos|dinosaur|dinosaurs|frog|frogs|cat|cats|dog|dogs|sheep|bat|bats|bird|birds|wolf|wolves|fish|shark|sharks|turtle|turtles|crab|crabs|skeleton|skeletons|monster|monsters|enemy|enemies|creature|creatures|alien|aliens|samurai|archer|archers|bandit|bandits|huntress|wizard|wizards|npc|npcs|villager|villagers|ronin";
const VEHICLE_SPRITE_WORDS =
  "ship|ships|spaceship|spaceships|ufo|ufos|fighter|fighters|bomber|bombers|battlecruiser|battlecruisers|frigate|frigates|dreadnought|dreadnoughts|scout|scouts|torpedo";
const ATLAS_WORDS =
  "atlas|texture|textures|tilesheet|tile sheet|tilemap|tile map|tileset|tiled|terrain|decoration|decorations|objects|props|ground";
const SHEET_WORDS = "spritesheet|sprite sheet|sheet|strip|allanim|all anim|animation|animated";
const STATIC_SHEET_WORDS =
  "ui|hud|button|buttons|panel|panels|cursor|cursors|crosshair|crosshairs|icon|icons|item|items|coin|coins|controls|tile|tiles|tilesheet|tilemap|tileset|terrain|platform|platformer|dungeon|dungeons|cave|caves|industrial|roguelike|landscape|building|buildings|city|road|roads|vehicle|vehicles|car|cars|object|objects|prop|props";

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

export function isLikelyTextureAtlasPath(path: string): boolean {
  const text = tokenText(path);
  const sheetHint = hasToken(text, "spritesheet|sprite sheet|sheet") || /(^|[\\/])spritesheets?([\\/]|$)/i.test(path);
  const staticSheetHint = sheetHint && hasToken(text, STATIC_SHEET_WORDS);
  const atlasHint = staticSheetHint || hasToken(text, ATLAS_WORDS) || /(^|[\\/])(tiled_files|tilesets?|tilemaps?|textures?)([\\/]|$)/i.test(path);
  if (!atlasHint) return false;

  const animationHint = hasToken(text, ACTION_WORDS) || hasToken(text, "animation|animated|allanim|all anim");
  const characterHint = hasToken(text, CHARACTER_WORDS);
  const animatedIconHint = hasToken(text, "coin|coins|chest|chests|pickup|gem|gems|potion|potions");
  if (animationHint && animatedIconHint) return false;
  return !animationHint && !characterHint;
}

export function isLikelyHybridSpriteAtlasPath(path: string): boolean {
  const text = tokenText(path);
  const atlasHint = hasToken(text, ATLAS_WORDS) || /(^|[\\/])(atlases?|textures?|spritesheets?|sheets?)([\\/]|$)/i.test(path);
  if (!atlasHint) return false;

  const characterHint = hasToken(text, CHARACTER_WORDS);
  const sheetAnimationHint = hasToken(text, SHEET_WORDS) && characterHint && !hasToken(text, STATIC_SHEET_WORDS);
  const animationHint = hasToken(text, ACTION_WORDS) || hasToken(text, "animation|animated|allanim|all anim|strip") || sheetAnimationHint;
  const multiSubjectHint = hasToken(text, "characters|enemies|creatures|units|actors|players|npcs");
  return animationHint && (characterHint || multiSubjectHint || hasToken(text, "atlas|atlases"));
}

export function isLikelySpriteSheetPath(path: string): boolean {
  if (/\.(gif)$/i.test(path)) return true;
  if (isLikelyHybridSpriteAtlasPath(path)) return true;
  if (isLikelyTextureAtlasPath(path)) return false;
  if (isLikelySeparateFramePath(path)) return false;
  if (hasToken(path, "ui|hud|button|buttons|panel|panels|cursor|cursors|crosshair|crosshairs|bar|slider|slide") && !hasToken(path, "animated|animation|spritesheet|sprite sheet|strip|allanim|all anim")) return false;
  if (/(^|[\\/])(spritesheets?|sheets?|strips?)([\\/]|$)/i.test(path)) return true;
  if (hasToken(path, SHEET_WORDS)) return true;

  const name = basenameWithoutExtension(path);
  if (/\b\d{2,4}x\d{2,4}\b/i.test(name) && hasToken(name, ACTION_WORDS)) return true;
  if (hasToken(name, ACTION_WORDS) && !/(cover|preview|base|portrait|icon|button|ui|hud)/i.test(name)) return true;

  return false;
}

export function inferArtKind(path: string): ArtKind {
  const name = basenameWithoutExtension(path).toLowerCase();
  if (hasToken(path, "icon|icons|item|items|inventory|weapon|weapons|coin|coins|chest|pickup|potion|gem|gems")) return "icon";
  if (hasToken(path, "effect|effects|fx|fire|smoke|slash|impact|bullet|explosion|spell|magic")) return "effect";
  if (hasToken(path, "button|buttons|ui|hud|panel|cursor|menu|fullscreen|memoryprofiler") || /progress\s*bar/i.test(path)) return "ui";
  if (hasToken(path, VEHICLE_SPRITE_WORDS)) return isLikelySpriteSheetPath(path) ? "sprite" : "image";
  if (hasToken(path, CHARACTER_WORDS)) {
    return "character";
  }
  if (isLikelySpriteSheetPath(path) && hasToken(path, ACTION_WORDS)) return "sprite";
  if (hasToken(path, "tile|tiles|tileset|terrain|forest|dungeon|platform|ground|wall|walls|props")) return "tile";
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
