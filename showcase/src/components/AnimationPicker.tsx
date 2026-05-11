"use client";

import { folder, useControls } from "leva";
import { useEffect } from "react";
import { pickDefaultAnimation } from "./Model";

export function AnimationPicker({
  names,
  onChange,
}: {
  names: string[];
  onChange?: (name: string) => void;
}) {
  const defaultName = pickDefaultAnimation(names) ?? names[0];
  const [{ animation }, set] = useControls(
    () => ({
      animations: folder({
        animation: { options: names, value: defaultName },
      }),
    }),
    [defaultName, names.join("|")],
  );

  useEffect(() => {
    set({ animation: defaultName });
  }, [defaultName, set]);

  useEffect(() => {
    onChange?.(animation);
  }, [animation, onChange]);

  return null;
}
