import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PackViewer } from "@/components/PackViewer";
import { modelPageCopy } from "@/lib/catalog-seo";
import { exactLicenseUrlFor, licenseForVendor } from "@/lib/license";
import { findPack, manifest } from "@/lib/manifest";
import { findModelRouteRef, modelHref, modelRouteRefsForPack } from "@/lib/model-routes";
import { assetJsonLd, jsonLdScriptContent, pageMetadata } from "@/lib/seo";

type ModelPageProps = {
  params: Promise<{ vendor: string; pack: string; model: string }>;
};

// Prerendered as HTML only: scripts/build-static-site.ts drops these pages'
// payload files to stay under the hosting file limit (see PackViewer).
export function generateStaticParams() {
  return manifest.packs.flatMap((pack) =>
    modelRouteRefsForPack(pack).map((ref) => ({ vendor: pack.vendor, pack: pack.pack, model: ref.slug })),
  );
}

export async function generateMetadata({ params }: ModelPageProps): Promise<Metadata> {
  const { vendor, pack, model } = await params;
  const data = findPack(vendor, pack);
  if (!data) notFound();
  const ref = findModelRouteRef(data, model);
  if (!ref) notFound();

  const credit = licenseForVendor(data.vendor);
  const licenseUrl = exactLicenseUrlFor(data.license, {
    source: data.source,
    fallbackUrl: credit.licenseUrl,
  });
  const copy = modelPageCopy(data, ref.model);
  const metadata = pageMetadata({
    ...copy,
    pathname: modelHref(data, ref),
    imagePathname: `/${data.vendor}/${data.pack}`,
    imageAlt: `${ref.model.title} 3D model`,
  });

  return {
    ...metadata,
    title: { absolute: copy.title },
    authors: credit.vendorUrl
      ? [{ name: credit.vendorLabel, url: credit.vendorUrl }]
      : [{ name: credit.vendorLabel }],
    keywords: Array.from(
      new Set([
        ref.model.title,
        data.title,
        credit.vendorLabel,
        data.license,
        ref.model.category,
        ref.model.subcategory,
        ...ref.model.style,
        ...ref.model.themes,
        ...ref.model.tags,
      ]),
    ),
    other: {
      "asset-index": ref.number.toString(),
      "asset-count": data.count.toString(),
      license: licenseUrl ?? data.license,
    },
  };
}

export default async function ModelPage({ params }: ModelPageProps) {
  const { vendor, pack, model } = await params;
  const data = findPack(vendor, pack);
  if (!data) notFound();
  const ref = findModelRouteRef(data, model);
  if (!ref) notFound();
  const pathname = modelHref(data, ref);
  const jsonLd = assetJsonLd({ pack: data, model: ref.model, pathname });

  return (
    <>
      <script
        id="model-json-ld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScriptContent(jsonLd) }}
      />
      <PackViewer pack={data} initialModelSlug={ref.slug} />
    </>
  );
}
