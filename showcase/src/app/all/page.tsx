"use client";

import dynamic from "next/dynamic";

const AllModelsScene = dynamic(
  () => import("@/components/AllModelsScene").then((m) => m.AllModelsScene),
  { ssr: false, loading: () => <div style={{ padding: 24 }}>Loading scene…</div> },
);

export default function AllModelsPage() {
  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <AllModelsScene />
    </div>
  );
}
