import Link from "next/link";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { downloadsForModel, manifest } from "@/lib/manifest";
import fs from "node:fs";
import path from "node:path";
import { catalog, findArtPack, mediaStats, sourceMappings } from "@/lib/media";
import { cleanAudioLabel } from "@/lib/audio-label";
import { pageMetadata } from "@/lib/seo";
import {
  LibraryHeroShowreel,
  type LibraryModelPreview,
  type LibrarySoundPreview,
  type LibrarySpritePreview,
} from "@/components/LibraryHeroShowreel";
import { LibraryAssetTracks } from "@/components/LibraryAssetTracks";
import { isLikelyMarketingPreviewPath, isLikelySpriteSheetPath } from "@/lib/media-inference";
import type { ArtPack, ArtSample, ArtTheme, MusicTrack, SoundCollection, SoundSample } from "@/lib/media";

export const metadata: Metadata = pageMetadata({
  title: "Free, Hand-Picked Game Assets with Permissive Licenses",
  description:
    "Search free, hand-picked, high-quality game assets with permissive licenses — 3D models, pixel art, sprite sheets, sound effects, music, and textures — all in one place.",
  pathname: "/",
});

const LANDING_ASSET_BASE_URL = (
  process.env.NEXT_PUBLIC_LANDING_ASSETS_BASE_URL ?? "https://assets.gamedev.trebeljahr.com"
).replace(/\/+$/, "");

function assetUrl(src: string) {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(src)) return src;
  return `${LANDING_ASSET_BASE_URL}${src.startsWith("/") ? src : `/${src}`}`;
}

type FeaturedSpriteCategory = "character" | "environment" | "icons";

type SpriteSlot = {
  category: FeaturedSpriteCategory;
  themes: ArtTheme[];
  label: string;
  requireAnimated: boolean;
  preferKinds?: ArtSample["kind"][];
};

const FEATURED_SPRITE_SLOTS: SpriteSlot[] = [
  {
    category: "character",
    themes: ["Characters"],
    label: "Character",
    requireAnimated: true,
    preferKinds: ["character", "sprite"],
  },
  {
    category: "environment",
    themes: ["Environments"],
    label: "Environment",
    requireAnimated: false,
    preferKinds: ["tile", "sprite", "image"],
  },
  {
    category: "icons",
    themes: ["Icons & Items", "UI"],
    label: "Icons & UI",
    requireAnimated: false,
    preferKinds: ["icon", "ui"],
  },
];

const TRACK_SPRITE_SLOTS: SpriteSlot[] = [
  {
    category: "character",
    themes: ["Characters"],
    label: "Hero rig",
    requireAnimated: true,
    preferKinds: ["character", "sprite"],
  },
  {
    category: "character",
    themes: ["Enemies", "Animals"],
    label: "Enemy",
    requireAnimated: true,
    preferKinds: ["character", "sprite"],
  },
  {
    category: "environment",
    themes: ["Environments"],
    label: "Tileset",
    requireAnimated: false,
    preferKinds: ["tile", "sprite", "image"],
  },
  {
    category: "environment",
    themes: ["Effects", "Vehicles & Sci-Fi"],
    label: "FX & props",
    requireAnimated: false,
    preferKinds: ["effect", "sprite", "image"],
  },
  {
    category: "icons",
    themes: ["Icons & Items"],
    label: "Icons",
    requireAnimated: false,
    preferKinds: ["icon"],
  },
  {
    category: "icons",
    themes: ["UI"],
    label: "UI kit",
    requireAnimated: false,
    preferKinds: ["ui", "icon"],
  },
];

const audioAnalysisItems = (() => {
  const raw = fs.readFileSync(
    path.join(process.cwd(), "public", "audio-analysis.json"),
    "utf8",
  );
  return (JSON.parse(raw) as {
    items?: Record<string, { duration?: number; loudness?: number[] }>;
  }).items ?? {};
})();

type ModelSlot = {
  packId: string;
  name: string;
  scaleBoost?: number;
};

// A deliberately diverse cross-section of the catalog — buildings, fantasy
// heroes, undead, a monster, a dinosaur, two animals, a car, a spaceship, a
// robot, a mech, a tree, an astronaut, a fish — so the hero grid showcases the
// breadth of the library rather than a single genre.
const HERO_MODEL_SLOTS: ModelSlot[] = [
  { packId: "kaykit/medieval-builder-pack", name: "castle" },
  { packId: "kaykit/adventurers", name: "knight" },
  { packId: "kaykit/adventurers", name: "mage" },
  { packId: "kaykit/skeletons", name: "skeleton-warrior" },
  { packId: "quaternius/ultimate-monsters", name: "bluedemon" },
  { packId: "quaternius/dinosaur-animated-pack-dec-2018", name: "velociraptor" },
  { packId: "kenney/cube-pets", name: "animal-fox" },
  { packId: "quaternius/ultimate-animated-animals-july-2021", name: "horse" },
  { packId: "kenney/car-kit", name: "ambulance" },
  { packId: "quaternius/spaceships-by-quaternius", name: "spaceship2" },
  { packId: "quaternius/animated-robot-oct-2018", name: "robot" },
  { packId: "quaternius/animated-mech-pack-march-2021", name: "stan" },
  { packId: "quaternius/textured-stylized-trees-may-2020", name: "birch-1" },
  { packId: "quaternius/ultimate-space-kit-march-2023", name: "astronaut-finnthefrog" },
  { packId: "quaternius/cute-fish-pack-feb-2020", name: "clownfish" },
];

type FeaturedSoundPick = {
  kind: "music" | "sfx";
  tone: "music" | "jingle" | "sfx";
  collectionLabel: string;
  matchTitle?: string;
  matchSource?: string;
  matchPath?: string;
};

const FEATURED_SOUND_PICKS: FeaturedSoundPick[] = [
  {
    kind: "music",
    tone: "music",
    collectionLabel: "Kevin MacLeod",
    matchTitle: "Black Vortex",
  },
  {
    kind: "music",
    tone: "jingle",
    collectionLabel: "Kenney Jingles",
    matchSource: "Kenney",
  },
  {
    kind: "sfx",
    tone: "sfx",
    collectionLabel: "Combat SFX",
    matchPath: "sounds/combat/",
  },
];

// A second, distinct slice for the "what's inside" 3D track visual — different
// picks from the hero so the two grids don't read as duplicates.
const TRACK_MODEL_SLOTS: ModelSlot[] = [
  { packId: "kaykit/medieval-builder-pack", name: "barracks" },
  { packId: "kaykit/adventurers", name: "knight" },
  { packId: "kaykit/skeletons", name: "skeleton-blade" },
  { packId: "kenney/cube-pets", name: "animal-elephant" },
  { packId: "kenney/cube-pets", name: "animal-cow" },
  { packId: "kenney/car-kit", name: "sedan-sports" },
  { packId: "kenney/car-kit", name: "police" },
  { packId: "quaternius/animated-robot-oct-2018", name: "robot" },
  { packId: "quaternius/cube-world-aug-2023", name: "character-male-1" },
  { packId: "quaternius/cube-world-aug-2023", name: "cat" },
  { packId: "quaternius/ultimate-space-kit-march-2023", name: "astronaut-fernandotheflamingo" },
  { packId: "quaternius/spaceships-by-quaternius", name: "spaceship2" },
  { packId: "quaternius/ultimate-fantasy-rts-aug-2022", name: "archery-firstage-level1" },
];

const TRACK_MUSIC_PICKS: FeaturedSoundPick[] = [
  { kind: "music", tone: "music", collectionLabel: "AlkaKrab", matchTitle: "Moonspire" },
  { kind: "music", tone: "music", collectionLabel: "Pixabay", matchTitle: "Cosmic Glow" },
  { kind: "music", tone: "music", collectionLabel: "Kevin MacLeod", matchTitle: "Magic Forest" },
  { kind: "music", tone: "music", collectionLabel: "Deisnberg", matchTitle: "Deisnberg Trailer" },
  { kind: "music", tone: "music", collectionLabel: "Audiocoffee", matchTitle: "Audiocoffee Relaxing Ambient Meditation Short Ver" },
];

// Flat-front staggered grid. Every model is normalized to fit a cube of side
// GRID_TARGET_SIZE (so wildly different source scales read at a comparable
// size), laid out on a brick-staggered grid that intentionally overflows the
// frustum so edge models clip. The camera looks straight on, each model spins
// on its own axis.
const GRID_TARGET_SIZE = 1.3;
const GRID_DX = 1.8;
const GRID_DY = 1.65;
const GRID_Z_JITTER = 0.4;

// KayKit's adventurer + skeleton character packs lost their texture atlas during
// GLB optimization: the optimized .glb embeds a 1×1 placeholder image, so those
// models render as flat untextured "yellow" figures. Their raw GLBs still carry
// the real 1024² atlas, so the landing previews load raw for these packs.
const RAW_TEXTURE_PACKS = new Set(["kaykit/adventurers", "kaykit/skeletons"]);

function gridRowsFor(total: number): number {
  if (total <= 9) return 2;
  if (total <= 18) return 3;
  return 4;
}

// Grid cell center for `index` of `total` models. Rows are brick-staggered and
// each row is centered on its own member count, so a short final row still sits
// centered. Alternating depth gives the wall a little dimensionality.
function layoutGridCell(index: number, total: number): [number, number, number] {
  const rows = gridRowsFor(total);
  const cols = Math.ceil(total / rows);
  const row = Math.floor(index / cols);
  const col = index % cols;
  const countInRow = Math.min(cols, total - row * cols);
  const stagger = (row % 2 === 0 ? -1 : 1) * GRID_DX * 0.25;
  const x = (col - (countInRow - 1) / 2) * GRID_DX + stagger;
  const y = ((rows - 1) / 2 - row) * GRID_DY;
  const z = ((row + col) % 2 === 0 ? 1 : -1) * GRID_Z_JITTER;
  return [x, y, z];
}

function slotsToPreviews(slots: ModelSlot[]): LibraryModelPreview[] {
  const resolved = slots.flatMap((slot) => {
    const pack = manifest.packs.find((item) => item.id === slot.packId);
    const model = pack?.models.find((item) => item.name === slot.name);
    if (!pack || !model) return [];
    const optimized = downloadsForModel(model).find((download) => download.optimized);
    const file = RAW_TEXTURE_PACKS.has(slot.packId)
      ? model.file
      : optimized?.file ?? model.file;
    return [{ slot, pack, model, file }];
  });

  const total = resolved.length;
  return resolved.map(({ slot, pack, model, file }, index) => {
    const maxDim = Math.max(model.size[0], model.size[1], model.size[2]) || 1;
    const scale = (GRID_TARGET_SIZE / maxDim) * (slot.scaleBoost ?? 1);
    const [gx, gy, gz] = layoutGridCell(index, total);
    // Vertically center the model's bbox on its grid row. Source models ground
    // at wildly different minY (a fish bbox sits below its pivot), so center by
    // the box midpoint rather than the pivot.
    const centerY = model.minY + model.size[1] / 2;
    const spinSpeed =
      (0.22 + ((index * 37) % 13) / 80) * (index % 2 === 0 ? 1 : -1);
    const spinPhase = ((index * 137) % 360) * (Math.PI / 180);
    return {
      label: model.title,
      file,
      source: pack.source,
      minY: model.minY,
      position: [gx, gy - centerY * scale, gz] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      scale,
      spinSpeed,
      spinPhase,
    };
  });
}

function selectFeaturedModels(): LibraryModelPreview[] {
  return slotsToPreviews(HERO_MODEL_SLOTS);
}

function selectTrackModels(): LibraryModelPreview[] {
  return slotsToPreviews(TRACK_MODEL_SLOTS);
}

function landingSpriteScore(
  pack: ArtPack,
  sample: ArtSample,
  slot: SpriteSlot,
): number {
  const text = `${pack.title} ${pack.theme} ${sample.label} ${sample.path}`.toLowerCase();
  let score = 0;
  if (slot.requireAnimated && !sample.animated) return -Infinity;
  if (sample.animated) score += 40;
  if (slot.preferKinds?.includes(sample.kind)) score += 50;
  if (slot.category === "character") {
    if (isLikelySpriteSheetPath(sample.path)) score += 40;
    if (/strip[\s_-]*\d{1,2}/i.test(sample.path)) score += 24;
    if (/\b(idle|walk|run|hero|knight|archer|warrior|character)\b/i.test(text)) score += 18;
  }
  if (slot.category === "environment") {
    if (/\b(background|parallax|tileset|tilemap|scene|biome|plains|forest|cave|mine|mountain|island|town|city)\b/i.test(text))
      score += 40;
    if (/\b(front|mid|midground|foreground)\b/i.test(text)) score += 30;
    if (/back[\s_-]?\d.*(front|mid)/i.test(sample.path)) score += 20;
    if (/\b(sky|cloud|stars|moon)\b/i.test(text)) score -= 18;
    if (/preview|sprite|animation|attack|idle|walk|run|jump|crouch|hurt|roll/i.test(text)) score -= 30;
    if (/coupon|sale|promo|trap|pedestal|supplies|object|item|prop|full\.png/i.test(text)) score -= 40;
    if (sample.animated) score -= 18;
    if (/\.gif($|[?#])/i.test(sample.path)) score -= 30;
  }
  if (slot.category === "icons") {
    if (/\b(icon|coin|gem|diamond|heart|potion|key|item|inventory|hud|button)\b/i.test(text))
      score += 22;
    if (/\.gif($|[?#])/i.test(sample.path)) score += 8;
  }
  if (/\.png($|[?#])/i.test(sample.path)) score += 12;
  if (isLikelyMarketingPreviewPath(sample.path) || /all free|all animations|all attacks/i.test(text))
    score -= 50;
  return score;
}

function selectSpritesForSlots(slots: SpriteSlot[]): LibrarySpritePreview[] {
  const selected: LibrarySpritePreview[] = [];
  const usedPacks = new Set<string>();

  for (const slot of slots) {
    const candidates = catalog.artPacks
      .filter((summary) => slot.themes.includes(summary.theme))
      .flatMap((summary) => {
        const pack = findArtPack(summary.folder);
        if (!pack) return [];
        return pack.samples.map((sample) => ({ pack, sample, score: landingSpriteScore(pack, sample, slot) }));
      })
      .filter((item) => Number.isFinite(item.score))
      .sort((a, b) => b.score - a.score || a.sample.path.localeCompare(b.sample.path));
    const candidate =
      candidates.find((item) => !usedPacks.has(item.pack.folder)) ?? candidates[0];
    if (!candidate) continue;

    usedPacks.add(candidate.pack.folder);
    const rawLabel = candidate.sample.label?.trim() ?? "";
    const isGenericLabel = /^(sprite\s*sheet|spritesheet|character[\s_-]*spritesheet|tiles?|assets?|full|sheet)$/i.test(rawLabel);
    const displayLabel = isGenericLabel || rawLabel.length === 0 ? candidate.pack.title : rawLabel;
    selected.push({
      category: slot.category,
      categoryLabel: slot.label,
      title: candidate.pack.title,
      theme: candidate.pack.theme,
      label: displayLabel,
      kind: candidate.sample.kind,
      animated: candidate.sample.animated,
      path: candidate.sample.path,
      src: assetUrl(candidate.sample.src),
    });
  }

  return selected;
}

function selectFeaturedSprites(): LibrarySpritePreview[] {
  return selectSpritesForSlots(FEATURED_SPRITE_SLOTS);
}

function selectTrackSprites(): LibrarySpritePreview[] {
  return selectSpritesForSlots(TRACK_SPRITE_SLOTS);
}

function audioFor(path: string): { duration: number; loudness: number[] } | undefined {
  const entry = audioAnalysisItems[path];
  if (!entry?.loudness?.length) return undefined;
  return { duration: entry.duration ?? 0, loudness: entry.loudness };
}

function previewFromMusic(
  track: MusicTrack,
  tone: "music" | "jingle",
  collectionLabel: string,
): LibrarySoundPreview | undefined {
  const audio = audioFor(track.path);
  if (!audio) return undefined;
  return {
    title: cleanAudioLabel(track.title),
    source: track.source,
    path: track.path,
    duration: audio.duration,
    loudness: audio.loudness,
    tone,
    collectionLabel,
  };
}

function previewFromSound(
  sample: SoundSample,
  collection: SoundCollection,
  collectionLabel: string,
): LibrarySoundPreview | undefined {
  const audio = audioFor(sample.path);
  if (!audio) return undefined;
  return {
    title: cleanAudioLabel(sample.label),
    source: collection.source,
    path: sample.path,
    duration: audio.duration,
    loudness: audio.loudness,
    tone: "sfx",
    collectionLabel,
  };
}

function pickMusic(pick: FeaturedSoundPick): LibrarySoundPreview | undefined {
  const tracks = catalog.musicTracks;
  const candidates = pick.matchTitle
    ? tracks.filter((track) => track.title === pick.matchTitle)
    : pick.matchSource
      ? tracks.filter((track) => track.source === pick.matchSource)
      : tracks;
  for (const track of candidates) {
    const preview = previewFromMusic(track, pick.tone === "jingle" ? "jingle" : "music", pick.collectionLabel);
    if (preview) return preview;
  }
  return undefined;
}

function pickSfx(pick: FeaturedSoundPick): LibrarySoundPreview | undefined {
  for (const collection of catalog.soundCollections) {
    if (pick.matchPath && !collection.path.includes(pick.matchPath)) continue;
    for (const sample of collection.samples) {
      const preview = previewFromSound(sample, collection, pick.collectionLabel);
      if (preview) return preview;
    }
  }
  return undefined;
}

function selectFeaturedSounds(): LibrarySoundPreview[] {
  const picks: LibrarySoundPreview[] = [];
  const seen = new Set<string>();

  for (const pick of FEATURED_SOUND_PICKS) {
    const preview = pick.kind === "music" ? pickMusic(pick) : pickSfx(pick);
    if (preview && !seen.has(preview.path)) {
      seen.add(preview.path);
      picks.push(preview);
    }
  }

  if (picks.length < 3) {
    for (const track of catalog.musicTracks) {
      if (seen.has(track.path)) continue;
      const preview = previewFromMusic(track, "music", track.source);
      if (!preview) continue;
      seen.add(track.path);
      picks.push(preview);
      if (picks.length === 3) break;
    }
  }

  return picks.slice(0, 3);
}

function selectTrackSounds(): LibrarySoundPreview[] {
  const picks: LibrarySoundPreview[] = [];
  const seen = new Set<string>();

  for (const pick of TRACK_MUSIC_PICKS) {
    const preview = pickMusic(pick);
    if (preview && !seen.has(preview.path)) {
      seen.add(preview.path);
      picks.push(preview);
    }
  }

  if (picks.length < 5) {
    const sourcesUsed = new Set(picks.map((p) => p.source));
    const remaining = catalog.musicTracks.filter((track) => !seen.has(track.path));
    remaining.sort((a, b) => {
      const aNew = sourcesUsed.has(a.source) ? 1 : 0;
      const bNew = sourcesUsed.has(b.source) ? 1 : 0;
      if (aNew !== bNew) return aNew - bNew;
      return a.title.localeCompare(b.title);
    });
    for (const track of remaining) {
      const tone: "music" | "jingle" = track.source === "Kenney" ? "jingle" : "music";
      const label = track.source === "Kenney" ? "Kenney Jingles" : track.source;
      const preview = previewFromMusic(track, tone, label);
      if (!preview) continue;
      seen.add(track.path);
      sourcesUsed.add(track.source);
      picks.push(preview);
      if (picks.length === 5) break;
    }
  }

  return picks.slice(0, 5);
}

export default function HomePage() {
  const featuredModels = selectFeaturedModels();
  const featuredSprites = selectFeaturedSprites();
  const featuredSounds = selectFeaturedSounds();
  const trackModels = selectTrackModels();
  const trackSprites = selectTrackSprites();
  const trackSounds = selectTrackSounds();
  const totalModels = manifest.packs.reduce((n, p) => n + p.count, 0);
  const iconPackCount = catalog.artPacks.filter((pack) => pack.theme === "UI" || pack.theme === "Icons & Items").length;
  const spritePackCount = Math.max(mediaStats.artPackCount - iconPackCount, 0);
  const textureSourceCount = sourceMappings.filter((mapping) => mapping.medium === "texture").length;
  const textureGroupCount = textureSourceCount || 1;
  const textureGroupLabel = `${textureGroupCount} texture ${textureGroupCount === 1 ? "group" : "groups"}`;
  const totalMediaCollections =
    spritePackCount +
    iconPackCount +
    textureSourceCount +
    mediaStats.soundCollectionCount +
    mediaStats.musicTrackCount;

  return (
    <>
      <SiteHeader
        meta={
          <>
            {totalModels.toLocaleString()} models · {manifest.packs.length} pack collections ·{" "}
            {totalMediaCollections} media collections
          </>
        }
      />

      <main className="library-page">
        <section className="library-hero" aria-labelledby="library-heading">
          <div className="library-hero-copy">
            <div className="landing-kicker">GameDev Asset Library</div>
            <h2 id="library-heading">
              Search free, high-quality game assets, all in one place.
            </h2>
            <p>
              Browse models, sprites, textures, sounds, and music in one
              place, with previews so you can see and hear each asset before
              you download it.
            </p>
            <div className="library-actions" aria-label="Primary catalog actions">
              <Link className="landing-button primary" href="/models">
                Browse 3D
              </Link>
              <Link className="landing-button primary" href="/media?view=art&type=all">
                Browse 2D
              </Link>
              <Link className="landing-button primary" href="/media?view=sounds&type=all">
                Browse sounds
              </Link>
            </div>
          </div>
          <LibraryHeroShowreel models={featuredModels} sprites={featuredSprites} sounds={featuredSounds} />
        </section>

        <LibraryAssetTracks
          modelCount={totalModels}
          packCount={manifest.packs.length}
          spritePackCount={spritePackCount}
          spriteSampleCount={mediaStats.artSampleCount}
          iconPackCount={iconPackCount}
          textureGroupLabel={textureGroupLabel}
          soundCollectionCount={mediaStats.soundCollectionCount}
          soundSampleCount={mediaStats.soundSampleCount}
          musicTrackCount={mediaStats.musicTrackCount}
          models={trackModels}
          sprites={trackSprites}
          sounds={trackSounds}
        />
      </main>
    </>
  );
}
