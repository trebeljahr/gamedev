"use client";

import JoystickController, { type JoystickOnMove, type JoystickOptions } from "joystick-controller";
import { type RefObject, useEffect, useRef } from "react";

// joystick-controller (v2) calls `crypto.randomUUID()` to mint per-instance DOM
// ids. That API is restricted to secure contexts (HTTPS or localhost), so on a
// phone hitting the dev server via LAN IP (http://192.168.x.x:PORT) the call
// throws and the joystick never mounts. Polyfill with a unique-enough string —
// the library only uses the result as a DOM id suffix.
if (typeof window !== "undefined" && typeof window.crypto?.randomUUID !== "function") {
  Object.defineProperty(window.crypto, "randomUUID", {
    value: () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
    configurable: true,
    writable: true,
  });
}

const ZERO: JoystickOnMove = {
  x: 0,
  y: 0,
  leveledX: 0,
  leveledY: 0,
  angle: 0,
  distance: 0,
};

const defaultParameters: JoystickOptions = {
  x: "15%",
  y: "15%",
  opacity: 1,
  maxRange: 60,
  radius: 70,
  joystickRadius: 40,
  joystickClass: "showcase-joystick-knob",
  controllerClass: "showcase-joystick-pad",
  containerClass: "showcase-joystick-container",
  distortion: false,
  mouseClickButton: "ALL",
  hideContextMenu: true,
};

type Options = {
  /** Optional override for `defaultParameters`. */
  params?: JoystickOptions;
  /** Per-event callback (fires whenever onMove fires). */
  cb?: (data: JoystickOnMove) => void;
  /** When false the joystick is not mounted (and any existing instance
   *  is destroyed). Useful for desktop/mobile gating. */
  enabled?: boolean;
  /** If provided, the joystick's DOM container is moved into this element
   *  after mount. The library hardcodes `document.body` as the parent —
   *  that breaks fullscreen. */
  parentRef?: RefObject<HTMLElement | null>;
};

/**
 * React wrapper around joystick-controller. Returns a `getData()` accessor
 * that always reads the latest joystick state — perfect for polling inside
 * a useFrame loop. Pass `cb` if you also want a per-event callback.
 */
export function useJoystick({ params, cb, enabled = true, parentRef }: Options = {}) {
  const dataRef = useRef<JoystickOnMove>(ZERO);
  const cbRef = useRef(cb);
  cbRef.current = cb;

  // biome-ignore lint/correctness/useExhaustiveDependencies: params is intentionally read only on mount
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;

    const merged: JoystickOptions = { ...defaultParameters, ...params };
    const joystick = new JoystickController(merged, (data) => {
      dataRef.current = data;
      cbRef.current?.(data);
    });
    const parentEl = parentRef?.current;
    const containerEl = document.getElementById(`joystick-container-${joystick.id}`);
    const controllerEl = document.getElementById(`joystick-controller-${joystick.id}`);
    const knobEl = document.getElementById(`joystick-${joystick.id}`);
    if (parentEl && containerEl) {
      parentEl.appendChild(containerEl);
      containerEl.style.zIndex = "40";
    }
    for (const el of [containerEl, controllerEl, knobEl]) {
      if (!el) continue;
      el.style.touchAction = "none";
      el.style.userSelect = "none";
      el.style.webkitUserSelect = "none";
      el.style.setProperty("-webkit-touch-callout", "none");
      el.style.setProperty("-webkit-tap-highlight-color", "transparent");
    }
    return () => {
      joystick.destroy();
      dataRef.current = ZERO;
    };
  }, [enabled, parentRef]);

  return { getData: () => dataRef.current };
}
