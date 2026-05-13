"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";

type SiteHeaderProps = {
  meta?: ReactNode;
  compact?: boolean;
  active?: NavKey;
};

const navItems = [
  { label: "Home", href: "/", key: "library" },
  {
    label: "3D",
    key: "packs",
    items: [
      { label: "All packs", href: "/#3d-packs" },
      { label: "Model index", href: "/models" },
      { label: "Animated", href: "/?model=animated#3d-packs" },
      { label: "Static", href: "/?model=static#3d-packs" },
    ],
  },
  {
    label: "2D",
    key: "art",
    items: [
      { label: "All 2D", href: "/media?view=art&type=all" },
      { label: "Animated", href: "/media?view=art&type=spritesheets&motion=animated" },
      { label: "Static", href: "/media?view=art&type=spritesheets&motion=static" },
      { label: "UI", href: "/media?view=art&type=ui-icons" },
    ],
  },
  {
    label: "Sounds",
    key: "sounds",
    items: [
      { label: "All sounds", href: "/media?view=sounds&type=all" },
      { label: "Sound effects", href: "/media?view=sounds&type=sfx" },
      { label: "Music", href: "/media?view=sounds&type=music" },
    ],
  },
] as const;

type NavKey = (typeof navItems)[number]["key"];

function activeKey(pathname: string): NavKey | undefined {
  if (pathname === "/") return "library";
  if (pathname === "/models") return "packs";
  if (pathname === "/media") return "sounds";
  if (pathname === "/all") return undefined;
  return "packs";
}

export function SiteHeader({ meta, compact = false, active }: SiteHeaderProps) {
  const pathname = usePathname();
  const current = active ?? activeKey(pathname);
  const [openKey, setOpenKey] = useState<NavKey | null>(null);

  return (
    <header className={`app-header ${compact ? "compact" : ""}`}>
      <div className="app-header-main">
        <h1>
          <Link className="app-title" href="/landing-page">
            GameDev Asset Library
          </Link>
        </h1>
        <nav className="top-nav" aria-label="Primary navigation">
          {navItems.map((item) =>
            "href" in item ? (
              <Link
                key={item.key}
                href={item.href}
                onClick={() => setOpenKey(null)}
                aria-current={current === item.key ? "page" : undefined}
              >
                {item.label}
              </Link>
            ) : (
              <details
                key={item.key}
                className="nav-drawer"
                open={openKey === item.key}
                onToggle={(event) => {
                  const isOpen = event.currentTarget.open;
                  setOpenKey((currentOpen) => (isOpen ? item.key : currentOpen === item.key ? null : currentOpen));
                }}
              >
                <summary className="nav-trigger" data-active={current === item.key ? "" : undefined}>
                  <span>{item.label}</span>
                  <span className="nav-chevron" aria-hidden="true" />
                </summary>
                <div className="nav-panel">
                  {item.items.map((child) => (
                    <Link key={child.href} href={child.href} onClick={() => setOpenKey(null)}>
                      {child.label}
                    </Link>
                  ))}
                </div>
              </details>
            ),
          )}
        </nav>
      </div>
      {meta && <div className="meta">{meta}</div>}
    </header>
  );
}
