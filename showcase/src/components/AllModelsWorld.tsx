"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { computeAllModelsLayout } from "@/lib/layout";
import { useModelManifest } from "@/components/useModelManifest";
import type { Manifest } from "@/lib/manifest";

const EMPTY: Manifest = { packs: [] };
const Scene = dynamic(() => import("@/components/AllModelsScene").then((m) => m.AllModelsScene), { ssr: false });

export function AllModelsWorld() {
  const { manifest, loading, error, retry } = useModelManifest(EMPTY);
  const layout = useMemo(() => manifest.packs.length ? computeAllModelsLayout(manifest) : null, [manifest]);
  if (error) return <p role="alert">The model catalog could not load. <button type="button" onClick={retry}>Try again</button></p>;
  if (loading || !layout) return <p role="status">Loading the model world…</p>;
  return <Scene sceneLayout={layout} />;
}
