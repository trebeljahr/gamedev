import type { Metadata } from "next";
import { ModelCatalog } from "@/components/ModelCatalog";
import { manifest } from "@/lib/manifest";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Game-Ready 3D Model Library",
  description:
    "Search thousands of free 3D game models with browser previews and GLB, glTF, FBX, and OBJ downloads, creator links, tags, and license metadata.",
  pathname: "/models",
});

export default function ModelsPage() {
  // Render the first screen on the server. Search and filters load the full
  // catalog from the existing static JSON instead of duplicating it in HTML.
  let remaining = 120;
  const preview = {
    packs: manifest.packs.map((pack) => {
      const models = pack.models.slice(0, remaining);
      remaining -= models.length;
      return { ...pack, models };
    }),
  };
  return <ModelCatalog manifest={preview} loadFullCatalog />;
}
