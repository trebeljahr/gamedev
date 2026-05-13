"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type SiteHeaderProps = {
  meta?: ReactNode;
  compact?: boolean;
  active?: NavKey;
};

const navItems = [
  { label: "Library", href: "/", key: "library" },
  { label: "3D packs", href: "/#3d-packs", key: "packs" },
  { label: "2D", href: "/media?view=art", key: "art" },
  { label: "Sounds", href: "/media?view=sounds", key: "sounds" },
  { label: "All models", href: "/all", key: "world" },
] as const;

type NavKey = (typeof navItems)[number]["key"];

function activeKey(pathname: string): NavKey {
  if (pathname === "/") return "library";
  if (pathname === "/all") return "world";
  if (pathname === "/media") return "sounds";
  return "packs";
}

export function SiteHeader({ meta, compact = false, active }: SiteHeaderProps) {
  const pathname = usePathname();
  const current = active ?? activeKey(pathname);

  return (
    <header className={`app-header ${compact ? "compact" : ""}`}>
      <div className="app-header-main">
        <h1>
          <Link className="app-title" href="/landing-page">
            GameDev Asset Library
          </Link>
        </h1>
        <nav className="top-nav" aria-label="Primary navigation">
          {navItems.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              aria-current={current === item.key ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
      {meta && <div className="meta">{meta}</div>}
    </header>
  );
}
