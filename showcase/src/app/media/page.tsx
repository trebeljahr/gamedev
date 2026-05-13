import { MediaExplorer } from "@/components/MediaExplorer";
import { artPacks, musicTracks, soundCollections } from "@/lib/media";

type MediaPageProps = {
  searchParams?: Promise<{
    view?: string | string[];
  }>;
};

function mediaViewFromParam(value: string | string[] | undefined) {
  const view = Array.isArray(value) ? value[0] : value;
  return view === "art" ? "art" : "sounds";
}

export default async function MediaPage({ searchParams }: MediaPageProps) {
  const params = await searchParams;

  return (
    <MediaExplorer
      soundCollections={soundCollections}
      musicTracks={musicTracks}
      artPacks={artPacks}
      initialView={mediaViewFromParam(params?.view)}
    />
  );
}
