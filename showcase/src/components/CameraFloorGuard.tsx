"use client";

import { useFrame, useThree } from "@react-three/fiber";
import type { Camera, Vector3 } from "three";

export const CAMERA_FLOOR_CLEARANCE = 1.4;
export const ORBIT_FLOOR_POLAR_LIMIT = Math.PI / 2 - 0.08;
const MIN_POLAR_LIMIT = 0.05;
const MAX_POLAR_LIMIT = Math.PI - 0.05;
const POLAR_FLOOR_MARGIN = 0.01;

export function clampCameraAboveFloor(
  camera: Camera,
  minY = CAMERA_FLOOR_CLEARANCE,
): boolean {
  if (camera.position.y < minY) {
    camera.position.y = minY;
    return true;
  }
  return false;
}

export function polarLimitForCameraFloor(
  camera: Camera,
  target: Vector3,
  minY = CAMERA_FLOOR_CLEARANCE,
): number {
  const radius = camera.position.distanceTo(target);
  if (radius <= 0.0001) return ORBIT_FLOOR_POLAR_LIMIT;

  const floorRatio = Math.max(-1, Math.min(1, (minY - target.y) / radius));
  return Math.max(
    MIN_POLAR_LIMIT,
    Math.min(MAX_POLAR_LIMIT, Math.acos(floorRatio) - POLAR_FLOOR_MARGIN),
  );
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
