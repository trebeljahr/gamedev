"use client";

import { useEffect, useState } from "react";

/**
 * Lightweight 2D asset previews for the detail pages. Single images render as
 * <img>; multi-frame animations flipbook through their resolved frame srcs.
 * Deliberately avoids the explorer's canvas sprite-sheet slicer — these pages
 * show the asset as it ships on disk.
 */
function useFlipbook(srcs: readonly string[] | undefined, intervalMs = 120): number {
  const [frame, setFrame] = useState(0);
  const count = srcs?.length ?? 0;
  useEffect(() => {
    if (count < 2) return;
    const id = window.setInterval(() => setFrame((value) => (value + 1) % count), intervalMs);
    return () => window.clearInterval(id);
  }, [count, intervalMs]);
  return count > 0 ? frame % count : 0;
}

export function ArtItemThumb({
  src,
  label,
  sequenceSrcs,
}: {
  src: string;
  label: string;
  sequenceSrcs?: readonly string[];
}) {
  const frame = useFlipbook(sequenceSrcs);
  const shown = sequenceSrcs && sequenceSrcs.length >= 2 ? sequenceSrcs[frame] : src;
  return <img src={shown} alt={label} loading="lazy" decoding="async" />;
}

export function ArtItemViewer({
  src,
  label,
  sequenceSrcs,
}: {
  src: string;
  label: string;
  sequenceSrcs?: readonly string[];
}) {
  const frame = useFlipbook(sequenceSrcs);
  const animated = Boolean(sequenceSrcs && sequenceSrcs.length >= 2);
  const shown = animated ? sequenceSrcs![frame] : src;
  return (
    <div className="art-item-stage">
      <img src={shown} alt={label} decoding="async" />
      {animated && (
        <span className="art-item-stage-badge">
          {frame + 1}/{sequenceSrcs!.length}
        </span>
      )}
    </div>
  );
}
