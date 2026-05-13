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
          <Link className="app-title" href="/landing-page">
            GameDev Asset Library
          </Link>
        </h1>
        <nav className="top-nav" aria-label="Primary navigation">
          <Link href="/">Library</Link>
          <Link href="/#3d-packs">3D packs</Link>
          <Link href="/media?view=art">2D</Link>
          <Link href="/media?view=sounds">Sounds</Link>
          <Link href="/all">All models</Link>
        </nav>
      </div>
      {meta && <div className="meta">{meta}</div>}
    </header>
  );
}
