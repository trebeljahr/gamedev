import { AllModelsWorld } from "@/components/AllModelsWorld";
import { SiteHeader } from "@/components/SiteHeader";
import { manifest } from "@/lib/manifest";

export default function AllModelsPage() {
  const totalModels = manifest.packs.reduce((n, p) => n + p.count, 0);

  return (
    <div className="all-scene-shell">
      <SiteHeader
        compact
        meta={
          <>
            {totalModels.toLocaleString()} models · {manifest.packs.length} pack collections
          </>
        }
      />
      <div className="all-scene-canvas">
        <AllModelsWorld />
      </div>
    </div>
  );
}
