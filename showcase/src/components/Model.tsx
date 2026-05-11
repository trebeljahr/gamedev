"use client";

import { useGLTF, useAnimations } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  type AnimationClip,
  DoubleSide,
  type Group,
  type Material,
  type Mesh,
  MeshStandardMaterial,
} from "three";
import { AnimationPicker } from "./AnimationPicker";

/**
 * Quaternius/Kaykit/Kenney GLBs typically declare KHR_materials_unlit, which
 * GLTFLoader maps to MeshBasicMaterial. That means the scene's lights and
 * Environment HDR have zero effect — models look flat. Convert to a lit
 * MeshStandardMaterial while preserving texture/color/side/vertex-colors.
 */
function liftMaterial(src: Material): Material {
  // biome-ignore lint/suspicious/noExplicitAny: we're sniffing three's material shape
  const s = src as any;
  if (s.isMeshStandardMaterial || s.isMeshPhysicalMaterial) return src;
  const m = new MeshStandardMaterial({
    name: s.name,
    color: s.color?.clone?.() ?? "#ffffff",
    map: s.map ?? null,
    transparent: !!s.transparent,
    opacity: typeof s.opacity === "number" ? s.opacity : 1,
    side: s.side ?? DoubleSide,
    vertexColors: !!s.vertexColors,
    alphaMap: s.alphaMap ?? null,
    alphaTest: s.alphaTest ?? 0,
    metalness: 0,
    roughness: 0.85,
  });
  if (s.normalMap) m.normalMap = s.normalMap;
  if (s.emissiveMap) m.emissiveMap = s.emissiveMap;
  return m;
}

export function Model({ url }: { url: string }) {
  const ref = useRef<Group>(null);
  const stopped = useRef(false);
  const gltf = useGLTF(url) as unknown as { scene: Group; animations: AnimationClip[] };

  // Bind useAnimations directly to the gltf.scene (the actual armature root).
  // Wrapping in an extra <group> can confuse PropertyBinding name lookups.
  const { actions, names, mixer } = useAnimations(gltf.animations, gltf.scene);

  // Lift unlit materials → MeshStandardMaterial so scene lighting applies.
  // Also disable frustum culling on skinned meshes (Quaternius/Mixamo rigs
  // routinely fail the default culling check, vanishing mid-animation).
  useMemo(() => {
    gltf.scene.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map(liftMaterial);
      } else if (mesh.material) {
        mesh.material = liftMaterial(mesh.material);
      }
      if ((mesh as Mesh & { isSkinnedMesh?: boolean }).isSkinnedMesh) {
        mesh.frustumCulled = false;
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
  }, [gltf.scene]);

  // Drive the mixer ourselves — robust across R3F frameloop edge cases.
  useFrame((_, delta) => {
    if (mixer) mixer.update(delta);
    if (ref.current && !stopped.current) ref.current.rotation.y -= delta * 0.2;
  });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code === "KeyR") {
        stopped.current = !stopped.current;
        e.preventDefault();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <group ref={ref}>
        <primitive object={gltf.scene} />
      </group>
      {names.length > 0 && <AnimationPicker actions={actions} names={names} />}
    </>
  );
}
