"use client";

import { useEffect, useState } from "react";

/**
 * True on devices whose primary input is touch (phones, tablets). Returns
 * null on first render (SSR-safe) and a stable boolean after mount.
 */
export function useTouchDevice(): boolean | null {
  const [isTouch, setIsTouch] = useState<boolean | null>(null);

  useEffect(() => {
    const update = () => {
      const coarse = window.matchMedia("(pointer: coarse)").matches;
      const hasTouchPoints = navigator.maxTouchPoints > 0;
      const handheldSize = Math.min(window.innerWidth, window.innerHeight) <= 1200;
      setIsTouch((coarse || hasTouchPoints) && handheldSize);
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return isTouch;
}
