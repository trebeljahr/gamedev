import { ImageResponse } from "next/og";
import { licenseForVendor } from "@/lib/license";
import { findPack } from "@/lib/manifest";
import { OG_IMAGE_SIZE, ShowcaseOgImage } from "@/lib/og-image";

export const alt = "3D model pack preview";
export const size = OG_IMAGE_SIZE;
export const contentType = "image/png";

type Props = { params: Promise<{ vendor: string; pack: string }> };

export default async function Image({ params }: Props) {
  const { vendor, pack } = await params;
  const data = findPack(vendor, pack);
  const credit = licenseForVendor(vendor);
  const categories = data?.categories.slice(0, 3).join(", ") || "3D";

  return new ImageResponse(
    (
      <ShowcaseOgImage
        eyebrow="3D model pack"
        title={data?.title ?? "Game Asset Pack"}
        subtitle={
          data
            ? `${data.count.toLocaleString("en-US")} game-ready ${categories} models by ${credit.vendorLabel}. Preview, inspect, and download.`
            : "Preview downloadable game-ready 3D models with source links and license context."
        }
        stats={[
          data ? `${data.count.toLocaleString("en-US")} models` : "3D models",
          credit.vendorLabel,
          data?.license ?? credit.license,
        ]}
      />
    ),
    OG_IMAGE_SIZE,
  );
}
