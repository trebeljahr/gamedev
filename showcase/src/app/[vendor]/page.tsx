import Link from "next/link";
import { notFound } from "next/navigation";
import { LicenseLink } from "@/components/LicenseLink";
import { PackGrid } from "@/components/PackGrid";
import { SiteHeader } from "@/components/SiteHeader";
import { licenseForVendor } from "@/lib/license";
import { manifest } from "@/lib/manifest";
import { previewModelFilesFor } from "@/lib/preview-model";

export function generateStaticParams() {
  return Array.from(new Set(manifest.packs.map((pack) => pack.vendor))).map((vendor) => ({ vendor }));
}

export default async function CreatorPage({
  params,
}: {
  params: Promise<{ vendor: string }>;
}) {
  const { vendor } = await params;
  const packs = manifest.packs.filter((pack) => pack.vendor === vendor);
  if (packs.length === 0) notFound();

  const credit = licenseForVendor(vendor);
  const totalModels = packs.reduce((sum, pack) => sum + pack.count, 0);

  return (
    <>
      <SiteHeader
        active="packs"
        meta={
          <>
            <Link href="/#3d-collections" className="header-meta-link">
              pack collections
            </Link>
            {totalModels.toLocaleString()} models · {packs.length} pack collections
          </>
        }
      />

      <main className="creator-page">
        <section className="creator-hero" aria-labelledby="creator-heading">
          <div className="creator-hero-copy">
            <div className="landing-kicker">Creator</div>
            <h2 id="creator-heading">{credit.vendorLabel}</h2>
            <p>{credit.notes ?? "Check the creator source before shipping a project."}</p>
            <div className="creator-stat-grid" aria-label={`${credit.vendorLabel} library stats`}>
              <div>
                <span>Collections</span>
                <strong>{packs.length}</strong>
              </div>
              <div>
                <span>Models</span>
                <strong>{totalModels.toLocaleString()}</strong>
              </div>
              <div>
                <span>License</span>
                <LicenseLink license={credit.license} fallbackUrl={credit.licenseUrl} className="creator-stat-license" />
              </div>
            </div>
          </div>

          <aside className="creator-link-panel" aria-label={`${credit.vendorLabel} links`}>
            <h3>Creator Links</h3>
            {credit.links.map((link) => (
              <a key={link.url} href={link.url} target="_blank" rel="noreferrer">
                <span>{link.label}</span>
                <strong>{new URL(link.url).hostname.replace(/^www\./, "")}</strong>
              </a>
            ))}
            {credit.licenseUrl && (
              <a href={credit.licenseUrl} target="_blank" rel="noreferrer">
                <span>License</span>
                <strong>{credit.license}</strong>
              </a>
            )}
          </aside>
        </section>

        <section className="creator-pack-section" aria-labelledby="creator-packs-heading">
          <div className="creator-pack-heading">
            <div>
              <div className="landing-kicker">Pack context</div>
              <h2 id="creator-packs-heading">{credit.vendorLabel} collections</h2>
            </div>
            <Link href="/models">Search every model</Link>
          </div>

          <PackGrid
            credit={credit}
            items={packs.map((pack) => ({
              pack: {
                count: pack.count,
                description: pack.description,
                id: pack.id,
                license: pack.license,
                pack: pack.pack,
                preview: pack.preview,
                tags: pack.tags,
                title: pack.title,
                vendor: pack.vendor,
              },
              previewModelFiles: previewModelFilesFor(pack),
            }))}
            resetKey={vendor}
            showActions={false}
          />
        </section>
      </main>
    </>
  );
}
