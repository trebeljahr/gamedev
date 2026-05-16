import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PackViewer } from "@/components/PackViewer";
import { exactLicenseUrlFor, licenseForVendor } from "@/lib/license";
import { findPack, modelDescription } from "@/lib/manifest";
import { findModelRouteRef, modelHref } from "@/lib/model-routes";
import { pageMetadata } from "@/lib/seo";

type ModelPageProps = {
  params: Promise<{ vendor: string; pack: string; model: string }>;
};

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
  const metadata = pageMetadata({
    title: `${ref.model.title} 3D Model by ${credit.vendorLabel}`,
    description: `${modelDescription(ref.model, data)} Browse it in ${data.title}, download source files, and review ${data.license} license notes.`,
    pathname: modelHref(data, ref),
    imagePathname: `/${data.vendor}/${data.pack}`,
    imageAlt: `${ref.model.title} 3D model`,
  });

  return {
    ...metadata,
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

  return <PackViewer pack={data} initialModelSlug={ref.slug} />;
}
