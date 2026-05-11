"use client";

import { folder, useControls } from "leva";
import { useEffect, useMemo } from "react";
import type { AnimationAction } from "three";

const FADE = 0.4;

const PRIORITY = ["idle", "walk", "flying", "forward", "normal"];

function pickDefault(names: string[]): string {
  const lower = names.map((n) => n.toLowerCase());
  for (const key of PRIORITY) {
    const i = lower.findIndex((n) => n.includes(key));
    if (i >= 0) return names[i];
  }
  return names[0];
}

export function AnimationPicker({
  actions,
  names,
}: {
  actions: Record<string, AnimationAction | null>;
  names: string[];
}) {
  const defaultAction = useMemo(() => pickDefault(names), [names]);

  const [{ animation }, set] = useControls(
    () => ({
      animations: folder({
        animation: { options: names, value: defaultAction },
      }),
    }),
    [defaultAction, names.join("|")],
  );

  useEffect(() => {
    set({ animation: defaultAction });
  }, [defaultAction, set]);

  useEffect(() => {
    const a = actions[animation];
    a?.reset().fadeIn(FADE).play();
    return () => {
      a?.fadeOut(FADE);
    };
  }, [animation, actions]);

  return null;
}
