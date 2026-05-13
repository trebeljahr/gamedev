import { existsSync } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { inferArtKind, isAnimatedArtPath, selectRepresentativeArtSamples } from "../src/lib/media-inference";

const SHOWCASE_DIR = join(__dirname, "..");
const REPO_ROOT = join(SHOWCASE_DIR, "..");
const ASSETS_ROOT = process.env.ASSETS_DIR
  ? process.env.ASSETS_DIR
  : join(REPO_ROOT, "assets");
const OUT = join(SHOWCASE_DIR, "src", "lib", "media-assets.json");

type ArtSample = {
  packFolder: string;
  path: string;
  src: string;
  label: string;
  kind: "character" | "sprite" | "icon" | "tile" | "effect" | "ui" | "image";
  animated: boolean;
};

type SoundSample = {
  collectionId: string;
  path: string;
  src: string;
  label: string;
  kind: "movement" | "combat" | "ui" | "ambient" | "effect";
};

async function walk(dir: string, predicate: (path: string, name: string) => boolean): Promise<string[]> {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop()!;
    for (const entry of await readdir(d, { withFileTypes: true })) {
      const p = join(d, entry.name);
      if (entry.isDirectory()) stack.push(p);
      else if (entry.isFile() && predicate(p, entry.name)) out.push(p);
    }
  }
  return out;
}

function humanize(s: string): string {
  return s
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\s+/g, " ")
    .trim();
}

function isJunkPath(path: string): boolean {
  return /(^|\/)(__MACOSX|\.DS_Store)(\/|$)/i.test(path) || /(^|\/)\._/.test(path);
}

function labelFromAssetPath(path: string): string {
  return humanize(
    path
      .split("/")
      .pop()!
      .replace(/\.[^.]+$/i, "")
      .replace(/^\d+__.+?__/, ""),
  );
}

function inferSoundKind(path: string): SoundSample["kind"] {
  const lower = path.toLowerCase();
  if (/(footstep|step|walk|run|jump|movement|grass|gravel)/.test(lower)) return "movement";
  if (/(hit|impact|slash|attack|weapon|arrow|explosion|laser|shoot|hurt|damage)/.test(lower)) return "combat";
  if (/(ui|click|button|select|menu|confirm|coin|pickup|notification)/.test(lower)) return "ui";
  if (/(ambient|ambience|wind|rain|forest|water|loop|room|drone)/.test(lower)) return "ambient";
  return "effect";
}

function scoreSoundSample(path: string): number {
  const lower = path.toLowerCase();
  let score = 0;
  if (/\.(wav|ogg|mp3)$/i.test(path)) score += 8;
  if (/(preview|sample|click|hit|impact|step|jump|attack|pickup|coin|spell|explosion|ambience|ambient)/.test(lower)) score += 10;
  if (/(readme|license)/.test(lower)) score -= 20;
  return score;
}

async function main() {
  const artRoot = join(ASSETS_ROOT, "2D");
  const soundRoot = join(ASSETS_ROOT, "sounds");
  const artSamples: ArtSample[] = [];
  const soundSamples: SoundSample[] = [];

  if (existsSync(artRoot)) {
    const packDirs = (await readdir(artRoot, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();

    for (const packFolder of packDirs) {
      const packDir = join(artRoot, packFolder);
      const images = await walk(
        packDir,
        (path, name) => !isJunkPath(path) && /\.(png|jpe?g|webp|gif)$/i.test(name),
      );
      const relImages = images.map((abs) => relative(ASSETS_ROOT, abs).split("/").join("/"));
      for (const rel of selectRepresentativeArtSamples(relImages, 8)) {
        const kind = inferArtKind(rel);
        artSamples.push({
          packFolder,
          path: rel,
          src: `/${rel.split("/").map(encodeURIComponent).join("/")}`,
          label: labelFromAssetPath(rel),
          kind,
          animated: isAnimatedArtPath(rel),
        });
      }
    }
  }

  if (existsSync(soundRoot)) {
    const sounds = await walk(
      soundRoot,
      (path, name) => !isJunkPath(path) && /\.(mp3|wav|ogg|m4a|flac|opus)$/i.test(name),
    );
    const byCollection = new Map<string, string[]>();
    for (const abs of sounds) {
      const rel = relative(ASSETS_ROOT, abs).split("/").join("/");
      if (rel.startsWith("sounds/music/")) continue;
      const parts = rel.split("/");
      const collectionId = parts.length >= 3 ? `${parts[0]}/${parts[1]}/**` : `${parts.slice(0, -1).join("/")}/**`;
      const list = byCollection.get(collectionId) ?? [];
      list.push(abs);
      byCollection.set(collectionId, list);
    }

    for (const [collectionId, files] of [...byCollection.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      for (const abs of files
        .sort((a, b) => scoreSoundSample(b) - scoreSoundSample(a) || a.localeCompare(b))
        .slice(0, 12)) {
        const rel = relative(ASSETS_ROOT, abs).split("/").join("/");
        soundSamples.push({
          collectionId,
          path: rel,
          src: `/${rel.split("/").map(encodeURIComponent).join("/")}`,
          label: labelFromAssetPath(rel),
          kind: inferSoundKind(rel),
        });
      }
    }
  }

  if (!existsSync(artRoot) && !existsSync(soundRoot) && existsSync(OUT)) {
    console.warn(`[media-assets] no assets found at ${ASSETS_ROOT}; keeping existing ${relative(SHOWCASE_DIR, OUT)}`);
    return;
  }

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify({ artSamples, soundSamples }, null, 2)}\n`);
  console.log(`[media-assets] ${artSamples.length} art samples · ${soundSamples.length} sound samples`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
