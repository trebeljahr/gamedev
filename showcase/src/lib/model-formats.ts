export const MODEL_FORMATS = ["glb", "gltf", "fbx", "obj"] as const;

export type ModelFormat = (typeof MODEL_FORMATS)[number];

type ModelFormatDetails = {
  label: string;
  extension: string;
  title: string;
  explainer: string;
  compatibility: string;
};

export const MODEL_FORMAT_DETAILS: Record<ModelFormat, ModelFormatDetails> = {
  glb: {
    label: "GLB",
    extension: ".glb",
    title: "Free GLB Models",
    explainer:
      "GLB is the binary glTF package: geometry, materials, and textures travel in one compact file, which makes it the quickest web-preview and game-prototype download when you want minimal path fixing.",
    compatibility:
      "Best for browser previews and compact runtime imports in Three.js and Godot, with clean Blender import and Unity support through glTF importer packages.",
  },
  gltf: {
    label: "glTF",
    extension: ".gltf",
    title: "Free glTF Models",
    explainer:
      "glTF is the open JSON-based 3D interchange format. It keeps scene data readable and external resources explicit, useful when you want to inspect or process materials, animations, and mesh metadata before import.",
    compatibility:
      "Best for Three.js, Blender, and Godot when editable external resources matter; Unity teams usually use a glTF importer or convert to engine-native assets.",
  },
  fbx: {
    label: "FBX",
    extension: ".fbx",
    title: "Free FBX Models",
    explainer:
      "FBX is a long-running DCC and game-engine interchange format commonly used for rigged assets, animation transfer, and Unity production pipelines.",
    compatibility:
      "Best for Unity and Blender pipelines, especially rigged or animated source models; Godot and Three.js usually prefer conversion to glTF or GLB.",
  },
  obj: {
    label: "OBJ",
    extension: ".obj",
    title: "Free OBJ Models",
    explainer:
      "OBJ is a simple static mesh format with broad import support. It is a good fit for props, modular pieces, and geometry that does not need rigging, animations, or complex material graphs.",
    compatibility:
      "Best for Blender cleanup and simple static props in Unity, Godot, and Three.js; use GLB or glTF when animations or richer material data matter.",
  },
};

export function isModelFormat(value: string): value is ModelFormat {
  return MODEL_FORMATS.includes(value as ModelFormat);
}

export function formatLandingPath(format: ModelFormat): string {
  return `/formats/${format}`;
}
