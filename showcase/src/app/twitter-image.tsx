import { ImageResponse } from "next/og";
import { manifest } from "@/lib/manifest";
import { mediaStats } from "@/lib/media";
import { OG_IMAGE_SIZE, ShowcaseOgImage } from "@/lib/og-image";

export const alt = "GameDev Asset Library preview";
export const size = OG_IMAGE_SIZE;
export const contentType = "image/png";

export default function Image() {
  const totalModels = manifest.packs.reduce((sum, pack) => sum + pack.count, 0);
  const mediaCollections =
    mediaStats.artPackCount + mediaStats.soundCollectionCount + mediaStats.musicTrackCount;

  return new ImageResponse(
    (
      <ShowcaseOgImage
        eyebrow="Free game asset catalog"
        title="GameDev Asset Library"
        subtitle="A searchable browser catalog for 3D models, 2D art, sound effects, music, and license research."
        stats={[
          `${totalModels.toLocaleString("en-US")} models`,
          `${manifest.packs.length} packs`,
          `${mediaCollections} media collections`,
        ]}
      />
    ),
    OG_IMAGE_SIZE,
  );
}
