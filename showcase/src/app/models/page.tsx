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
  return <ModelCatalog manifest={manifest} />;
}
