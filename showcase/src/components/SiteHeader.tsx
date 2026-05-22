"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { NavDrawer } from "@/components/NavDrawer";
import { navItems, type NavKey } from "@/lib/navigation";

type SiteHeaderProps = {
  meta?: ReactNode;
  compact?: boolean;
  active?: NavKey;
};

function activeKey(pathname: string, search: string, hash: string): NavKey | undefined {
  if (pathname === "/") {
    if (hash === "#3d-packs" || hash === "#3d-collections" || hash.startsWith("#creator-")) return "packs";
    return "library";
  }
  if (pathname === "/build-with-ai") return "buildWithAi";
  if (pathname === "/supporters") return undefined;
  if (pathname === "/models") return "packs";
  if (pathname === "/all") return undefined;
  if (pathname.startsWith("/sounds")) return "sounds";
  if (pathname === "/media") {
    const view = new URLSearchParams(search).get("view");
    if (view === "art") return "art";
    if (view === "textures" || view === "sources") return "packs";
    return "sounds";
  }
  return "packs";
}

function shouldUsePendingActive(event: MouseEvent): boolean {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.shiftKey
  );
}

export function SiteHeader({ meta, compact = false, active }: SiteHeaderProps) {
  const pathname = usePathname();
  const [locationParts, setLocationParts] = useState({ search: "", hash: "" });
  const [pendingActive, setPendingActive] = useState<NavKey | null>(null);
  const [openKey, setOpenKey] = useState<NavKey | null>(null);
  const inferredActive = activeKey(pathname, locationParts.search, locationParts.hash);
  const routedActive = active ?? inferredActive;
  const current = pendingActive ?? routedActive;

  useEffect(() => {
    function syncLocationParts() {
      setLocationParts({
        search: window.location.search,
        hash: window.location.hash,
      });
    }

    syncLocationParts();
    window.addEventListener("hashchange", syncLocationParts);
    window.addEventListener("popstate", syncLocationParts);
    return () => {
      window.removeEventListener("hashchange", syncLocationParts);
      window.removeEventListener("popstate", syncLocationParts);
    };
  }, [pathname]);

  useEffect(() => {
    if (pendingActive === routedActive) setPendingActive(null);
  }, [pendingActive, routedActive]);

  return (
    <header className={`app-header ${compact ? "compact" : ""}`}>
      <div className="app-header-main">
        <h1>
          <Link className="app-title" href="/">
            GameDev Asset Library
          </Link>
        </h1>
        <nav className="top-nav" aria-label="Primary navigation">
          {navItems.map((item) =>
            "href" in item ? (
              <Link
                key={item.key}
                href={item.href}
                onClick={(event) => {
                  setOpenKey(null);
                  if (shouldUsePendingActive(event)) setPendingActive(item.key);
                }}
                aria-current={current === item.key ? "page" : undefined}
              >
                {item.label}
              </Link>
            ) : (
              <NavDrawer
                key={item.key}
                label={item.label}
                active={current === item.key}
                open={openKey === item.key}
                onOpenChange={(isOpen) =>
                  setOpenKey((currentOpen) => (isOpen ? item.key : currentOpen === item.key ? null : currentOpen))
                }
                ariaLabel={`${item.label} navigation`}
              >
                {item.items.map((child) => (
                  <Link
                    key={child.href}
                    href={child.href}
                    onClick={(event) => {
                      setOpenKey(null);
                      if (shouldUsePendingActive(event)) setPendingActive(item.key);
                    }}
                  >
                    {child.label}
                  </Link>
                ))}
              </NavDrawer>
            ),
          )}
        </nav>
      </div>
      {meta && <div className="meta">{meta}</div>}
    </header>
  );
}
