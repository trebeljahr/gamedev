export type ArtKind = "character" | "sprite" | "icon" | "tile" | "effect" | "ui" | "image";

const ACTION_WORDS =
  "idle|walk|run|jump|fall|attack|attacks|hurt|hit|death|die|move|dash|roll|slide|crouch|sleep|sleeping|charge|teleport";
const ANIMATION_WORDS =
  "animation|animations|animated|anim|allanim|all anim|all animation|all animations|strip|strips";
const CHARACTER_WORDS =
  "character|characters|hero|heroes|player|players|person|people|man|men|woman|women|female|male|soldier|soldiers|adventurer|adventurers|king|kings|knight|knights|warrior|warriors|mage|mages|witch|witches|dino|dinos|dinosaur|dinosaurs|frog|frogs|cat|cats|dog|dogs|sheep|bat|bats|bird|birds|wolf|wolves|fish|shark|sharks|turtle|turtles|crab|crabs|rat|rats|snake|snakes|worm|worms|skeleton|skeletons|demon|demons|goblin|goblins|monster|monsters|enemy|enemies|creature|creatures|animal|animals|alien|aliens|samurai|archer|archers|bandit|bandits|huntress|wizard|wizards|npc|npcs|villager|villagers|ronin";
const VEHICLE_SPRITE_WORDS =
  "ship|ships|spaceship|spaceships|ufo|ufos|fighter|fighters|bomber|bombers|battlecruiser|battlecruisers|frigate|frigates|dreadnought|dreadnoughts|scout|scouts|torpedo";
const ATLAS_WORDS =
  "atlas|texture|textures|tilesheet|tile sheet|tilemap|tile map|tileset|tiled|terrain|decoration|decorations|objects|props|ground|background|backgrounds|elements|foliage|map|maps|cartography";
const SHEET_WORDS = "spritesheet|sprite sheet|sheet|strip|strips";
const STATIC_SHEET_WORDS =
  "ui|hud|button|buttons|panel|panels|cursor|cursors|crosshair|crosshairs|icon|icons|item|items|coin|coins|controls|tile|tiles|tilesheet|tilemap|tileset|terrain|platform|platformer|dungeon|dungeons|cave|caves|industrial|roguelike|landscape|building|buildings|city|road|roads|vehicle|vehicles|car|cars|object|objects|prop|props|background|backgrounds|elements|boardgame|chips|dice|pieces|cards|map|maps|cartography|foliage|hexagon|holiday|rts|topdown|debris|glass|metal|stone|wood|puzzle|rune|runes|equipment|flairs|medal|medals|prompt|prompts|keyboard|mouse|touch";
const MARKETING_PREVIEW_WORDS =
  "preview|previews|sample|samples|demo|demos|screenshot|screenshots|cover|covers|thumbnail|thumbnails|promo|promotion|marketing|banner|banners";
const MARKETING_PREVIEW_FOLDERS = "previews|samples|screenshots|captures|marketing|promo|promotional";
const MULTI_SUBJECT_WORDS =
  "characters|enemies|creatures|animals|units|actors|players|npcs|items|icons|objects|props|ships|vehicles|pieces|dice|cards|tiles|parts|limbs|faces|hair|shirts|pants|shoes";
const STATIC_COLLECTION_WORDS =
  `${STATIC_SHEET_WORDS}|${MULTI_SUBJECT_WORDS}|builder|modular|default|double|retina|outline|nodetails|all sprites|allsprites`;

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

export function isLikelyMarketingPreviewPath(path: string): boolean {
  const pathParts = parts(path);
  const name = tokenText(basenameWithoutExtension(path));
  if (hasToken(name, MARKETING_PREVIEW_WORDS)) return true;

  const folders = pathParts.slice(0, -1).map(tokenText);
  return folders.some((folder) => hasToken(folder, MARKETING_PREVIEW_FOLDERS));
}

function hasCharacterHint(path: string): boolean {
  return hasToken(path, CHARACTER_WORDS) || /(character|hero|knight|warrior|wizard|witch|mage|archer|samurai|bandit|huntress|dino|frog|cat|dog|bird|wolf|fish|shark|turtle|crab|rat|snake|worm|skeleton|monster|enemy|creature|animal|alien|king|goblin|demon)/i.test(path);
}

function hasMultiSubjectHint(path: string): boolean {
  return hasToken(path, MULTI_SUBJECT_WORDS) || /(characters|enemies|creatures|animals|players|npcs|items|icons|objects|props|ships|vehicles|pieces|dice|cards|tiles|parts|limbs)/i.test(path);
}

function hasSheetFolder(path: string): boolean {
  return /(^|[\\/])(?:sprite\s*sheets?|spritesheets?|sprite\s*sheet|spritesheet|sheets?|strips?)([\\/]|$)/i.test(path);
}

function hasSheetHint(path: string): boolean {
  return hasSheetFolder(path) || hasToken(path, SHEET_WORDS);
}

function hasExplicitAnimationHint(path: string): boolean {
  return hasToken(path, ANIMATION_WORDS) || /\bstrip\s*\d+\b/i.test(tokenText(path));
}

function isPreviewOrStillName(path: string): boolean {
  return hasToken(basenameWithoutExtension(path), "cover|preview|sample|base|portrait|icon|button|ui|hud|still|limb|limbs|head|hand|body");
}

function isLikelyStaticCollectionSheetPath(path: string): boolean {
  if (!hasSheetHint(path)) return false;
  if (hasExplicitAnimationHint(path)) return false;
  if (hasToken(path, STATIC_COLLECTION_WORDS)) return true;
  return /(^|[\\/])kenney([\\/]|$)/i.test(path);
}

function isLikelySingularCharacterSheetPath(path: string): boolean {
  if (!hasSheetHint(path)) return false;
  if (isPreviewOrStillName(path)) return false;
  if (/(^|[\\/])kenney([\\/]|$)/i.test(path)) return false;
  if (!hasCharacterHint(path)) return false;
  if (hasMultiSubjectHint(path)) return false;
  if (hasToken(path, "builder|modular|parts|limbs|face|hair|pants|shirts|shoes|skin|equipment")) return false;
  return true;
}

function isLikelyActionSheetContext(path: string): boolean {
  if (isPreviewOrStillName(path) || isLikelySeparateFramePath(path)) return false;
  if (hasSheetFolder(path) || hasExplicitAnimationHint(path)) return true;
  if (/(^|[\\/])kenney([\\/]|$)/i.test(path)) return false;
  if (/(^|[\\/])(pngs?|frames?|individual|separate|separated|poses?|limbs?)([\\/]|$)/i.test(path)) return false;
  return /(^|[\\/])sprites?([\\/]|$)/i.test(path) || hasCharacterHint(path);
}

export function isLikelySeparateFramePath(path: string): boolean {
  if (/\.(gif)$/i.test(path)) return false;
  if (hasSheetHint(path)) return false;
  if (hasExplicitAnimationHint(path)) return false;
  if (hasToken(path, "atlas")) return false;

  const name = tokenText(basenameWithoutExtension(path));
  const frameSuffix = /(^|\s)(?:frame\s*)?\d{1,4}$/.test(name);
  const compactFrameSuffix = /[a-z]\d{1,4}$/i.test(basenameWithoutExtension(path));
  const frameFolder = /(^|[\\/])(sprites?|frames?|pngs?|individual|separate)([\\/]|$)/i.test(path);
  const actionHint = hasToken(name, ACTION_WORDS) || hasToken(path, ACTION_WORDS);
  const words = name.split(/\s+/).filter(Boolean);
  const onlyActionAndNumber = words.length <= 2 && hasToken(words[0] ?? "", ACTION_WORDS) && /^\d{1,4}$/.test(words.at(-1) ?? "");
  const kenneyPoseFrame =
    /(^|[\\/])kenney([\\/]|$)/i.test(path) &&
    /(^|[\\/])(png|sprites?|poses?|limbs?)([\\/]|$)/i.test(path) &&
    actionHint;
  const namedPoseFrame =
    actionHint &&
    (/(^|[\\/])(poses?|limbs?)([\\/]|$)/i.test(path) ||
      hasToken(name, "still|pose|limb|limbs|head|hand|body") ||
      /(^|\s)[a-z]$/.test(name));

  return (
    (frameSuffix && (frameFolder || (actionHint && !onlyActionAndNumber))) ||
    (compactFrameSuffix && frameFolder) ||
    kenneyPoseFrame ||
    namedPoseFrame
  );
}

export function isLikelyTextureAtlasPath(path: string): boolean {
  const text = tokenText(path);
  const sheetHint = hasToken(text, "spritesheet|sprite sheet|sheet") || hasSheetFolder(path);
  const staticSheetHint = sheetHint && hasToken(text, STATIC_SHEET_WORDS);
  const atlasHint = staticSheetHint || hasToken(text, ATLAS_WORDS) || /(^|[\\/])(tiled_files|tilesets?|tilemaps?|textures?)([\\/]|$)/i.test(path);
  if (!atlasHint) return false;

  const animationHint = hasToken(text, ACTION_WORDS) || hasExplicitAnimationHint(path);
  const characterHint = hasCharacterHint(text);
  const animatedIconHint = hasToken(text, "coin|coins|chest|chests|pickup|gem|gems|potion|potions");
  if (animationHint && animatedIconHint) return false;
  return !animationHint && !characterHint;
}

export function isLikelyHybridSpriteAtlasPath(path: string): boolean {
  if (isLikelyStaticCollectionSheetPath(path)) return false;
  const text = tokenText(path);
  const atlasHint = hasToken(text, ATLAS_WORDS) || hasSheetFolder(path) || /(^|[\\/])(atlases?|textures?)([\\/]|$)/i.test(path);
  if (!atlasHint) return false;

  const characterHint = hasCharacterHint(text);
  const animationHint = hasToken(text, ACTION_WORDS) || hasExplicitAnimationHint(path) || isLikelySingularCharacterSheetPath(path);
  const multiSubjectHint = hasMultiSubjectHint(text);
  return animationHint && (characterHint || multiSubjectHint || hasToken(text, "atlas|atlases"));
}

export function isLikelySpriteSheetPath(path: string): boolean {
  if (/\.(gif)$/i.test(path)) return true;
  if (isLikelyHybridSpriteAtlasPath(path)) return true;
  if (isLikelyTextureAtlasPath(path)) return false;
  if (isLikelySeparateFramePath(path)) return false;
  if (hasToken(path, "ui|hud|button|buttons|panel|panels|cursor|cursors|crosshair|crosshairs|bar|slider|slide") && !hasToken(path, "animated|animation|spritesheet|sprite sheet|strip|allanim|all anim")) return false;
  if (hasSheetFolder(path)) return true;
  if (hasToken(path, SHEET_WORDS)) return true;
  if (hasExplicitAnimationHint(path)) return true;

  const name = basenameWithoutExtension(path);
  if (/\b\d{2,4}x\d{2,4}\b/i.test(name) && hasToken(name, ACTION_WORDS)) return true;
  if (hasToken(name, ACTION_WORDS) && isLikelyActionSheetContext(path)) return true;

  return false;
}

export function inferArtKind(path: string): ArtKind {
  const name = basenameWithoutExtension(path).toLowerCase();
  if (hasToken(path, "icon|icons|item|items|inventory|weapon|weapons|coin|coins|chest|pickup|potion|gem|gems|boardgame|chips|dice|pieces|cards|medal|medals|rune|runes")) return "icon";
  if (hasToken(path, "effect|effects|fx|fire|smoke|slash|impact|bullet|bullets|laser|lasers|particle|particles|explosion|explosive|debris|spell|magic")) return "effect";
  if (hasToken(path, "button|buttons|ui|hud|panel|cursor|menu|fullscreen|memoryprofiler|prompt|prompts|keyboard|mouse|touch|controls") || /progress\s*bar/i.test(path)) return "ui";
  if (hasToken(path, VEHICLE_SPRITE_WORDS)) return isLikelySpriteSheetPath(path) ? "sprite" : "image";
  if (hasCharacterHint(path)) {
    return "character";
  }
  if (isLikelySpriteSheetPath(path) && hasToken(path, ACTION_WORDS)) return "sprite";
  if (hasToken(path, "tile|tiles|tileset|terrain|forest|dungeon|platform|ground|wall|walls|props")) return "tile";
  if (isLikelySpriteSheetPath(path) || /\bspr(ite)?\b/i.test(name)) return "sprite";
  return "image";
}

export function isAnimatedArtPath(path: string): boolean {
  if (/\.(gif)$/i.test(path)) return true;
  if (isLikelyStaticCollectionSheetPath(path)) return false;
  if (!isLikelySpriteSheetPath(path)) return false;
  if (hasExplicitAnimationHint(path) || isLikelySingularCharacterSheetPath(path)) return true;

  const name = basenameWithoutExtension(path);
  if (hasToken(name, ACTION_WORDS) && isLikelyActionSheetContext(path)) return true;

  return false;
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
  if (isLikelyTextureAtlasPath(path)) score += 12;
  if (hasToken(path, ACTION_WORDS)) score += 4;
  if (/(character|hero|knight|warrior|monster|enemy|icon|item|effect|fx|npc|ship)/.test(lower)) score += 8;
  if (isLikelySeparateFramePath(path)) score -= 10;
  if (isLikelyMarketingPreviewPath(path)) score -= 45;
  if (/(license|readme|credit|cover|banner|thumbnail|__macosx|[\\/]\._)/.test(lower)) score -= 40;
  return score;
}

export function selectRepresentativeArtSamples(paths: string[], limit: number): string[] {
  const materialPaths = paths.filter((path) => !isLikelyMarketingPreviewPath(path));
  const candidates = materialPaths.length > 0 ? materialPaths : paths;
  const sorted = [...candidates].sort((a, b) => scoreArtSample(b) - scoreArtSample(a) || a.localeCompare(b));
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

export function selectDisplayArtSamples(paths: string[]): string[] {
  return [...paths].sort((a, b) => scoreArtSample(b) - scoreArtSample(a) || a.localeCompare(b));
}
