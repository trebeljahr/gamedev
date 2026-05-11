"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { Euler, Vector3 } from "three";

type Props = {
  speed?: number;
  sprintMultiplier?: number;
  lookSensitivity?: number;
  onSprintChange?: (sprinting: boolean) => void;
};

export function FlyCamera({
  speed = 6,
  sprintMultiplier = 3.5,
  lookSensitivity = 0.0025,
  onSprintChange,
}: Props) {
  const { camera, gl } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  const yaw = useRef(0);
  const pitch = useRef(0);
  const dragging = useRef(false);
  const lookActive = useRef(false);
  const sprinting = useRef(false);

  useFrame((_, delta) => {
    if (lookActive.current) {
      camera.quaternion.setFromEuler(
        new Euler(pitch.current, yaw.current, 0, "YXZ"),
      );
    }

    const forward = new Vector3();
    camera.getWorldDirection(forward);
    const right = new Vector3().crossVectors(forward, camera.up).normalize();

    const move = new Vector3();
    if (keys.current.KeyW) move.add(forward);
    if (keys.current.KeyS) move.sub(forward);
    if (keys.current.KeyD) move.add(right);
    if (keys.current.KeyA) move.sub(right);
    if (keys.current.Space) move.y += 1;
    if (keys.current.KeyC) move.y -= 1;

    if (move.lengthSq() > 0) {
      move.normalize();
      const s = (sprinting.current ? sprintMultiplier : 1) * speed * delta;
      camera.position.addScaledVector(move, s);
    }
  });

  useEffect(() => {
    const FLY_KEYS = new Set([
      "KeyW",
      "KeyA",
      "KeyS",
      "KeyD",
      "KeyC",
      "Space",
    ]);
    function onDown(e: KeyboardEvent) {
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
        if (!e.repeat) {
          sprinting.current = !sprinting.current;
          onSprintChange?.(sprinting.current);
        }
        return;
      }
      if (FLY_KEYS.has(e.code)) {
        keys.current[e.code] = true;
        e.preventDefault();
      }
    }
    function onUp(e: KeyboardEvent) {
      if (FLY_KEYS.has(e.code)) keys.current[e.code] = false;
    }
    function onBlur() {
      keys.current = {};
    }
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [onSprintChange]);

  useEffect(() => {
    const el = gl.domElement;
    el.style.touchAction = "none";
    function onPointerDown(e: PointerEvent) {
      if (e.button !== 0) return;
      dragging.current = true;
      if (!lookActive.current) {
        const eu = new Euler(0, 0, 0, "YXZ").setFromQuaternion(
          camera.quaternion,
        );
        yaw.current = eu.y;
        pitch.current = eu.x;
        lookActive.current = true;
      }
      try {
        el.setPointerCapture(e.pointerId);
      } catch {}
    }
    function onPointerMove(e: PointerEvent) {
      if (!dragging.current) return;
      yaw.current -= e.movementX * lookSensitivity;
      pitch.current -= e.movementY * lookSensitivity;
      const limit = Math.PI / 2 - 0.01;
      if (pitch.current > limit) pitch.current = limit;
      if (pitch.current < -limit) pitch.current = -limit;
    }
    function onPointerUp(e: PointerEvent) {
      dragging.current = false;
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {}
    }
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerUp);
    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerUp);
    };
  }, [camera, gl, lookSensitivity]);

  return null;
}
