"use client";

import Link from "next/link";
import { LandingModelBackdrop } from "@/components/LandingModelBackdrop";
import {
  SoundSignal,
  SpriteLoop,
  type LibraryModelPreview,
  type LibrarySoundPreview,
  type LibrarySpritePreview,
} from "@/components/LibraryHeroShowreel";

type LibraryAssetTracksProps = {
  modelCount: number;
  packCount: number;
  spritePackCount: number;
  spriteSampleCount: number;
  iconPackCount: number;
  textureGroupLabel: string;
  soundCollectionCount: number;
  soundSampleCount: number;
  musicTrackCount: number;
  models: LibraryModelPreview[];
  sprites: LibrarySpritePreview[];
  sounds: LibrarySoundPreview[];
};

export function LibraryAssetTracks({
  modelCount,
  packCount,
  spritePackCount,
  spriteSampleCount,
  iconPackCount,
  textureGroupLabel,
  soundCollectionCount,
  soundSampleCount,
  musicTrackCount,
  models,
  sprites,
  sounds,
}: LibraryAssetTracksProps) {
  return (
    <section className="library-tracks" aria-labelledby="library-tracks-heading">
      <header className="library-tracks-intro">
        <div className="landing-kicker">What&rsquo;s inside</div>
        <h2 id="library-tracks-heading">
          Three asset tracks, one searchable archive.
        </h2>
        <p>
          Pick the medium you need. Each track has its own previews,
          filters, and downloads, so you&rsquo;re not scrolling past
          unrelated formats to get there.
        </p>
      </header>

      <article className="library-track" data-track="3d">
        <div className="library-track-copy">
          <div className="landing-kicker">3D models</div>
          <h3>Game-ready 3D models, props &amp; rigs</h3>
          <p>
            {modelCount.toLocaleString()} game-ready 3D models across{" "}
            {packCount} packs, covering characters, vehicles, props, and
            full environment kits. Scale stays consistent across vendors,
            shadows are pre-baked, and files import cleanly into Three.js,
            Unity, Godot, or Blender.
          </p>
          <ul className="library-track-bullets">
            <li>Live in-browser 3D previews with orbit + animation playback</li>
            <li>Download as GLB, glTF, FBX, or OBJ &mdash; most models ship in all four</li>
            <li>Filter by category, theme, animated vs static, license</li>
            <li>{textureGroupLabel} for PBR materials and decals</li>
          </ul>
          <div className="library-track-actions">
            <Link className="landing-button primary" href="/models">
              Browse 3D models
            </Link>
            <Link className="landing-button secondary" href="/all">
              Open world viewer
            </Link>
          </div>
          <p className="library-track-tooling">
            Bringing your own FBX or OBJ? The GLBs in this catalog were baked with{" "}
            <a
              href="https://github.com/trebeljahr/conv3d"
              target="_blank"
              rel="noreferrer"
            >
              conv3d
            </a>
            , a small CLI that converts 3D sources to optimized GLB plus R3F components.
          </p>
        </div>
        <div className="library-track-visual library-track-visual--3d">
          <LandingModelBackdrop
            models={models}
            cameraPosition={[2.5, 4, 5.8]}
            fov={42}
            contactShadowScale={18}
          />
          <div className="library-tile-chip library-tile-chip--floating" data-tone="model">
            <span>3D</span>
            <strong>{models.length} live models</strong>
          </div>
          <div className="library-model-glow" aria-hidden="true" />
        </div>
      </article>

      <article className="library-track" data-track="2d">
        <div className="library-track-visual library-track-visual--2d">
          <div className="library-tile-rack library-tile-rack--wide">
            {sprites.map((sample, index) => (
              <SpriteLoop key={`${sample.path}-${index}`} sample={sample} index={index} />
            ))}
          </div>
        </div>
        <div className="library-track-copy">
          <div className="landing-kicker">2D art</div>
          <h3>Animated sprite sheets, tilesets &amp; UI</h3>
          <p>
            {spriteSampleCount.toLocaleString()} sprite samples across{" "}
            {spritePackCount} sprite packs and {iconPackCount} icon/UI kits.
            Frame strips are auto-parsed, so animations preview straight in
            the catalog before you download anything.
          </p>
          <ul className="library-track-bullets">
            <li>Character rigs with idle, walk, attack, hurt cycles</li>
            <li>Environment tilesets, parallax backgrounds, FX strips</li>
            <li>Icon packs, button kits, and pixel-perfect UI elements</li>
          </ul>
          <div className="library-track-actions">
            <Link className="landing-button primary" href="/media?view=art&type=all">
              Browse 2D art
            </Link>
          </div>
        </div>
      </article>

      <article className="library-track" data-track="sounds">
        <div className="library-track-copy">
          <div className="landing-kicker">Sounds &amp; music</div>
          <h3>Music tracks &amp; sound effects, pre-analyzed</h3>
          <p>
            {musicTrackCount} music tracks and {soundCollectionCount} sound
            collections totaling {soundSampleCount.toLocaleString()}{" "}
            effects. Waveforms, durations, and tags are pre-computed, so
            you can audition a loop and check its loudness shape before
            committing to a download.
          </p>
          <ul className="library-track-bullets">
            <li>Music loops with tempo, mood, and use-case tags</li>
            <li>SFX collections for movement, combat, UI, ambience</li>
            <li>Filter by length, license, and source pack</li>
          </ul>
          <div className="library-track-actions">
            <Link className="landing-button primary" href="/media?view=sounds&type=all">
              Browse sounds
            </Link>
          </div>
        </div>
        <div className="library-track-visual library-track-visual--sounds">
          <SoundSignal sounds={sounds} limit={5} chipLabel="Music & SFX" colorByIndex />
        </div>
      </article>
    </section>
  );
}
