import { ImageResponse } from "next/og";
import { licenseForVendor } from "@/lib/license";
import { manifest } from "@/lib/manifest";
import { OG_IMAGE_SIZE, ShowcaseOgImage } from "@/lib/og-image";

export const alt = "Game asset creator preview";
export const size = OG_IMAGE_SIZE;
export const contentType = "image/png";

type Props = { params: Promise<{ vendor: string }> };

export default async function Image({ params }: Props) {
  const { vendor } = await params;
  const packs = manifest.packs.filter((pack) => pack.vendor === vendor);
  const credit = licenseForVendor(vendor);
  const totalModels = packs.reduce((sum, pack) => sum + pack.count, 0);

  return new ImageResponse(
    (
      <ShowcaseOgImage
        eyebrow="Creator collection"
        title={credit.vendorLabel}
        subtitle={`Browse ${packs.length} asset packs and ${totalModels.toLocaleString("en-US")} downloadable 3D models with source and license context.`}
        stats={[
          `${packs.length} packs`,
          `${totalModels.toLocaleString("en-US")} models`,
          credit.license,
        ]}
      />
    ),
    OG_IMAGE_SIZE,
  );
}
