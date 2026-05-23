"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

export type LandingModelPreviewItem = {
  label: string;
  file: string;
  source?: string;
  minY: number;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
  spinSpeed?: number;
  spinPhase?: number;
};

const LandingModelCanvas = dynamic(() => import("./LandingModelCanvas"), {
  ssr: false,
  loading: () => null,
});

type LandingModelBackdropProps = {
  models: LandingModelPreviewItem[];
  cameraPosition?: [number, number, number];
  fov?: number;
};

export function LandingModelBackdrop({
  models,
  cameraPosition,
  fov,
}: LandingModelBackdropProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (mounted) return;
    const el = containerRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setMounted(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setMounted(true);
            observer.disconnect();
            break;
          }
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [mounted]);

  if (models.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="landing-model-backdrop"
      aria-hidden="true"
    >
      {mounted ? (
        <LandingModelCanvas
          models={models}
          cameraPosition={cameraPosition}
          fov={fov}
        />
      ) : null}
    </div>
  );
}
