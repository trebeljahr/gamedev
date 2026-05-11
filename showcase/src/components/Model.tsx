"use client";

import { useGLTF, useAnimations } from "@react-three/drei";
import { useFrame, useLoader } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  type AnimationClip,
  DoubleSide,
  type Group,
  type Material,
  type Mesh,
  MeshStandardMaterial,
  type Texture,
  TextureLoader,
  SRGBColorSpace,
} from "three";
import { AnimationPicker } from "./AnimationPicker";

/**
 * Quaternius/Kaykit/Kenney GLBs typically declare KHR_materials_unlit, which
 * GLTFLoader maps to MeshBasicMaterial. That means the scene's lights and
 * Environment HDR have zero effect — models look flat. Convert to a lit
 * MeshStandardMaterial while preserving texture/color/side/vertex-colors.
 *
 * Also: many of these packs have one-sided geometry (planes for leaves,
 * banner cloth, open-bottom buildings). FrontSide makes them disappear from
 * one angle. Always force DoubleSide — perf cost on low-poly art is trivial.
 */
function liftMaterial(src: Material): Material {
  // biome-ignore lint/suspicious/noExplicitAny: we're sniffing three's material shape
  const s = src as any;
  if (s.isMeshStandardMaterial || s.isMeshPhysicalMaterial) {
    s.side = DoubleSide;
    return src;
  }
  const m = new MeshStandardMaterial({
    name: s.name,
    color: s.color?.clone?.() ?? "#ffffff",
    map: s.map ?? null,
    transparent: !!s.transparent,
    opacity: typeof s.opacity === "number" ? s.opacity : 1,
    side: DoubleSide,
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

/**
 * External-texture rescue for Quaternius packs whose FBX→GLB conversion
 * dropped the texture atlas. Map the GLB URL to a sibling PNG; if a match
 * exists, a child loader applies it as baseColor.
 *
 * Conservative on purpose — only packs we've inspected. Returning null means
 * "use whatever the GLB shipped with."
 */
function externalTextureUrlFor(modelUrl: string): string | null {
  const fantasyNature = modelUrl.match(
    /\/glb\/quaternius\/textured-fantasy-nature-mar-2017\/glb\/([^/]+)\.glb$/i,
  );
  if (fantasyNature) {
    const name = fantasyNature[1];
    const HAS_TEXTURE = new Set([
      "Flower",
      "Flower2",
      "Flower3",
      "Mushroom",
      "Tree",
    ]);
    // Any "*Tree*" model can borrow Tree.png as a usable atlas — better than
    // gray. Bushes have no usable source atlas; leave them alone.
    const target = HAS_TEXTURE.has(name)
      ? name
      : /tree/i.test(name)
        ? "Tree"
        : null;
    if (!target) return null;
    const path = `/raw/quaternius/textured-fantasy-nature-mar-2017/extracted/Textured Fantasy Nature - Mar 2017/Blends/Textures/${target}.png`;
    // Encode each segment but keep the slashes.
    return path.split("/").map(encodeURIComponent).join("/").replace(/%2F/g, "/");
  }
  return null;
}

function applyTextureToScene(scene: Group, tex: Texture) {
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  scene.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const apply = (mat: Material) => {
      const m = mat as MeshStandardMaterial;
      m.map = tex;
      // Strip the gray baseColorFactor so the texture isn't multiplied dark.
      if (m.color) m.color.set("#ffffff");
      m.needsUpdate = true;
    };
    if (Array.isArray(mesh.material)) mesh.material.forEach(apply);
    else if (mesh.material) apply(mesh.material);
  });
}

/* Suspends until the external texture loads, then applies it to the scene.
   Rendered only when there's a known texture for the model, so the hook
   call order stays stable. */
function ExternalTextureApplier({ url, scene }: { url: string; scene: Group }) {
  const tex = useLoader(TextureLoader, url);
  useEffect(() => {
    if (tex) applyTextureToScene(scene, tex);
  }, [scene, tex]);
  return null;
}

export function Model({ url }: { url: string }) {
  const ref = useRef<Group>(null);
  const stopped = useRef(false);
  const gltf = useGLTF(url) as unknown as { scene: Group; animations: AnimationClip[] };
  const externalTexUrl = useMemo(() => externalTextureUrlFor(url), [url]);

  // Bind useAnimations directly to the gltf.scene (the actual armature root).
  // Wrapping in an extra <group> can confuse PropertyBinding name lookups.
  const { actions, names, mixer } = useAnimations(gltf.animations, gltf.scene);

  // Lift unlit materials → MeshStandardMaterial so scene lighting applies,
  // and force DoubleSide. Also disable frustum culling on skinned meshes
  // (Quaternius/Mixamo rigs routinely fail the default culling check and
  // vanish mid-animation).
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
      {externalTexUrl && (
        <ExternalTextureApplier url={externalTexUrl} scene={gltf.scene} />
      )}
      {names.length > 0 && <AnimationPicker actions={actions} names={names} />}
    </>
  );
}
