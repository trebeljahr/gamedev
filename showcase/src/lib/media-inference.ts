export type ArtKind = "character" | "sprite" | "icon" | "tile" | "effect" | "ui" | "image";

export type ArtBackgroundKind = "transparent" | "solid" | "mixed";

export type ArtInspection = {
  width: number;
  height: number;
  bgKind: ArtBackgroundKind;
  bgColor?: { r: number; g: number; b: number };
  alphaCoverage: number;
  transparentCoverage: number;
  contentRowRuns: number;
  contentColRuns: number;
  promoBackground: boolean;
  spriteSheetGrid: boolean;
  uniformGrid: boolean;
  cellMedianWidth?: number;
  cellMedianHeight?: number;
};

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

/**
 * Clean up Freesound/Kenney-style noise from an audio display label:
 *   "176741 Deleted User 3277771 Buffer Spell" -> "Buffer Spell"
 *   "Jingles Hit00" -> "Jingles Hit"
 *   "Cinematic ... Nexawave 228295" -> "Cinematic ... Nexawave"
 * File paths stay untouched; this only affects display.
 */
export function normalizeAudioDisplayName(input: string): string {
  let s = input
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Za-z])/g, "$1 $2")
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  s = s.replace(/\bdeleted\s+user\s+\d+\b/gi, " ");
  s = s.replace(/(^|\s)\d{4,}(?=\s|$)/g, " ");
  s = s.replace(/^\s*\d{3,}\s+/, "");
  while (/\s\d{2,}$/.test(s)) {
    s = s.replace(/\s\d{2,}$/, "");
  }

  s = s.replace(/\s+/g, " ").trim();
  if (!s) return input.trim();
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function isLikelyMarketingPreviewPath(path: string): boolean {
  const pathParts = parts(path);
  const name = tokenText(basenameWithoutExtension(path));
  if (hasToken(name, MARKETING_PREVIEW_WORDS)) return true;

  const folders = pathParts.slice(0, -1).map(tokenText);
  return folders.some((folder) => hasToken(folder, MARKETING_PREVIEW_FOLDERS));
}

// Generic / placeholder-style names ("a.png", "a-gif.gif", "a-png.png",
// "untitled", "image", "asset", "sample-1") — typical of itch promo dumps.
export function hasGenericFilename(path: string): boolean {
  const base = basenameWithoutExtension(path);
  const name = tokenText(base);
  if (!name) return true;
  // single-letter or single-letter + format-token e.g. "a", "a png", "a gif", "a gif 2"
  if (/^[a-z](?:\s+(?:png|gif|jpg|jpeg|webp|sprite|sheet)(?:\s+\d{1,3})?)?$/.test(name)) return true;
  if (/^(?:untitled|new file|image|images?|asset|assets?|sample|samples?|file|files?|test|tmp|temp)(?:\s+\d{1,3})?$/.test(name)) return true;
  if (/^[a-z]{1,3}\d{0,3}$/.test(base)) return true;
  return false;
}

export function isLikelyPromoImagePath(path: string): boolean {
  return isLikelyMarketingPreviewPath(path) || hasGenericFilename(path);
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
  const parentFolderText = tokenText(parts(path).at(-2) ?? "");
  const actionFolder = new RegExp(`^(${ACTION_WORDS})$`, "i").test(parentFolderText);
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
    (frameSuffix && (frameFolder || actionFolder || (actionHint && !onlyActionAndNumber))) ||
    (compactFrameSuffix && (frameFolder || actionFolder)) ||
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
  if (/\.sheet\.png$/i.test(path)) return true;
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
  if (/\.sheet\.png$/i.test(path)) return true;
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
    const parentFolder = tokenText(pathParts.at(-2) ?? "");
    const baseName = tokenText(basenameWithoutExtension(path));
    const actionPattern = new RegExp(`^(${ACTION_WORDS})$`, "i");
    const baseAction = baseName.split(/\s+/).find((token) => actionPattern.test(token));
    if (baseAction && parentFolder === baseAction.toLowerCase()) {
      const grandparent = tokenText(pathParts.at(-3) ?? "");
      return `${grandparent} ${baseAction}`.replace(/\s+/g, " ").trim();
    }
    return `${parent} ${baseName}`.replace(/\s+/g, " ").trim();
  }

  return `${parent} ${name}`.replace(/\s+/g, " ").trim();
}

export function scoreArtSample(path: string, inspection?: ArtInspection): number {
  const lower = path.toLowerCase();
  let score = 0;
  if (/\.(png|webp|gif)$/i.test(path)) score += 8;
  if (isLikelySpriteSheetPath(path)) score += 18;
  if (isLikelyTextureAtlasPath(path)) score += 12;
  if (hasToken(path, ACTION_WORDS)) score += 4;
  if (/(character|hero|knight|warrior|monster|enemy|icon|item|effect|fx|npc|ship)/.test(lower)) score += 8;
  if (isLikelySeparateFramePath(path)) score -= 10;
  if (isLikelyMarketingPreviewPath(path)) score -= 45;
  if (hasGenericFilename(path)) score -= 25;
  if (/(license|readme|credit|cover|banner|thumbnail|__macosx|[\\/]\._)/.test(lower)) score -= 40;

  if (inspection) {
    if (inspection.promoBackground) score -= 45;
    if (inspection.bgKind === "transparent") score += 6;
    if (inspection.spriteSheetGrid) score += 12;
    if (inspection.uniformGrid) score += 6;
    // Tiny image with solid bg is almost always a promo/sample.
    if (
      inspection.promoBackground &&
      inspection.width * inspection.height <= 320 * 320
    )
      score -= 20;
    // Sprite-sheet hint outweighs path-based heuristics when transparent.
    if (inspection.bgKind === "transparent" && inspection.alphaCoverage < 0.5)
      score += 4;
  }
  return score;
}

export function groupSequenceFrames<T extends { path: string }>(samples: readonly T[]): T[][] {
  const buckets = new Map<string, T[]>();
  for (const sample of samples) {
    if (!isLikelySeparateFramePath(sample.path)) continue;
    const key = artDesignKey(sample.path);
    const list = buckets.get(key) ?? [];
    list.push(sample);
    buckets.set(key, list);
  }
  return [...buckets.values()].filter((list) => list.length >= 2);
}

type FrameDedupInput = { path: string; inspection?: ArtInspection };

// Strip explicit sheet-suffix tokens ("coin-sheet" → "coin"). Returns null if
// the name doesn't carry a sheet token, signalling we shouldn't treat
// arbitrary numbered siblings as its frames.
function sheetNameRoot(base: string): string | null {
  const stripped = base.replace(
    /[-_\s]*(?:sprite[-_\s]?sheet|spritesheet|sheet|strip|allanim|all[-_\s]?anim)s?$/i,
    "",
  );
  if (stripped === base) return null;
  const trimmed = stripped.replace(/[-_\s]+$/, "");
  return trimmed.length > 0 ? trimmed : null;
}

// When a pack ships a stitched sprite sheet alongside the same frames as
// individual PNGs (e.g. `coin-sheet.png` + `coin1.png`..`coin6.png`), drop the
// individuals — the sheet is already the canonical animated sample. Also drops
// a same-named preview file (e.g. `walk.png` sheet + `walk.gif` preview).
// Matches by shared parent dir + per-cell dimensions + naming relationship to
// the sheet (frame-numbered child or exact-stem alternate format).
export function dropFramesCoveredBySheet<T extends FrameDedupInput>(samples: readonly T[]): T[] {
  const drop = new Set<T>();
  const byDir = new Map<string, T[]>();
  for (const sample of samples) {
    const dir = sample.path.split("/").slice(0, -1).join("/");
    const list = byDir.get(dir) ?? [];
    list.push(sample);
    byDir.set(dir, list);
  }

  for (const sheet of samples) {
    const ins = sheet.inspection;
    if (!ins || !ins.spriteSheetGrid) continue;
    const rows = Math.max(1, ins.contentRowRuns);
    const cols = Math.max(1, ins.contentColRuns);
    const frameCount = rows * cols;
    if (frameCount < 2) continue;
    const cellH = ins.cellMedianHeight ?? Math.round(ins.height / rows);
    const cellW = ins.cellMedianWidth ?? Math.round(ins.width / cols);
    if (cellW <= 0 || cellH <= 0) continue;

    const sheetBase = basenameWithoutExtension(sheet.path);
    const root = sheetNameRoot(sheetBase);
    const childPattern = root
      ? new RegExp(`^${root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[-_\\s]*\\d{1,4}$`, "i")
      : null;

    const dir = sheet.path.split("/").slice(0, -1).join("/");
    const siblings = byDir.get(dir) ?? [];
    const matches: T[] = [];
    for (const sib of siblings) {
      if (sib === sheet) continue;
      if (drop.has(sib)) continue;
      const sibIns = sib.inspection;
      if (!sibIns) continue;
      if (sibIns.spriteSheetGrid) continue;
      const sibBase = basenameWithoutExtension(sib.path);
      const isAlternateOfSheet =
        sibBase.toLowerCase() === sheetBase.toLowerCase() &&
        Math.abs(sibIns.width - ins.width) <= 2 &&
        Math.abs(sibIns.height - ins.height) <= 2;
      const isChildFrame =
        childPattern !== null &&
        childPattern.test(sibBase) &&
        Math.abs(sibIns.width - cellW) <= 2 &&
        Math.abs(sibIns.height - cellH) <= 2 &&
        frameNumberFromPath(sib.path) !== null;
      if (!isAlternateOfSheet && !isChildFrame) continue;
      matches.push(sib);
    }
    if (matches.length === 0) continue;
    if (matches.length > frameCount + 2) continue;
    for (const sib of matches) drop.add(sib);
  }

  return samples.filter((sample) => !drop.has(sample));
}

export function frameNumberFromPath(path: string): number | null {
  const base = basenameWithoutExtension(path);
  const match = base.match(/(?:^|[^0-9])(\d{1,5})$/);
  return match ? Number(match[1]) : null;
}

export function sortByFrameNumber<T extends { path: string }>(samples: readonly T[]): T[] {
  return [...samples].sort((a, b) => {
    const parentA = a.path.split("/").slice(0, -1).join("/");
    const parentB = b.path.split("/").slice(0, -1).join("/");
    if (parentA !== parentB) return parentA.localeCompare(parentB);
    const frameA = frameNumberFromPath(a.path);
    const frameB = frameNumberFromPath(b.path);
    if (frameA !== null && frameB !== null && frameA !== frameB) return frameA - frameB;
    return a.path.localeCompare(b.path);
  });
}

export type ArtSampleSelectionInput = {
  path: string;
  inspection?: ArtInspection;
};

function toInputs(paths: string[] | ArtSampleSelectionInput[]): ArtSampleSelectionInput[] {
  if (paths.length === 0) return [];
  if (typeof paths[0] === "string") return (paths as string[]).map((path) => ({ path }));
  return paths as ArtSampleSelectionInput[];
}

export function selectRepresentativeArtSamples(
  paths: string[] | ArtSampleSelectionInput[],
  limit: number,
): string[] {
  const inputs = toInputs(paths);
  const filtered = inputs.filter(
    ({ path, inspection }) =>
      !isLikelyMarketingPreviewPath(path) && !(inspection?.promoBackground),
  );
  const candidates = filtered.length > 0 ? filtered : inputs;
  const sorted = [...candidates].sort(
    (a, b) =>
      scoreArtSample(b.path, b.inspection) - scoreArtSample(a.path, a.inspection) ||
      a.path.localeCompare(b.path),
  );
  const selected: string[] = [];
  const seenDesigns = new Set<string>();

  for (const { path } of sorted) {
    const key = artDesignKey(path);
    if (seenDesigns.has(key)) continue;
    seenDesigns.add(key);
    selected.push(path);
    if (selected.length >= limit) return selected;
  }

  for (const { path } of sorted) {
    if (!selected.includes(path)) selected.push(path);
    if (selected.length >= limit) return selected;
  }

  return selected;
}

export function selectDisplayArtSamples(
  paths: string[] | ArtSampleSelectionInput[],
): string[] {
  const inputs = toInputs(paths);
  return [...inputs]
    .sort(
      (a, b) =>
        scoreArtSample(b.path, b.inspection) - scoreArtSample(a.path, a.inspection) ||
        a.path.localeCompare(b.path),
    )
    .map(({ path }) => path);
}

// Inspection-aware classifiers — fall back to path heuristics when inspection
// is missing or "mixed" (i.e. inconclusive).
export function isLikelyPromoArt(path: string, inspection?: ArtInspection): boolean {
  if (inspection?.promoBackground) return true;
  return isLikelyPromoImagePath(path);
}

export function isLikelySpriteSheet(path: string, inspection?: ArtInspection): boolean {
  if (inspection) {
    if (inspection.promoBackground) return false;
    if (inspection.spriteSheetGrid) return true;
    if (inspection.bgKind === "transparent" && inspection.alphaCoverage < 0.6)
      return isLikelySpriteSheetPath(path);
  }
  return isLikelySpriteSheetPath(path);
}

export function isLikelyTextureAtlas(path: string, inspection?: ArtInspection): boolean {
  if (inspection?.promoBackground) return false;
  return isLikelyTextureAtlasPath(path);
}

export function isAnimatedArt(path: string, inspection?: ArtInspection): boolean {
  if (inspection?.promoBackground) {
    // promo gifs are still animated *images* but not useful sprite sheets
    if (/\.gif$/i.test(path)) return true;
    return false;
  }
  if (inspection && !inspection.spriteSheetGrid && inspection.bgKind === "transparent") {
    // single-frame transparent png: not animated even if name says so
    if (inspection.contentRowRuns <= 1 && inspection.contentColRuns <= 1) return false;
  }
  // Strong pixel signal: clean transparent sprite-sheet grid with multiple frames.
  if (
    inspection?.spriteSheetGrid &&
    inspection.bgKind === "transparent" &&
    (inspection.contentRowRuns >= 2 || inspection.contentColRuns >= 2)
  ) {
    return true;
  }
  return isAnimatedArtPath(path);
}
