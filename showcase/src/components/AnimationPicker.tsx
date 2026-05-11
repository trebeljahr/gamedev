"use client";

import { folder, useControls } from "leva";
import { useEffect } from "react";

const NONE = "(none)";

export function AnimationPicker({
  names,
  onChange,
}: {
  names: string[];
  onChange?: (name: string | undefined) => void;
}) {
  const key = names.join("|");
  const [{ animation }, set] = useControls(
    () => ({
      animations: folder({
        animation: { options: [NONE, ...names], value: NONE },
      }),
    }),
    [key],
  );

  // Reset to "(none)" whenever the model (and its animation list) changes —
  // a new model should never inherit the previous model's selection.
  useEffect(() => {
    set({ animation: NONE });
  }, [key, set]);

  useEffect(() => {
    onChange?.(animation === NONE ? undefined : animation);
  }, [animation, onChange]);

  return null;
}
