import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LicenseLink } from "@/components/LicenseLink";
import { SiteHeader } from "@/components/SiteHeader";
import { licenseForVendor } from "@/lib/license";
import {
  displayPackTitle,
  downloadProxyUrl,
  downloadsForModel,
  manifest,
  modelDownloadFilename,
  type Model,
  type ModelDownload,
  type Pack,
} from "@/lib/manifest";
import {
  formatLandingPath,
  isModelFormat,
  MODEL_FORMAT_DETAILS,
  MODEL_FORMATS,
  type ModelFormat,
} from "@/lib/model-formats";
import { modelHref, modelRouteRefsForPack } from "@/lib/model-routes";
import { pageMetadata } from "@/lib/seo";
import { uniqueTags } from "@/lib/tags";

type FormatPageProps = {
  params: Promise<{ format: string }>;
};

type FormatAsset = {
  model: Model;
  pack: Pack;
  download: ModelDownload;
  license: string;
  vendorLabel: string;
  licenseUrl?: string | null;
  href: string;
  packHref: string;
  packTitle: string;
};

const assetCache = new Map<ModelFormat, FormatAsset[]>();

function assetsForFormat(format: ModelFormat): FormatAsset[] {
  const cached = assetCache.get(format);
  if (cached) return cached;

  const assets = manifest.packs
    .flatMap((pack) => {
      const credit = licenseForVendor(pack.vendor);
      const license = pack.license || credit.license;
      const packTitle = displayPackTitle(pack);
      const packHref = `/${pack.vendor}/${pack.pack}`;
      const hrefs = new Map(
        modelRouteRefsForPack(pack).map((ref) => [ref.model.file, modelHref(pack, ref)]),
      );
      return pack.models.flatMap((model) => {
        const download = downloadsForModel(model).find((item) => item.format === format);
        if (!download) return [];
        return [
          {
            model,
            pack,
            download,
            license,
            vendorLabel: credit.vendorLabel,
            licenseUrl: credit.licenseUrl,
            href: hrefs.get(model.file) ?? modelHref(pack, model),
            packHref,
            packTitle,
          },
        ];
      });
    })
    .sort((a, b) => {
      const packOrder = a.packTitle.localeCompare(b.packTitle);
      if (packOrder !== 0) return packOrder;
      return a.model.title.localeCompare(b.model.title);
    });
  assetCache.set(format, assets);
  return assets;
}

function visibleModelTags(model: Model): string[] {
  return uniqueTags([model.subcategory, ...model.themes, ...model.style, ...model.tags]).slice(0, 5);
}

export function generateStaticParams() {
  return MODEL_FORMATS.map((format) => ({ format }));
}

export async function generateMetadata({ params }: FormatPageProps): Promise<Metadata> {
  const { format: formatParam } = await params;
  if (!isModelFormat(formatParam)) notFound();

  const details = MODEL_FORMAT_DETAILS[formatParam];
  const count = assetsForFormat(formatParam).length;
  return pageMetadata({
    title: details.title,
    description: `Browse ${count.toLocaleString("en-US")} free ${details.label} models with creator links, licenses, source pack context, and engine notes for Unity, Godot, Blender, and Three.js.`,
    pathname: formatLandingPath(formatParam),
    imagePathname: "/models",
    imageAlt: `${details.label} 3D model catalog`,
  });
}

export default async function FormatPage({ params }: FormatPageProps) {
  const { format: formatParam } = await params;
  if (!isModelFormat(formatParam)) notFound();

  const details = MODEL_FORMAT_DETAILS[formatParam];
  const assets = assetsForFormat(formatParam);
  const packCount = new Set(assets.map((asset) => asset.pack.id)).size;
  const creatorCount = new Set(assets.map((asset) => asset.pack.vendor)).size;

  return (
    <>
      <SiteHeader
        active="packs"
        meta={
          <>
            <Link href="/models" className="header-meta-link">
              all models
            </Link>
            {assets.length.toLocaleString()} {details.label} assets · {packCount} packs
          </>
        }
      />

      <main className="format-page model-catalog-page">
        <section className="format-hero" aria-labelledby="format-heading">
          <div className="format-hero-copy">
            <div className="landing-kicker">Model format</div>
            <h2 id="format-heading">{details.title}</h2>
            <p>{details.explainer}</p>
            <p className="format-compatibility">
              <strong>Best for Unity / Godot / Blender / Three.js:</strong> {details.compatibility}
            </p>
          </div>
          <aside className="format-stat-panel" aria-label={`${details.label} catalog stats`}>
            <div>
              <span>Assets</span>
              <strong>{assets.length.toLocaleString()}</strong>
            </div>
            <div>
              <span>Collections</span>
              <strong>{packCount.toLocaleString()}</strong>
            </div>
            <div>
              <span>Creators</span>
              <strong>{creatorCount.toLocaleString()}</strong>
            </div>
            <div>
              <span>Extension</span>
              <strong>{details.extension}</strong>
            </div>
          </aside>
        </section>

        <nav className="format-switcher" aria-label="Model format pages">
          {MODEL_FORMATS.map((format) => {
            const item = MODEL_FORMAT_DETAILS[format];
            return (
              <Link
                key={format}
                href={formatLandingPath(format)}
                aria-current={format === formatParam ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <section className="format-results" aria-labelledby="format-results-heading">
          <div className="format-list-heading">
            <div>
              <div className="landing-kicker">Assets in this format</div>
              <h3 id="format-results-heading">All {details.label} downloads</h3>
            </div>
            <Link href="/models">Filter the full catalog</Link>
          </div>

          <div className="format-asset-list">
            {assets.map((asset) => {
              const tags = visibleModelTags(asset.model);
              const filename = modelDownloadFilename(asset.model, asset.download);
              return (
                <article className="format-asset-row" key={`${asset.download.file}:${asset.model.file}`}>
                  <div className="format-asset-main">
                    <Link className="format-asset-title" href={asset.href}>
                      {asset.model.title}
                    </Link>
                    <div className="format-asset-meta">
                      <Link href={asset.packHref}>{asset.packTitle}</Link>
                      <span>{asset.vendorLabel}</span>
                      <LicenseLink
                        license={asset.license}
                        source={asset.vendorLabel}
                        fallbackUrl={asset.licenseUrl}
                        fallbackElement="span"
                      />
                    </div>
                    {tags.length > 0 && (
                      <div className="model-tags format-asset-tags">
                        {tags.map((tag) => (
                          <span key={tag}>{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="format-asset-side">
                    <span>{asset.model.category}</span>
                    <a
                      href={downloadProxyUrl(asset.download.file, filename)}
                      download={filename}
                      title={asset.download.file}
                    >
                      Download {details.label}
                    </a>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </main>
    </>
  );
}
