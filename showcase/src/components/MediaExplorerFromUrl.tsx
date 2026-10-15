"use client";

import { Suspense, useEffect, useState, type ComponentProps } from "react";
import { useSearchParams } from "next/navigation";
import { MediaExplorer } from "@/components/MediaExplorer";

type MediaExplorerProps = ComponentProps<typeof MediaExplorer>;
type InitialFilters = Pick<
  MediaExplorerProps,
  "initialView" | "initialArtType" | "initialSpriteSubject" | "initialSpriteMotion" | "initialSoundType"
>;

function initialFiltersFrom(params: URLSearchParams): Required<InitialFilters> {
  const view = params.get("view");
  const type = params.get("type");
  const subject = params.get("subject");
  const motion = params.get("motion");
  return {
    initialView: view === "art" ? "art" : view === "textures" || view === "sources" ? "sources" : "sounds",
    initialArtType: type === "ui-icons" || type === "spritesheets" ? type : "all",
    initialSpriteSubject:
      subject === "characters" || subject === "environments" || subject === "effects-items" || subject === "other"
        ? subject
        : "all",
    initialSpriteMotion: motion === "animated" || motion === "static" ? motion : "all",
    initialSoundType: type === "music" || type === "sfx" || type === "all" ? type : "all",
  };
}

const DEFAULT_FILTERS = initialFiltersFrom(new URLSearchParams());

function SearchParamsSync({ onChange }: { onChange: (filters: Required<InitialFilters>) => void }) {
  const query = useSearchParams().toString();
  useEffect(() => {
    onChange(initialFiltersFrom(new URLSearchParams(query)));
  }, [onChange, query]);
  return null;
}

/**
 * The static export prerenders /media once, with the default filters. The
 * query (`?view=art&type=spritesheets`) is applied in the browser; only this
 * empty listener waits for it, so the explorer itself is still prerendered.
 */
export function MediaExplorerFromUrl(props: Omit<MediaExplorerProps, keyof InitialFilters>) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  return (
    <>
      <Suspense fallback={null}>
        <SearchParamsSync onChange={setFilters} />
      </Suspense>
      <MediaExplorer {...props} {...filters} />
    </>
  );
}
