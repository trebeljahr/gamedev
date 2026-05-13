"use client";

import { useFrame, useThree } from "@react-three/fiber";
import type { Camera } from "three";

export const CAMERA_FLOOR_CLEARANCE = 1.4;
export const ORBIT_FLOOR_POLAR_LIMIT = Math.PI / 2 - 0.08;

export function clampCameraAboveFloor(
  camera: Camera,
  minY = CAMERA_FLOOR_CLEARANCE,
) {
  if (camera.position.y < minY) {
    camera.position.y = minY;
  }
}

export function CameraFloorGuard({
  minY = CAMERA_FLOOR_CLEARANCE,
}: {
  minY?: number;
}) {
  const { camera } = useThree();

  useFrame(() => {
    clampCameraAboveFloor(camera, minY);
  });

  return null;
}
