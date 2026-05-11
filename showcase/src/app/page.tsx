import Link from "next/link";
import { manifest } from "@/lib/manifest";

export default function HomePage() {
  const byVendor = new Map<string, typeof manifest.packs>();
  for (const p of manifest.packs) {
    if (!byVendor.has(p.vendor)) byVendor.set(p.vendor, []);
    byVendor.get(p.vendor)!.push(p);
  }

  const totalModels = manifest.packs.reduce((n, p) => n + p.count, 0);

  return (
    <>
      <header className="app-header">
        <h1>3D Assets Showcase</h1>
        <div className="meta">
          <Link href="/all" style={{ marginRight: 16, color: "#ffd84d" }}>
            walk through everything →
          </Link>
          {manifest.packs.length} packs · {totalModels.toLocaleString()} models
        </div>
      </header>

      {[...byVendor.entries()].map(([vendor, packs]) => (
        <section className="vendor-section" key={vendor}>
          <h2>{vendor}</h2>
          <div className="pack-grid">
            {packs.map((p) => (
              <Link key={p.id} className="pack-card" href={`/${p.vendor}/${p.pack}`}>
                <div className="pack-label">{p.label}</div>
                <div className="pack-count">
                  {p.count} {p.count === 1 ? "model" : "models"}
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
