import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { exactLicenseUrlFor, licenseForVendor } from "@/lib/license";
import { manifest, findPack } from "@/lib/manifest";
import { AnalyticsBeacon } from "@/components/AnalyticsBeacon";
import { PackViewer } from "@/components/PackViewer";
import { pageMetadata, routePath } from "@/lib/seo";

type PackPageProps = {
  params: Promise<{ vendor: string; pack: string }>;
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

export default async function PackPage({ params }: PackPageProps) {
  const { vendor, pack } = await params;
  const data = findPack(vendor, pack);
  if (!data) notFound();
  return (
    <>
      <AnalyticsBeacon event="bundle_view" />
      <PackViewer pack={data} />
    </>
  );
}
