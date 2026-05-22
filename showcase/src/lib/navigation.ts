export const navGroups = [
  {
    label: "3D",
    key: "packs",
    items: [
      { label: "All models", href: "/models" },
      { label: "World viewer", href: "/all" },
      { label: "Textures", href: "/media?view=textures" },
    ],
  },
  {
    label: "2D",
    key: "art",
    items: [
      { label: "All 2D", href: "/media?view=art&type=all" },
      { label: "Sprites", href: "/media?view=art&type=spritesheets" },
      { label: "Animated", href: "/media?view=art&type=spritesheets&motion=animated" },
      { label: "Static", href: "/media?view=art&type=spritesheets&motion=static" },
      { label: "UI", href: "/media?view=art&type=ui-icons" },
    ],
  },
  {
    label: "Sounds",
    key: "sounds",
    items: [
      { label: "Audio editor", href: "/sounds/editor" },
      { label: "All sounds", href: "/media?view=sounds&type=all" },
      { label: "Sound effects", href: "/media?view=sounds&type=sfx" },
      { label: "Music", href: "/media?view=sounds&type=music" },
    ],
  },
] as const;

export const navItems = [
  { label: "Home", href: "/", key: "library" },
  { label: "Build with AI", href: "/build-with-ai", key: "buildWithAi" },
  ...navGroups,
] as const;

export type NavKey = (typeof navItems)[number]["key"];
