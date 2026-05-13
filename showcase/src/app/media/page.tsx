import { MediaExplorer } from "@/components/MediaExplorer";
import { artPacks, musicTracks, soundCollections } from "@/lib/media";

type MediaPageProps = {
  searchParams?: Promise<{
    view?: string | string[];
    type?: string | string[];
    subject?: string | string[];
    motion?: string | string[];
  }>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function mediaViewFromParam(value: string | string[] | undefined) {
  const view = firstParam(value);
  return view === "art" ? "art" : "sounds";
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
      initialView={view}
      initialArtType={type === "ui-icons" || type === "spritesheets" ? type : "all"}
      initialSpriteSubject={
        subject === "characters" || subject === "environments" || subject === "effects-items" || subject === "other"
          ? subject
          : "all"
      }
      initialSpriteMotion={motion === "animated" || motion === "static" ? motion : "all"}
      initialSoundType={type === "music" || type === "all" ? type : "sfx"}
    />
  );
}
