"use client";

import dynamic from "next/dynamic";
import { SiteHeader } from "@/components/SiteHeader";
import type { Pack } from "@/lib/manifest";

const AllModelsScene = dynamic(
  () => import("@/components/AllModelsScene").then((m) => m.AllModelsScene),
  { ssr: false, loading: () => <div style={{ padding: 24 }}>Loading scene...</div> },
);

export function PackAllModelsWorld({ pack }: { pack: Pack }) {
  return (
    <div className="all-scene-shell">
      <SiteHeader
        compact
        active="packs"
        meta={
          <>
            {pack.count.toLocaleString()} models · {pack.vendor}
          </>
        }
      />
      <div className="all-scene-canvas">
        <AllModelsScene packId={pack.id} />
      </div>
    </div>
  );
}
