import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { exactLicenseUrlFor, licenseForVendor } from "@/lib/license";
import { manifest, findPack } from "@/lib/manifest";
import { PackViewer } from "@/components/PackViewer";
import { pageMetadata, routePath } from "@/lib/seo";
import { findModelRouteRef, modelHref } from "@/lib/model-routes";

type PackPageProps = {
  params: Promise<{ vendor: string; pack: string }>;
  searchParams?: Promise<{ model?: string | string[] }>;
};

export function generateStaticParams() {
  return manifest.packs.map((p) => ({ vendor: p.vendor, pack: p.pack }));
}

export async function generateMetadata({ params }: PackPageProps): Promise<Metadata> {
  const { vendor, pack } = await params;
  const data = findPack(vendor, pack);
  if (!data) notFound();

  const credit = licenseForVendor(data.vendor);
  const licenseUrl = exactLicenseUrlFor(data.license, {
    source: data.source,
    fallbackUrl: credit.licenseUrl,
  });
  const categories = data.categories.slice(0, 3).join(", ");
  const description = `${data.title} includes ${data.count.toLocaleString("en-US")} game-ready ${categories} models by ${credit.vendorLabel}. Preview, download, and check ${data.license} license notes.`;
  const metadata = pageMetadata({
    title: `${data.title} 3D Models by ${credit.vendorLabel}`,
    description,
    pathname: routePath(data.vendor, data.pack),
    imagePathname: routePath(data.vendor, data.pack),
    imageAlt: `${data.title} 3D model pack`,
  });

  return {
    ...metadata,
    authors: credit.vendorUrl
      ? [{ name: credit.vendorLabel, url: credit.vendorUrl }]
      : [{ name: credit.vendorLabel }],
    keywords: Array.from(
      new Set([
        data.title,
        credit.vendorLabel,
        data.license,
        ...data.categories,
        ...data.style,
        ...data.themes,
        ...data.tags,
      ]),
    ),
    other: {
      "asset-count": data.count.toString(),
      license: licenseUrl ?? data.license,
    },
  };
}

export default async function PackPage({ params, searchParams }: PackPageProps) {
  const { vendor, pack } = await params;
  const query = await searchParams;
  const model = Array.isArray(query?.model) ? query?.model[0] : query?.model;
  const data = findPack(vendor, pack);
  if (!data) notFound();
  if (model) {
    const ref = findModelRouteRef(data, model);
    if (!ref) notFound();
    redirect(modelHref(data, ref));
  }
  return <PackViewer pack={data} />;
}
