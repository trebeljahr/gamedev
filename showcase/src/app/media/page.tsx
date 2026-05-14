import type { Metadata } from "next";
import { MediaExplorer } from "@/components/MediaExplorer";
import { artPacks, musicTracks, soundCollections, sourceMappings } from "@/lib/media";
import { pageMetadata } from "@/lib/seo";

type MediaPageProps = {
  searchParams?: Promise<{
    view?: string | string[];
    type?: string | string[];
    subject?: string | string[];
    motion?: string | string[];
  }>;
};

export const metadata: Metadata = pageMetadata({
  title: "2D Sprites, Sound Effects, and Game Music",
  description:
    "Explore free pixel art, sprite sheets, textures, sound effects, and music collections with source and license context for games.",
  pathname: "/media",
});

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function mediaViewFromParam(value: string | string[] | undefined) {
  const view = firstParam(value);
  if (view === "art") return "art";
  if (view === "textures" || view === "sources") return "sources";
  return "sounds";
}

export default async function MediaPage({ searchParams }: MediaPageProps) {
  const params = await searchParams;
  const view = mediaViewFromParam(params?.view);
  const type = firstParam(params?.type);
  const subject = firstParam(params?.subject);
  const motion = firstParam(params?.motion);

  return (
    <MediaExplorer
      soundCollections={soundCollections}
      musicTracks={musicTracks}
      artPacks={artPacks}
      sourceMappings={sourceMappings}
      initialView={view}
      initialArtType={type === "ui-icons" || type === "spritesheets" ? type : "all"}
      initialSpriteSubject={
        subject === "characters" || subject === "environments" || subject === "effects-items" || subject === "other"
          ? subject
          : "all"
      }
      initialSpriteMotion={motion === "animated" || motion === "static" ? motion : "all"}
      initialSoundType={type === "music" || type === "sfx" || type === "all" ? type : "all"}
    />
  );
}
