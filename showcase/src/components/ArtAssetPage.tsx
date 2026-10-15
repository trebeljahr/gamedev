"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArtItemThumb, ArtItemViewer } from "@/components/ArtItemMedia";
import { LicenseLink } from "@/components/LicenseLink";
import { SiteHeader } from "@/components/SiteHeader";
import { artItemHref, artPackHref, artPackJsonPath, folderFromArtPackSlug } from "@/lib/art-routing";
import { packArtItems, type ArtItem } from "@/lib/art-items";
import { brokenAssetIssueUrl } from "@/lib/github-issue";
import { licenseBucket } from "@/lib/license";
import { assetUrl } from "@/lib/manifest";
import type { ArtPack } from "@/lib/media";
import { SITE_NAME, SITE_URL } from "@/lib/seo";

type Resolved =
  | { state: "loading" }
  | { state: "missing" }
  | { state: "ready"; pack: ArtPack; items: ArtItem[]; item: ArtItem };

function assetFromPath(pathname: string): { slug: string; assetId: string } | undefined {
  const match = pathname.match(/^\/media\/2d\/([^/]+)\/([^/]+)\/?$/);
  if (!match) return undefined;
  try {
    return { slug: decodeURIComponent(match[1]), assetId: decodeURIComponent(match[2]) };
  } catch {
    return undefined;
  }
}

function setHeadTags(title: string, description: string, pathname: string) {
  document.title = `${title} | ${SITE_NAME}`;
  document.querySelector('meta[name="description"]')?.setAttribute("content", description);
  let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    document.head.appendChild(canonical);
  }
  canonical.href = `${SITE_URL}${pathname}`;
}

/** The 2D asset detail page, resolved in the browser from the URL. */
export function ArtAssetPage() {
  const [resolved, setResolved] = useState<Resolved>({ state: "loading" });

  useEffect(() => {
    const target = assetFromPath(window.location.pathname);
    if (!target) {
      setResolved({ state: "missing" });
      return;
    }
    let cancelled = false;
    const folder = folderFromArtPackSlug(target.slug);
    fetch(artPackJsonPath(folder))
      .then((response) => (response.ok ? (response.json() as Promise<ArtPack>) : null))
      .catch(() => null)
      .then((pack) => {
        if (cancelled) return;
        const items = pack ? packArtItems(pack) : [];
        const item = items.find((candidate) => candidate.id === target.assetId);
        if (!pack || !item) {
          setResolved({ state: "missing" });
          return;
        }
        setHeadTags(
          `${item.label} — ${pack.title} 2D Asset`,
          `${item.label} is a ${item.animated ? "animated " : ""}2D ${item.kind} from ${pack.title} by ${pack.author}. ${pack.license_class} license.`,
          artItemHref(pack.folder, item.id),
        );
        setResolved({ state: "ready", pack, items, item });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (resolved.state !== "ready") {
    return (
      <div className="media-page">
        <SiteHeader active="art" />
        <section className="media-hero">
          <div>
            <div className="landing-kicker">2D Asset</div>
            <h2>{resolved.state === "loading" ? "Loading asset…" : "This asset could not be found."}</h2>
            {resolved.state === "missing" && (
              <p className="workbench-description">
                <Link href="/media?view=art&type=all">Browse all 2D assets</Link>
              </p>
            )}
          </div>
        </section>
      </div>
    );
  }

  const { pack, items, item } = resolved;
  const viewerSequence = item.sequenceSrcs?.map(assetUrl);
  const related = items
    .filter((candidate) => candidate.id !== item.id)
    .slice(0, 24)
    .map((candidate) => ({
      id: candidate.id,
      label: candidate.label,
      src: assetUrl(candidate.src),
      href: artItemHref(pack.folder, candidate.id),
    }));

  const reportUrl = brokenAssetIssueUrl({
    id: item.primaryPath,
    name: `${item.label} (${pack.title})`,
    kind: "sprite",
    license: pack.license_class,
    sourceUrl: pack.url,
    catalogPath: artItemHref(pack.folder, item.id),
  });

  return (
    <div className="media-page">
      <SiteHeader
        active="art"
        meta={
          <>
            2D asset · {pack.title} · {pack.author}
          </>
        }
      />

      <section className="media-hero">
        <div>
          <div className="landing-kicker">2D Asset</div>
          <h2>{item.label}</h2>
          <p className="workbench-description">
            Part of <Link href={artPackHref(pack.folder)}>{pack.title}</Link> by {pack.author}
          </p>
        </div>
        <nav className="asset-section-nav top-nav" aria-label="2D navigation">
          <Link href={artPackHref(pack.folder)}>Back to pack</Link>
          <Link href="/media?view=art&type=all">All 2D</Link>
        </nav>
      </section>

      <div className="art-detail-layout">
        <section className="media-panel">
          <ArtItemViewer src={assetUrl(item.src)} label={item.label} sequenceSrcs={viewerSequence} />
          <div className="workbench-credit-grid">
            <div>
              <span>Pack</span>
              <Link href={artPackHref(pack.folder)}>{pack.title}</Link>
            </div>
            <div>
              <span>Creator</span>
              {pack.author_url ? (
                <a href={pack.author_url} target="_blank" rel="noreferrer">
                  {pack.author}
                </a>
              ) : (
                <strong>{pack.author}</strong>
              )}
            </div>
            <div>
              <span>License</span>
              <LicenseLink
                license={pack.license_class}
                fallbackUrl={pack.url}
                label={licenseBucket(pack.license_class)}
                title={pack.license_class}
              />
            </div>
            <div>
              <span>Type</span>
              <strong>
                {item.kind}
                {item.animated ? " · animated" : ""}
                {item.sequenceSrcs ? ` · ${item.sequenceSrcs.length} frames` : ""}
              </strong>
            </div>
            {pack.url && (
              <a className="source-link" href={pack.url} target="_blank" rel="noreferrer">
                Source pack
              </a>
            )}
            <a className="source-link" href={reportUrl} target="_blank" rel="noreferrer">
              Report broken asset
            </a>
          </div>
        </section>

        {related.length > 0 && (
          <section className="media-panel">
            <div className="panel-heading">
              <h3>Related in this pack</h3>
              <span>{related.length}</span>
            </div>
            <div className="art-item-grid">
              {related.map((candidate) => (
                // Document navigation: this page has no payload for a client route change.
                <a className="art-item-card" key={candidate.id} href={candidate.href}>
                  <div className="art-thumb">
                    <ArtItemThumb src={candidate.src} label={candidate.label} />
                  </div>
                  <strong>{candidate.label}</strong>
                </a>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
