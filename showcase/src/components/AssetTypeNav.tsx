"use client";

import Link from "next/link";
import { useState } from "react";
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
        <details key={group.key} className="nav-drawer" open={openKey === group.key}>
          <summary
            className="nav-trigger"
            data-active={active === group.key ? "" : undefined}
            onClick={(event) => {
              event.preventDefault();
              setOpenKey((currentOpen) => (currentOpen === group.key ? null : group.key));
            }}
            aria-expanded={openKey === group.key}
          >
            <span>{group.label}</span>
            <span className="nav-chevron" aria-hidden="true" />
          </summary>
          <div className="nav-panel">
            {group.items.map((child) => (
              <Link key={child.href} href={child.href} onClick={() => setOpenKey(null)}>
                {child.label}
              </Link>
            ))}
          </div>
        </details>
      ))}
      <span className="asset-nav-note">{note}</span>
    </nav>
  );
}
