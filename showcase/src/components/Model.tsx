"use client";

import { useGLTF, useAnimations } from "@react-three/drei";
import { useFrame, useLoader } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { assetUrl } from "@/lib/manifest";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import {
  type AnimationAction,
  type AnimationClip,
  Box3,
  DoubleSide,
  FrontSide,
  type Group,
  type Material,
  type Mesh,
  MeshStandardMaterial,
  type Side,
  type Texture,
  TextureLoader,
  SRGBColorSpace,
  Vector3,
} from "three";

export type AnimationInfo = {
  names: string[];
  actions: Record<string, AnimationAction | null>;
};

const FADE = 0.3;

/**
 * Quaternius/Kaykit/Kenney GLBs typically declare KHR_materials_unlit, which
 * GLTFLoader maps to MeshBasicMaterial. That means the scene's lights and
 * Environment HDR have zero effect — models look flat. Convert to a lit
 * MeshStandardMaterial while preserving texture/color/side/vertex-colors.
 *
 * Side handling: alpha-tested cutout materials (leaves on planes, cloth
 * banners) need DoubleSide so they don't vanish edge-on. Opaque solid
 * materials (kenney 3d-road-tiles' Stone / Asphalt / Grass walls,
 * buildings) MUST stay FrontSide — when DoubleSide is forced, the back of
 * each wall renders at the exact same depth as the front, and you get
 * the classic z-fighting "screen door" cross-hatch wherever two solids
 * meet on a shared plane.
 */
function sideFor(src: { transparent?: boolean; alphaMap?: unknown; alphaTest?: number }): Side {
  const isCutout = !!src.alphaMap || (src.alphaTest ?? 0) > 0 || !!src.transparent;
  return isCutout ? DoubleSide : FrontSide;
}

function liftMaterial(src: Material): Material {
  // biome-ignore lint/suspicious/noExplicitAny: we're sniffing three's material shape
  const s = src as any;
  if (s.isMeshStandardMaterial || s.isMeshPhysicalMaterial) {
    const material = src.clone();
    material.side = sideFor(s);
    return material;
  }
  const m = new MeshStandardMaterial({
    name: s.name,
    color: s.color?.clone?.() ?? "#ffffff",
    map: s.map ?? null,
    transparent: !!s.transparent,
    opacity: typeof s.opacity === "number" ? s.opacity : 1,
    side: sideFor(s),
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
    const target = HAS_TEXTURE.has(name)
      ? name
      : /tree/i.test(name)
        ? "Tree"
        : null;
    if (!target) return null;
    const path = `/raw/quaternius/textured-fantasy-nature-mar-2017/extracted/Textured Fantasy Nature - Mar 2017/Blends/Textures/${target}.png`;
    const encoded = path
      .split("/")
      .map(encodeURIComponent)
      .join("/")
      .replace(/%2F/g, "/");
    return assetUrl(encoded);
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
      if (m.color) m.color.set("#ffffff");
      m.needsUpdate = true;
    };
    if (Array.isArray(mesh.material)) mesh.material.forEach(apply);
    else if (mesh.material) apply(mesh.material);
  });
}

function ExternalTextureApplier({ url, scene }: { url: string; scene: Group }) {
  const tex = useLoader(TextureLoader, url);
  useEffect(() => {
    if (tex) applyTextureToScene(scene, tex);
  }, [scene, tex]);
  return null;
}

export function Model({
  url,
  autoRotate = false,
  playAnimation,
  onAnimationsLoaded,
}: {
  url: string;
  autoRotate?: boolean;
  playAnimation?: string;
  onAnimationsLoaded?: (info: AnimationInfo | null) => void;
}) {
  const ref = useRef<Group>(null);
  const gltf = useGLTF(url) as unknown as {
    scene: Group;
    animations: AnimationClip[];
  };
  const scene = useMemo(() => cloneSkeleton(gltf.scene) as Group, [gltf.scene]);
  const externalTexUrl = useMemo(() => externalTextureUrlFor(url), [url]);

  // Bind useAnimations directly to the cloned armature root. Wrapping in an
  // extra <group> can confuse PropertyBinding name lookups.
  const { actions, names, mixer } = useAnimations(gltf.animations, scene);

  // Recenter the geometry's XZ centroid on the local origin. Some GLBs ship
  // with a pivot that's nowhere near the geometry (one of the Quaternius
  // burgers floats next to its pedestal because of this); without recentering,
  // the spinning rotation orbits around that arbitrary pivot instead of doing
  // a clean turntable. Y is left alone so callers can ground by bbox.min.y.
  const xzOffset = useMemo(() => {
    scene.updateMatrixWorld(true);
    const box = new Box3().setFromObject(scene);
    return new Vector3(
      -(box.min.x + box.max.x) / 2,
      0,
      -(box.min.z + box.max.z) / 2,
    );
  }, [scene]);

  // Lift unlit materials → MeshStandardMaterial, preserve cutout sides, disable
  // frustum culling on skinned meshes (Quaternius/Mixamo rigs routinely fail
  // the default culling check and vanish mid-animation).
  useMemo(() => {
    scene.traverse((o) => {
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
  }, [scene]);

  // Publish animations to the parent so it can drive the picker UI.
  useEffect(() => {
    if (names.length > 0) onAnimationsLoaded?.({ names, actions });
    return () => onAnimationsLoaded?.(null);
  }, [names, actions, onAnimationsLoaded]);

  // Only play what the parent explicitly asked for. No auto-play default —
  // the showcase opens silent and the user opts in via the picker.
  const activeAnim =
    playAnimation && actions[playAnimation] ? playAnimation : null;

  useEffect(() => {
    if (!activeAnim) return;
    const a = actions[activeAnim];
    a?.reset().fadeIn(FADE).play();
    return () => {
      a?.fadeOut(FADE);
    };
  }, [activeAnim, actions]);

  useFrame((_, delta) => {
    if (mixer) mixer.update(delta);
    if (autoRotate && ref.current) ref.current.rotation.y -= delta * 0.2;
  });

  return (
    <>
      <group ref={ref}>
        <group position={xzOffset}>
          <primitive object={scene} />
        </group>
      </group>
      {externalTexUrl && (
        <ExternalTextureApplier url={externalTexUrl} scene={scene} />
      )}
    </>
  );
}
