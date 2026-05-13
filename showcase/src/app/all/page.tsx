"use client";

import dynamic from "next/dynamic";
import { SiteHeader } from "@/components/SiteHeader";
import { manifest } from "@/lib/manifest";

const AllModelsScene = dynamic(
  () => import("@/components/AllModelsScene").then((m) => m.AllModelsScene),
  { ssr: false, loading: () => <div style={{ padding: 24 }}>Loading scene…</div> },
);

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
        <AllModelsScene />
      </div>
    </div>
  );
}
