import type { Metadata } from "next";
import { ModelCatalog } from "@/components/ModelCatalog";
import { manifest } from "@/lib/manifest";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Search 3D Models",
  description:
    "Search every game-ready 3D model in the archive with browser previews, downloads, creator links, and license metadata.",
  pathname: "/models",
});

export default function ModelsPage() {
  return <ModelCatalog manifest={manifest} />;
}
