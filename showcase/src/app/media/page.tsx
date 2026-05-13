import { MediaExplorer } from "@/components/MediaExplorer";
import { artPacks, musicTracks, soundCollections, sourceMappings } from "@/lib/media";

type MediaPageProps = {
  searchParams?: Promise<{
    view?: string | string[];
  }>;
};

function mediaViewFromParam(value: string | string[] | undefined) {
  const view = Array.isArray(value) ? value[0] : value;
  if (view === "sources") return "sources";
  return view === "art" ? "art" : "sounds";
}

export default async function MediaPage({ searchParams }: MediaPageProps) {
  const params = await searchParams;

  return (
    <MediaExplorer
      soundCollections={soundCollections}
      musicTracks={musicTracks}
      artPacks={artPacks}
      sourceMappings={sourceMappings}
      initialView={mediaViewFromParam(params?.view)}
    />
  );
}
