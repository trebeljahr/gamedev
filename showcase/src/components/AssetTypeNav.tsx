"use client";

import Link from "next/link";
import { useState } from "react";
import { NavDrawer } from "@/components/NavDrawer";
import { navGroups, type NavKey } from "@/lib/navigation";

type AssetTypeNavProps = {
  active?: NavKey;
  note: string;
};

export function AssetTypeNav({ active = "packs", note }: AssetTypeNavProps) {
  const [openKey, setOpenKey] = useState<NavKey | null>(null);

  return (
    <nav className="asset-type-nav" aria-label="Asset library navigation">
      {navGroups.map((group) => (
        <NavDrawer
          key={group.key}
          label={group.label}
          active={active === group.key}
          open={openKey === group.key}
          onOpenChange={(isOpen) =>
            setOpenKey((currentOpen) =>
              isOpen ? group.key : currentOpen === group.key ? null : currentOpen,
            )
          }
        >
          {group.items.map((child) => (
            <Link
              key={child.href}
              href={child.href}
              onClick={() => setOpenKey(null)}
            >
              {child.label}
            </Link>
          ))}
        </NavDrawer>
      ))}
      <span className="asset-nav-note">{note}</span>
    </nav>
  );
}
