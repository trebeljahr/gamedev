import type { Metadata } from "next";
import { MediaExplorerFromUrl } from "@/components/MediaExplorerFromUrl";
import { artCreators, artPackSummaries, musicTracks, soundCollections, sourceMappings } from "@/lib/media";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "2D Sprites, Sound Effects, and Game Music",
  description:
    "Explore free pixel art, sprite sheets, textures, sound effects, and music collections with source and license context for games.",
  pathname: "/media",
});

export default function MediaPage() {
  return (
    <MediaExplorerFromUrl
      soundCollections={soundCollections}
      musicTracks={musicTracks}
      artPacks={artPackSummaries}
      sourceMappings={sourceMappings}
      artCreators={artCreators}
    />
  );
}
