import type { Metadata } from "next";
import { ArtAssetPage } from "@/components/ArtAssetPage";

// One page serves every `/media/2d/<pack>/<asset>` URL: the static export
// proxies them all here (`_redirects`, written by scripts/build-static-site.ts;
// a rewrite in development). 40,000 prerendered pages would pass the hosting
// limit of 20,000 files per version, so the asset is resolved in the browser.
export const metadata: Metadata = {
  title: "2D Asset",
  description: "A single 2D asset with its pack, creator and license.",
  // No canonical here: this HTML answers for every asset URL. The page sets
  // its own canonical link once it knows which asset it shows.
  alternates: {},
};

export default function Art2DAssetPage() {
  return <ArtAssetPage />;
}
