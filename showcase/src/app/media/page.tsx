import { MediaExplorer } from "@/components/MediaExplorer";
import { artPacks, musicTracks, soundCollections } from "@/lib/media";

export default function MediaPage() {
  return (
    <MediaExplorer
      soundCollections={soundCollections}
      musicTracks={musicTracks}
      artPacks={artPacks}
    />
  );
}
