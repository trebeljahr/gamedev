import { ModelCatalog } from "@/components/ModelCatalog";
import { manifest } from "@/lib/manifest";

export default function ModelsPage() {
  return <ModelCatalog manifest={manifest} />;
}
