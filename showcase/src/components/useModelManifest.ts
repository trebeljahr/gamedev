"use client";

import { useEffect, useState } from "react";
import type { Manifest } from "@/lib/manifest";
import { canRedistributeRawAssets, shouldShowRestrictedAssets } from "@/lib/license-policy";

export function useModelManifest(initial: Manifest, enabled = true) {
  const [loaded, setLoaded] = useState<Manifest | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setError(false);
    fetch("/manifest.json", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Catalog request failed");
        const data: Manifest = await response.json();
        if (!Array.isArray(data.packs)) throw new Error("Invalid catalog");
        const filtered = shouldShowRestrictedAssets()
          ? data
          : { packs: data.packs.filter((pack) => canRedistributeRawAssets(pack.license)) };
        if (!controller.signal.aborted) setLoaded(filtered);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [enabled, attempt]);

  return {
    manifest: loaded ?? initial,
    loading: enabled && !loaded && !error,
    error,
    retry: () => setAttempt((value) => value + 1),
  };
}
