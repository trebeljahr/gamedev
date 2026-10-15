"use client";

import { useEffect, useState } from "react";
import { assetUrl } from "@/lib/manifest";

/**
 * Per-pack map from a model file to its immutable download object on the
 * asset origin, written at build time by scripts/build-static-site.ts as
 * `/api/downloads/<vendor>/<pack>.json`. The whole map (17,000+ objects) is too
 * large for every page, so each pack's map is fetched when one of its download
 * links renders.
 */
export type PackDownloadMap = {
  schema: 1;
  zip: string | null;
  models: Record<string, string>;
};

/** `/glb/<vendor>/<pack>/…` and `/raw/<vendor>/<pack>/…` → `<vendor>/<pack>`. */
export function packKeyForFile(file: string): string | undefined {
  const match = file.match(/^\/(?:glb|raw)\/([^/]+)\/([^/]+)\//);
  return match ? `${match[1]}/${match[2]}` : undefined;
}

export function packDownloadMapPath(packKey: string): string {
  return `/api/downloads/${packKey}.json`;
}

const loaded = new Map<string, PackDownloadMap | null>();
const pending = new Map<string, Promise<PackDownloadMap | null>>();

export function loadPackDownloadMap(packKey: string): Promise<PackDownloadMap | null> {
  if (loaded.has(packKey)) return Promise.resolve(loaded.get(packKey) ?? null);
  let request = pending.get(packKey);
  if (!request) {
    request = fetch(packDownloadMapPath(packKey))
      .then((response) => (response.ok ? (response.json() as Promise<PackDownloadMap>) : null))
      .catch(() => null)
      .then((map) => {
        loaded.set(packKey, map);
        pending.delete(packKey);
        return map;
      });
    pending.set(packKey, request);
  }
  return request;
}

/**
 * The download URL for a model file: its immutable object once the pack map
 * is loaded, else the plain asset URL (also what `next dev` uses, which has no
 * generated maps).
 */
export function modelDownloadHref(file: string, map: PackDownloadMap | null | undefined): string {
  return map?.models[file] ?? assetUrl(file);
}

export function usePackDownloadMap(file: string): PackDownloadMap | null | undefined {
  const packKey = packKeyForFile(file);
  const [map, setMap] = useState<PackDownloadMap | null | undefined>(() =>
    packKey && loaded.has(packKey) ? loaded.get(packKey) : undefined,
  );
  useEffect(() => {
    if (!packKey) return;
    let active = true;
    loadPackDownloadMap(packKey).then((value) => {
      if (active) setMap(value);
    });
    return () => {
      active = false;
    };
  }, [packKey]);
  return map;
}
