import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { exactLicenseUrlFor, licenseForVendor } from "@/lib/license";
import { manifest, findPack } from "@/lib/manifest";
import { PackViewer } from "@/components/PackViewer";
import { pageMetadata, routePath } from "@/lib/seo";

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
  const description = `${data.description} Includes ${data.count.toLocaleString("en-US")} models. License: ${data.license}.`;
  const metadata = pageMetadata({
    title: `${data.title} 3D Models`,
    description,
    pathname: routePath(data.vendor, data.pack),
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
  if (model && !data.models.some((item) => item.file === model || item.name === model)) notFound();
  return <PackViewer pack={data} initialModelFile={model} />;
}
