import Link from "next/link";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { downloadsForModel, manifest } from "@/lib/manifest";
import fs from "node:fs";
import path from "node:path";
import { catalog, findArtPack, mediaStats, sourceMappings } from "@/lib/media";
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
  scale: number;
  yLift?: number;
  floats?: boolean;
};

const HERO_MODEL_SLOTS: ModelSlot[] = [
  { packId: "kaykit/medieval-builder-pack", name: "castle", scale: 0.3 },
  { packId: "kaykit/medieval-builder-pack", name: "barracks", scale: 0.32 },
  { packId: "kaykit/medieval-builder-pack", name: "bridge", scale: 0.32 },
  { packId: "kaykit/adventurers", name: "barbarian", scale: 0.32 },
  { packId: "kaykit/adventurers", name: "knight", scale: 0.32 },
  { packId: "kaykit/adventurers", name: "mage", scale: 0.32 },
  { packId: "kaykit/adventurers", name: "ranger", scale: 0.32 },
  { packId: "kaykit/adventurers", name: "rogue", scale: 0.32 },
  { packId: "kaykit/skeletons", name: "skeleton-minion", scale: 0.5 },
  { packId: "kaykit/skeletons", name: "skeleton-mage", scale: 0.5 },
  { packId: "kenney/cube-pets", name: "animal-bunny", scale: 0.34 },
  { packId: "kenney/cube-pets", name: "animal-cat", scale: 0.34 },
  { packId: "kenney/cube-pets", name: "animal-fox", scale: 0.34 },
  { packId: "kenney/cube-pets", name: "animal-tiger", scale: 0.34 },
  { packId: "kenney/car-kit", name: "ambulance", scale: 0.4 },
  { packId: "quaternius/animated-robot-oct-2018", name: "robot", scale: 0.22 },
  { packId: "quaternius/cube-world-aug-2023", name: "skeleton", scale: 0.45 },
  { packId: "quaternius/ultimate-space-kit-march-2023", name: "astronaut-barbarathebee", scale: 0.36 },
  { packId: "quaternius/spaceships-by-quaternius", name: "spaceship3", scale: 0.16, floats: true, yLift: 2.4 },
  { packId: "quaternius/spaceships-by-quaternius", name: "spaceship", scale: 0.14, floats: true, yLift: 2.8 },
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

const TRACK_MODEL_SLOTS: ModelSlot[] = [
  { packId: "kaykit/medieval-builder-pack", name: "castle", scale: 0.3 },
  { packId: "kaykit/medieval-builder-pack", name: "barracks", scale: 0.32 },
  { packId: "kaykit/medieval-builder-pack", name: "farm-plot", scale: 0.34 },
  { packId: "kaykit/adventurers", name: "knight", scale: 0.34 },
  { packId: "kaykit/adventurers", name: "mage", scale: 0.34 },
  { packId: "kaykit/adventurers", name: "ranger", scale: 0.34 },
  { packId: "kaykit/skeletons", name: "skeleton-blade", scale: 0.5 },
  { packId: "kenney/cube-pets", name: "animal-elephant", scale: 0.34 },
  { packId: "kenney/cube-pets", name: "animal-giraffe", scale: 0.32 },
  { packId: "kenney/cube-pets", name: "animal-monkey", scale: 0.34 },
  { packId: "kenney/cube-pets", name: "animal-penguin", scale: 0.34 },
  { packId: "kenney/cube-pets", name: "animal-cow", scale: 0.34 },
  { packId: "kenney/car-kit", name: "sedan-sports", scale: 0.42 },
  { packId: "kenney/car-kit", name: "police", scale: 0.42 },
  { packId: "quaternius/animated-robot-oct-2018", name: "robot", scale: 0.22 },
  { packId: "quaternius/cube-world-aug-2023", name: "character-male-1", scale: 0.45 },
  { packId: "quaternius/cube-world-aug-2023", name: "cat", scale: 0.45 },
  { packId: "quaternius/ultimate-space-kit-march-2023", name: "astronaut-fernandotheflamingo", scale: 0.36 },
  { packId: "quaternius/spaceships-by-quaternius", name: "spaceship2", scale: 0.16, floats: true, yLift: 2.4 },
  { packId: "quaternius/ultimate-fantasy-rts-aug-2022", name: "archery-firstage-level1", scale: 0.4 },
];

const TRACK_MUSIC_PICKS: FeaturedSoundPick[] = [
  { kind: "music", tone: "music", collectionLabel: "Kevin MacLeod", matchTitle: "Clash Defiant" },
  { kind: "music", tone: "music", collectionLabel: "Kevin MacLeod", matchTitle: "Magic Forest" },
  { kind: "music", tone: "music", collectionLabel: "Kevin MacLeod", matchTitle: "Peppers Theme" },
  { kind: "music", tone: "music", collectionLabel: "Kevin MacLeod", matchTitle: "Midnight Tale" },
  { kind: "music", tone: "jingle", collectionLabel: "Kenney Jingles", matchTitle: "Jingles Hit 03" },
];

const GROUNDED_Y = -0.78;
const GROUND_RING_RADII = [1.7, 3.2, 4.7] as const;
const GROUND_RING_COUNTS = [5, 7, 6] as const;
const FLOAT_X_POSITIONS = [-3.4, 3.6] as const;
const FLOAT_Z_POSITIONS = [-2.6, -1.4] as const;

function layoutGroundedSlot(index: number): {
  position: [number, number, number];
  rotation: [number, number, number];
} {
  let remaining = index;
  let ring = 0;
  for (; ring < GROUND_RING_COUNTS.length; ring += 1) {
    if (remaining < GROUND_RING_COUNTS[ring]) break;
    remaining -= GROUND_RING_COUNTS[ring];
  }
  const safeRing = Math.min(ring, GROUND_RING_COUNTS.length - 1);
  const count = GROUND_RING_COUNTS[safeRing];
  const radius = GROUND_RING_RADII[safeRing];
  const arcStart = -(Math.PI * 0.62);
  const arcEnd = Math.PI * 0.42;
  const t = (count as number) <= 1 ? 0.5 : remaining / (count - 1);
  const ringOffset = safeRing % 2 === 0 ? 0 : (arcEnd - arcStart) / count / 2;
  const angle = arcStart + (arcEnd - arcStart) * t + ringOffset;
  const x = Math.cos(angle) * radius;
  const z = Math.sin(angle) * radius * 0.55 + (safeRing === 0 ? 0.4 : 0);
  const rotY = Math.atan2(4.5 - x, 8.5 - z) + (((index * 73) % 17) - 8) / 70;
  return {
    position: [x, GROUNDED_Y, z],
    rotation: [0, rotY, 0],
  };
}

function layoutFloatingSlot(
  index: number,
  yLift: number,
): {
  position: [number, number, number];
  rotation: [number, number, number];
} {
  const x = FLOAT_X_POSITIONS[index % FLOAT_X_POSITIONS.length];
  const z = FLOAT_Z_POSITIONS[index % FLOAT_Z_POSITIONS.length];
  const rotY = Math.atan2(4.5 - x, 8.5 - z) - 0.4;
  return {
    position: [x, GROUNDED_Y + yLift, z],
    rotation: [-0.12, rotY, 0.06],
  };
}

function slotsToPreviews(slots: ModelSlot[]): LibraryModelPreview[] {
  let groundedIndex = 0;
  let floatingIndex = 0;
  return slots.flatMap((slot, slotIndex) => {
    const pack = manifest.packs.find((item) => item.id === slot.packId);
    const model = pack?.models.find((item) => item.name === slot.name);
    if (!pack || !model) return [];
    const optimized = downloadsForModel(model).find((download) => download.optimized);
    const placement = slot.floats
      ? layoutFloatingSlot(floatingIndex++, slot.yLift ?? 2.4)
      : layoutGroundedSlot(groundedIndex++);
    const spinSpeed =
      (0.045 + ((slotIndex * 31) % 11) / 110) * (slotIndex % 2 === 0 ? 1 : -1);
    const spinPhase = ((slotIndex * 97) % 360) * (Math.PI / 180);
    return {
      label: model.title,
      file: optimized?.file ?? model.file,
      source: pack.source,
      minY: model.minY,
      position: placement.position,
      rotation: placement.rotation,
      scale: slot.scale,
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
    title: track.title,
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
    title: sample.label,
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
              Search free, hand-picked, high-quality game assets with permissive licenses, all in one place.
            </h2>
            <p>
              Models, sprites, textures, sounds, and music sit behind the
              same search and filters, so you can jump between them in a
              single click instead of opening five different sites.
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
