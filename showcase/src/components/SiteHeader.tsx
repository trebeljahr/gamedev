import Link from "next/link";
import type { ReactNode } from "react";

type SiteHeaderProps = {
  meta?: ReactNode;
};

export function SiteHeader({ meta }: SiteHeaderProps) {
  return (
    <header className="app-header">
      <div className="app-header-main">
        <h1>
          <Link className="app-title" href="/">
            3D Assets Showcase
          </Link>
        </h1>
        <nav className="top-nav" aria-label="Primary navigation">
          <Link href="/#3d-packs">3D packs</Link>
          <Link href="/all">All models</Link>
          <Link href="/media?view=art">2D</Link>
          <Link href="/media?view=sounds">Sounds</Link>
        </nav>
      </div>
      {meta && <div className="meta">{meta}</div>}
    </header>
  );
}
