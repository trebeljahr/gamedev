export type AssetSize = [number, number, number];

export type ModelCategory =
  | "character"
  | "creature"
  | "weapon"
  | "projectile"
  | "building"
  | "modular"
  | "environment"
  | "nature"
  | "furniture"
  | "food"
  | "vehicle"
  | "sci-fi"
  | "resource"
  | "effect"
  | "prop";

export type ModelMetadata = {
  title: string;
  description: string;
  category: ModelCategory;
  subcategory: string;
  style: string[];
  themes: string[];
  tags: string[];
  searchText: string;
};

export type PackMetadata = {
  title: string;
  description: string;
  categories: ModelCategory[];
  style: string[];
  themes: string[];
  tags: string[];
  source: string;
  license: string;
  searchText: string;
};

export type MediaMetadata = {
  description: string;
  category: string;
  themes: string[];
  useCases: string[];
  tags: string[];
  searchText: string;
};

type ModelInput = {
  vendor: string;
  pack: string;
  packTitle?: string;
  name: string;
  file?: string;
  size?: AssetSize;
};

type PackInput = {
  vendor: string;
  pack: string;
  count: number;
  models: Array<Pick<ModelMetadata, "category" | "themes" | "tags">>;
};

const VENDOR_LABELS: Record<string, string> = {
  kaykit: "KayKit",
  kenney: "Kenney",
  quaternius: "Quaternius",
};

const VENDOR_LICENSES: Record<string, string> = {
  kaykit: "CC0 1.0",
  kenney: "CC0 1.0",
  quaternius: "CC0 1.0",
};

const ACRONYMS = new Set([
  "2d",
  "3d",
  "ai",
  "api",
  "cc0",
  "fbx",
  "fps",
  "glb",
  "gltf",
  "hp",
  "npc",
  "rpg",
  "rts",
  "sci",
  "smg",
  "sfx",
  "ui",
  "uv",
  "vfx",
]);

const COMPOUND_FIXES: Array<[RegExp, string]> = [
  [/\bblockbits\b/gi, "block bits"],
  [/\bdungeonremastered\b/gi, "dungeon remastered"],
  [/\bhalloweenbits\b/gi, "halloween bits"],
  [/\bresourcebits\b/gi, "resource bits"],
  [/\brpgtoolsbits\b/gi, "rpg tools bits"],
  [/\bstreetlights\b/gi, "street lights"],
  [/\bcinderblock\b/gi, "cinder block"],
  [/\bwoodfire\b/gi, "wood fire"],
  [/\bdeadtree\b/gi, "dead tree"],
  [/\bmapletree\b/gi, "maple tree"],
  [/\bnormaltree\b/gi, "normal tree"],
  [/\bpalmtree\b/gi, "palm tree"],
  [/\bpinetree\b/gi, "pine tree"],
  [/\bsidecover\b/gi, "side cover"],
  [/\bwallcover\b/gi, "wall cover"],
  [/\bbottompivot\b/gi, "bottom pivot"],
  [/\bwide2doors\b/gi, "wide 2 doors"],
  [/\b4way\b/gi, "4 way"],
  [/\bgermanShepherd\b/g, "german shepherd"],
];

const TAG_RULES: Array<[RegExp, string[]]> = [
  [/\b(low|poly|lowpoly|low-poly)\b/i, ["low-poly"]],
  [/\b(animated|animation|anim|walk|run|idle|attack|jump)\b/i, ["animated"]],
  [/\b(modular|wall|floor|roof|stairs|corner|straight|door|window|tile|tiles)\b/i, ["modular"]],
  [/\b(castle|dungeon|medieval|fantasy|knight|wizard|skeleton|pirate|village|ruins)\b/i, ["fantasy", "medieval"]],
  [/\b(space|sci|sci-fi|laser|blaster|robot|mech|alien|station|ship|turret)\b/i, ["sci-fi"]],
  [/\b(city|street|road|traffic|suburban|industrial|commercial|building|house)\b/i, ["urban"]],
  [/\b(forest|nature|tree|rock|plant|grass|flower|crop|farm|bush)\b/i, ["nature"]],
  [/\b(food|restaurant|sushi|junk|burger|pizza|fruit|vegetable|cake)\b/i, ["food"]],
  [/\b(zombie|blood|grave|graveyard|halloween|skull|tomb)\b/i, ["horror"]],
  [/\b(vehicle|car|truck|train|ship|boat|tank|bus|pickup)\b/i, ["vehicle"]],
  [/\b(prototype|placeholder|block|primitive|cube)\b/i, ["prototype"]],
];

const CATEGORY_RULES: Array<[ModelCategory, RegExp, string]> = [
  ["projectile", /\b(arrow|bullet|missile|rocket|beam|laser|cannonball)\b/i, "projectile"],
  ["weapon", /\b(axe|sword|knife|dagger|pistol|rifle|shotgun|smg|gun|blaster|bow|crossbow|spear|wand|staff|shield|bat|turret)\b/i, "weapon"],
  ["vehicle", /\b(vehicle|car|truck|train|bus|ship|spaceship|boat|tank|pickup|sports|wagon|cart)\b/i, "vehicle"],
  ["creature", /\b(animals?|enemies|enemy|fish|bird|cat|dog|pug|wolf|shark|turtle|dino|dinosaur|monster|zombie|skeleton|alien|crab|frog|pet|shepherd)\b/i, "creature"],
  ["character", /\b(character|hero|man|woman|male|female|knight|warrior|wizard|mage|pirate|civilian|villager|soldier|adventurer|sam|matt|lis|shaun|archer|robot|mech)\b/i, "character"],
  ["building", /\b(building|house|hut|shop|tower|castle|station|barn|restaurant|bridge|wall|roof|door|window|column|arch|fence|floor|stairs|room)\b/i, "architecture"],
  ["modular", /\b(modular|tile|tiles|road|street|platform|corner|straight|turn|intersection|slope|ramp|brick|block)\b/i, "modular piece"],
  ["nature", /\b(tree|rock|plant|grass|flower|bush|crop|log|stump|leaf|leaves|mushroom|petal|palm|pine|maple)\b/i, "nature prop"],
  ["furniture", /\b(chair|table|bench|bed|couch|sofa|shelf|cabinet|desk|lamp|toilet|sink|furniture|armchair|counter)\b/i, "furniture"],
  ["food", /\b(food|sushi|burger|pizza|cake|bread|meat|fish|fruit|apple|banana|carrot|drink|bottle|cup|plate)\b/i, "food item"],
  ["resource", /\b(coin|gem|crystal|ore|wood|stone|resource|chest|crate|barrel|bag|pickup|potion|key|item)\b/i, "collectible or resource"],
  ["effect", /\b(fire|smoke|explosion|blood|slash|impact|spark|magic|spell|effect|fx)\b/i, "effect"],
  ["sci-fi", /\b(space|sci|sci-fi|laser|blaster|robot|mech|alien|station|ship|turret)\b/i, "sci-fi asset"],
];

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function cleanRawText(value: string): string {
  let out = value
    .replace(/\.[^.]+$/i, "")
    .replace(/\.gltf$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Za-z])/g, "$1 $2")
    .replace(/\bpattern\s+([a-z])\b/gi, "pattern $1")
    .replace(/\bcolor\s+(\d+)\b/gi, "color $1");

  for (const [pattern, replacement] of COMPOUND_FIXES) {
    out = out.replace(pattern, replacement);
  }

  return out.replace(/\s+/g, " ").trim();
}

export function cleanAssetTitle(value: string): string {
  return cleanRawText(value)
    .split(" ")
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLowerCase();
      if (ACRONYMS.has(lower)) return lower.toUpperCase();
      if (/^[a-z]\d+$/i.test(word)) return word.toUpperCase();
      if (/^\d+$/.test(word)) return word;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ")
    .replace(/\bSci Fi\b/g, "Sci-Fi")
    .replace(/\bLow Poly\b/g, "Low-Poly")
    .replace(/\bBy Quaternius\b/g, "by Quaternius")
    .replace(/\bBy Kenney\b/g, "by Kenney");
}

function tokenText(...values: Array<string | undefined>): string {
  return values.filter(Boolean).map((value) => cleanRawText(value!)).join(" ").toLowerCase();
}

function hasToken(text: string, pattern: string): boolean {
  return new RegExp(`(^|\\s)(${pattern})(\\s|$)`, "i").test(tokenText(text));
}

function inferCategory(text: string): { category: ModelCategory; subcategory: string } {
  for (const [category, pattern, subcategory] of CATEGORY_RULES) {
    if (pattern.test(text)) return { category, subcategory };
  }
  return { category: "prop", subcategory: "prop" };
}

function inferTags(text: string, extra: string[] = []): string[] {
  const tags = [...extra];
  for (const [pattern, ruleTags] of TAG_RULES) {
    if (pattern.test(text)) tags.push(...ruleTags);
  }
  if (!tags.includes("low-poly")) tags.push("low-poly");
  return unique(tags).sort();
}

function mediaTags(tags: string[]): string[] {
  return tags.filter((tag) => tag !== "low-poly");
}

function inferThemes(text: string, packTitle: string): string[] {
  const themes: string[] = [];
  for (const [pattern, label] of [
    [/\b(dungeon|castle|medieval|fantasy|knight|wizard|rpg|village|ruins|pirate)\b/i, "fantasy"],
    [/\b(space|sci|sci-fi|laser|blaster|robot|mech|alien|station|ship)\b/i, "sci-fi"],
    [/\b(city|street|road|traffic|suburban|industrial|commercial|building)\b/i, "urban"],
    [/\b(forest|nature|tree|rock|plant|grass|flower|crop|farm|animals?)\b/i, "nature"],
    [/\b(food|restaurant|sushi|kitchen|interior|furniture)\b/i, "interior"],
    [/\b(zombie|grave|graveyard|halloween|skull|tomb)\b/i, "horror"],
    [/\b(prototype|block|primitive|placeholder)\b/i, "prototype"],
  ] as Array<[RegExp, string]>) {
    if (pattern.test(text)) themes.push(label);
  }
  if (themes.length === 0) themes.push(packTitle.toLowerCase());
  return unique(themes).sort();
}

function inferStyle(vendor: string, text: string): string[] {
  const style = ["low-poly"];
  if (vendor === "kaykit" || vendor === "kenney" || vendor === "quaternius") style.push("game-ready");
  if (/\b(animated|animation|anim)\b/i.test(text)) style.push("animated");
  if (/\b(textured|mat|material)\b/i.test(text)) style.push("textured");
  if (/\b(prototype|block|primitive|placeholder)\b/i.test(text)) style.push("prototype");
  return unique(style).sort();
}

function sizeWords(size?: AssetSize): string[] {
  if (!size) return [];
  const [x, y, z] = size;
  const tags: string[] = [];
  const footprint = Math.max(x, z);
  if (y > footprint * 1.8 && y > 2) tags.push("tall");
  if (footprint > y * 2 && footprint > 3) tags.push("wide");
  if (x < 0.6 && y < 0.6 && z < 0.6) tags.push("small");
  return tags;
}

function usePhrase(category: ModelCategory): string {
  switch (category) {
    case "character":
      return "NPCs, player stand-ins, crowd dressing, or animation tests";
    case "creature":
      return "wildlife, enemies, companions, or encounter dressing";
    case "weapon":
    case "projectile":
      return "combat props, pickups, loadouts, or VFX staging";
    case "building":
    case "modular":
      return "level blockouts, modular environments, settlements, or set dressing";
    case "nature":
    case "environment":
      return "biomes, terrain dressing, outdoor scenes, or level boundaries";
    case "furniture":
      return "interiors, rooms, shops, or lived-in set dressing";
    case "food":
      return "restaurants, pickups, market props, or cozy scene dressing";
    case "vehicle":
      return "traffic, transport, racing, or sci-fi scene dressing";
    case "sci-fi":
      return "space scenes, technology props, enemies, or bases";
    case "resource":
      return "loot, crafting, objectives, pickups, or inventory items";
    case "effect":
      return "combat feedback, hazards, magic, or scene polish";
    default:
      return "props, scene dressing, prototypes, or game jams";
  }
}

export function buildModelMetadata(input: ModelInput): ModelMetadata {
  const packTitle = input.packTitle ?? cleanAssetTitle(input.pack);
  const title = cleanAssetTitle(input.name);
  const text = tokenText(input.vendor, input.pack, input.name, input.file);
  const { category, subcategory } = inferCategory(text);
  const themes = inferThemes(text, packTitle);
  const tags = inferTags(text, [category, subcategory, ...themes, ...sizeWords(input.size)]);
  const style = inferStyle(input.vendor, text);
  const source = VENDOR_LABELS[input.vendor] ?? cleanAssetTitle(input.vendor);
  const description = `${title} is a ${style.join(", ")} ${subcategory} from ${source}'s ${packTitle} pack. Useful for ${usePhrase(category)}.`;
  const searchText = unique([
    title,
    input.name,
    input.file ?? "",
    packTitle,
    input.pack,
    source,
    category,
    subcategory,
    ...themes,
    ...style,
    ...tags,
  ].filter(Boolean)).join(" ").toLowerCase();

  return { title, description, category, subcategory, style, themes, tags, searchText };
}

function topValues<T extends string>(values: T[], max = 6): T[] {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([value]) => value);
}

export function buildPackMetadata(input: PackInput): PackMetadata {
  const title = cleanAssetTitle(input.pack);
  const source = VENDOR_LABELS[input.vendor] ?? cleanAssetTitle(input.vendor);
  const categories = topValues(input.models.map((model) => model.category));
  const themes = topValues(input.models.flatMap((model) => model.themes));
  const tags = unique([
    ...themes,
    ...categories,
    ...topValues(input.models.flatMap((model) => model.tags), 10),
    "low-poly",
    "game-ready",
  ]).sort();
  const style = inferStyle(input.vendor, `${input.pack} ${tags.join(" ")}`);
  const categoryPhrase = categories.length > 0 ? categories.join(", ") : "game assets";
  const themePhrase = themes.length > 0 ? themes.join(", ") : "general";
  const license = VENDOR_LICENSES[input.vendor] ?? "Check source metadata";
  const description = `${title} is a ${source} ${style.join(", ")} pack with ${input.count.toLocaleString("en-US")} models focused on ${themePhrase}. Includes ${categoryPhrase}.`;
  const searchText = unique([
    title,
    input.pack,
    source,
    input.vendor,
    license,
    description,
    ...categories,
    ...themes,
    ...style,
    ...tags,
  ]).join(" ").toLowerCase();

  return { title, description, categories, style, themes, tags, source, license, searchText };
}

export function buildArtPackMetadata(input: {
  folder: string;
  title: string;
  author: string;
  theme: string;
  license_class: string;
  attribution: string;
}): MediaMetadata {
  const text = tokenText(input.folder, input.title, input.author, input.theme, input.license_class);
  const themes = unique([input.theme.toLowerCase(), ...inferThemes(text, input.title)]).sort();
  const tags = mediaTags(inferTags(text, [input.theme.toLowerCase(), "2d", "art", "sprite", ...themes]));
  const useCases = mediaUseCases(input.theme.toLowerCase(), text);
  const description = `${cleanAssetTitle(input.title)} is a 2D ${input.theme.toLowerCase()} art pack by ${input.author}. Use it for ${useCases.join(", ")}. License: ${input.license_class}. Attribution: ${input.attribution}.`;
  const searchText = unique([
    input.title,
    input.folder,
    input.author,
    input.theme,
    input.license_class,
    input.attribution,
    description,
    input.theme,
    ...themes,
    ...useCases,
    ...tags,
  ]).join(" ").toLowerCase();
  return { description, category: input.theme, themes, useCases, tags, searchText };
}

export function buildSoundCollectionMetadata(input: {
  title: string;
  source: string;
  path: string;
  license: string;
  notes: string;
}): MediaMetadata {
  const text = tokenText(input.title, input.source, input.path, input.notes);
  const category = soundCategory(text);
  const themes = soundThemes(text);
  const useCases = soundUseCases(category, text);
  const tags = mediaTags(inferTags(text, ["sound", "sfx", category, input.source.toLowerCase(), ...themes]));
  const description = `${input.title} is a ${input.source} ${category} sound collection for ${useCases.join(", ")}. License: ${input.license}. ${input.notes}`.trim();
  const searchText = unique([
    input.title,
    input.source,
    input.path,
    input.license,
    input.notes,
    description,
    category,
    ...themes,
    ...useCases,
    ...tags,
  ]).join(" ").toLowerCase();
  return { description, category, themes, useCases, tags, searchText };
}

export function buildMusicTrackMetadata(input: {
  title: string;
  source: string;
  license: string;
  path: string;
}): MediaMetadata {
  const text = tokenText(input.title, input.path);
  const themes = musicThemes(text);
  const useCases = musicUseCases(text);
  const tags = mediaTags(inferTags(text, ["music", "track", input.source.toLowerCase(), ...themes]));
  const themeLabel = themes.filter((theme) => theme !== "music").join(", ") || "game";
  const description = `${input.title} is a ${themeLabel} music track by ${input.source}. Works well for ${useCases.join(", ")}. License: ${input.license}.`;
  const searchText = unique([
    input.title,
    input.source,
    input.license,
    input.path,
    description,
    ...themes,
    ...useCases,
    ...tags,
  ]).join(" ").toLowerCase();
  return { description, category: "music", themes, useCases, tags, searchText };
}

export function buildArtSampleMetadata(input: {
  packTitle: string;
  label: string;
  path: string;
  kind: string;
  animated: boolean;
}): MediaMetadata {
  const text = tokenText(input.packTitle, input.label, input.path, input.kind);
  const category = input.kind;
  const themes = unique([category, ...inferThemes(text, input.packTitle)]).sort();
  const useCases = mediaUseCases(category, text);
  const tags = mediaTags(inferTags(text, ["2d", "art", category, input.animated ? "animated" : "static", ...themes]));
  const description = `${input.label} is ${input.animated ? "an animated" : "a static"} 2D ${category} sample from ${input.packTitle}. Useful for ${useCases.join(", ")}.`;
  const searchText = unique([
    input.label,
    input.path,
    input.packTitle,
    input.kind,
    description,
    ...themes,
    ...useCases,
    ...tags,
  ]).join(" ").toLowerCase();
  return { description, category, themes, useCases, tags, searchText };
}

export function buildSoundSampleMetadata(input: {
  collectionTitle: string;
  label: string;
  path: string;
  kind: string;
}): MediaMetadata {
  const text = tokenText(input.collectionTitle, input.label, input.path, input.kind);
  const category = soundCategory(text) || input.kind;
  const themes = soundThemes(text);
  const useCases = soundUseCases(category, text);
  const tags = mediaTags(inferTags(text, ["sound", "sfx", category, input.kind, ...themes]));
  const description = `${input.label} is a ${category} sound sample from ${input.collectionTitle}. Useful for ${useCases.join(", ")}.`;
  const searchText = unique([
    input.label,
    input.path,
    input.collectionTitle,
    input.kind,
    description,
    category,
    ...themes,
    ...useCases,
    ...tags,
  ]).join(" ").toLowerCase();
  return { description, category, themes, useCases, tags, searchText };
}

export function buildSourceMappingMetadata(input: {
  path_pattern: string;
  source: string;
  notes?: string;
  author?: string;
  license?: string;
  track_title?: string;
  likely_creator?: string;
}): MediaMetadata & { title: string; medium: string } {
  const title = input.track_title ?? cleanAssetTitle(input.path_pattern.replace(/\/\*\*$/, "").split("/").pop() || input.path_pattern);
  const text = tokenText(input.path_pattern, input.source, input.notes, input.author, input.license, input.track_title, input.likely_creator);
  const medium = mediumForPath(input.path_pattern);
  const category =
    medium === "sound" ? soundCategory(text) :
    medium === "music" ? "music" :
    medium === "texture" ? "texture" :
    medium === "2d-art" ? "2d-art" :
    "source";
  const themes = medium === "sound" ? soundThemes(text) : inferThemes(text, title);
  const useCases =
    medium === "sound" ? soundUseCases(category, text) :
    medium === "music" ? musicUseCases(text) :
    medium === "texture" ? ["materials", "surface detail", "environment art"] :
    mediaUseCases(category, text);
  const tags = mediaTags(inferTags(text, [medium, category, input.source, ...themes]));
  const source = cleanAssetTitle(input.source);
  const license = input.license ?? "See source metadata";
  const description = `${title} covers ${input.path_pattern} from ${source}. Medium: ${medium}. Category: ${category}. Use for ${useCases.join(", ")}. License: ${license}. ${input.notes ?? ""}`.trim();
  const searchText = unique([
    title,
    input.path_pattern,
    input.source,
    input.author ?? "",
    input.likely_creator ?? "",
    license,
    description,
    medium,
    category,
    ...themes,
    ...useCases,
    ...tags,
  ]).join(" ").toLowerCase();
  return { title, medium, description, category, themes, useCases, tags, searchText };
}

function mediumForPath(path: string): string {
  if (path.startsWith("sounds/music/")) return "music";
  if (path.startsWith("sounds/")) return "sound";
  if (path.startsWith("2D/") || path.startsWith("kenney/2D/")) return "2d-art";
  if (path.startsWith("textures/")) return "texture";
  if (path.startsWith("3D/")) return "3d-legacy";
  return "asset";
}

function soundCategory(text: string): string {
  if (/(music|track|theme|song|incompetech|macleod)/i.test(text)) return "music";
  if (/(footstep|step|walk|run|jump|movement|grass|gravel)/i.test(text)) return "movement";
  if (/(hit|impact|slash|attack|weapon|arrow|explosion|laser|shoot|hurt|damage|combat)/i.test(text)) return "combat";
  if (hasToken(text, "ui|click|button|select|menu|confirm|coin|pickup|notification")) return "ui";
  if (/(ambient|wind|rain|forest|water|loop|room|drone|atmosphere)/i.test(text)) return "ambient";
  return "effect";
}

function soundThemes(text: string): string[] {
  const themes: string[] = [];
  for (const [pattern, label] of [
    [/(fantasy|magic|spell|sword|medieval|dungeon)/i, "fantasy"],
    [/(sci|laser|robot|space|ship|alien)/i, "sci-fi"],
    [/(forest|grass|gravel|wind|rain|water|nature)/i, "nature"],
    [/(combat|weapon|hit|impact|explosion|attack)/i, "combat"],
    [/(^|\s)(ui|menu|click|button|select|confirm)(\s|$)/i, "interface"],
    [/(horror|dark|ghost|monster|zombie)/i, "horror"],
    [/(music|theme|song|loop)/i, "music"],
  ] as Array<[RegExp, string]>) {
    if (pattern.test(text)) themes.push(label);
  }
  return unique(themes.length ? themes : ["general"]).sort();
}

function soundUseCases(category: string, text: string): string[] {
  if (category === "movement") return ["footstep variation", "character movement", "terrain feedback"];
  if (category === "combat") return ["attacks", "impacts", "combat feedback"];
  if (category === "ui") return ["menus", "buttons", "inventory feedback"];
  if (category === "ambient") return ["environment loops", "scene atmosphere", "background beds"];
  if (category === "music") return musicUseCases(text);
  return ["gameplay feedback", "scene polish", "interactive events"];
}

function musicThemes(text: string): string[] {
  const themes: string[] = ["music"];
  if (/(ancient|magic|forest|winds|tale|mystery)/i.test(text)) themes.push("fantasy");
  if (/(black|vortex|corruption|midnight|mystery)/i.test(text)) themes.push("dark", "mystery");
  if (/(clash|defiant|course)/i.test(text)) themes.push("action", "adventure");
  if (/(comfortable|peppers)/i.test(text)) themes.push("light", "quirky");
  return unique(themes).sort();
}

function musicUseCases(text: string): string[] {
  if (/(clash|defiant|course)/i.test(text)) return ["battle scenes", "hero moments", "menus with momentum"];
  if (/(black|vortex|corruption|midnight)/i.test(text)) return ["tense levels", "boss build-up", "dark menus"];
  if (/(magic|forest|ancient|winds)/i.test(text)) return ["fantasy exploration", "overworld scenes", "ambient menus"];
  if (/(comfortable|peppers|mystery)/i.test(text)) return ["puzzle scenes", "quirky menus", "light exploration"];
  return ["background music", "menus", "level ambience"];
}

function mediaUseCases(category: string, text: string): string[] {
  if (/(character|hero|warrior|mage|witch|archer|samurai|king)/i.test(text) || category.includes("character")) {
    return ["player characters", "NPCs", "animation prototyping"];
  }
  if (/(enemy|monster|demon|undead|skeleton|creature|animal)/i.test(text) || category.includes("enemy")) {
    return ["enemy variants", "encounters", "creature animation"];
  }
  if (/(effect|fx|fire|smoke|spell|magic|slash|bullet)/i.test(text) || category.includes("effect")) {
    return ["combat VFX", "spell effects", "hit feedback"];
  }
  if (/(icon|item|coin|chest|pickup|potion|inventory)/i.test(text) || category.includes("icon")) {
    return ["inventory UI", "loot", "pickup feedback"];
  }
  if (/(tile|tileset|forest|dungeon|mine|plains|platform|environment)/i.test(text) || category.includes("environment")) {
    return ["level building", "tilemaps", "environment dressing"];
  }
  if (hasToken(text, "ui|hud|button|menu") || category.includes("ui")) {
    return ["menus", "HUD", "interface mockups"];
  }
  if (/(ship|fleet|space|mech|sci|shooter)/i.test(text)) {
    return ["shooters", "space encounters", "sci-fi prototyping"];
  }
  return ["game jams", "prototypes", "scene dressing"];
}
