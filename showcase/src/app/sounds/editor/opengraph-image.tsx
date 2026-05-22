import { ImageResponse } from "next/og";
import { OG_IMAGE_SIZE, ShowcaseOgImage } from "@/lib/og-image";

export const alt = "Trim MP3 in browser, cut audio online, and speed up audio web";
export const size = OG_IMAGE_SIZE;
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <ShowcaseOgImage
        eyebrow="Browser audio editor"
        title="Trim MP3 in browser"
        subtitle="Cut audio online, change speed, and export MP3 or WAV locally with a Web Worker."
        stats={["No login", "No upload", "MP3 worker export"]}
      />
    ),
    OG_IMAGE_SIZE,
  );
}
