"use client";

import { useGLTF, useAnimations } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type { Group } from "three";
import { AnimationPicker } from "./AnimationPicker";

export function Model({ url }: { url: string }) {
  const ref = useRef<Group>(null);
  const stopped = useRef(false);
  const gltf = useGLTF(url);
  const { actions, names } = useAnimations(gltf.animations, ref);

  // SkinnedMesh frustum culling is unreliable when bones move vertices outside
  // the local bounding box (very common with Quaternius/Mixamo rigs).
  useEffect(() => {
    gltf.scene.traverse((o) => {
      if ((o as { isMesh?: boolean; isSkinnedMesh?: boolean }).isMesh) {
        (o as { frustumCulled: boolean }).frustumCulled = false;
      }
    });
  }, [gltf.scene]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === " ") {
        stopped.current = !stopped.current;
        e.preventDefault();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useFrame((_, delta) => {
    if (ref.current && !stopped.current) ref.current.rotation.y -= delta * 0.2;
  });

  return (
    <>
      <group ref={ref}>
        <primitive object={gltf.scene} />
      </group>
      {names.length > 0 && <AnimationPicker actions={actions} names={names} />}
    </>
  );
}
