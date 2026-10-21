import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { getCreatorMetadata, getCreatorSlugs } from "@/lib/creator-pages";
import { licenseForVendor } from "@/lib/license";
import { manifest } from "@/lib/manifest";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Game Asset Creators",
  description: "Find game assets by creator, with links to each collection and its source and license information.",
  pathname: "/creators",
});

export default function CreatorsPage() {
  const creators = getCreatorSlugs().map(getCreatorMetadata).sort((a, b) => a.name.localeCompare(b.name));
  const vendors = [...new Set(manifest.packs.map((pack) => pack.vendor))];
  return (
    <>
      <SiteHeader active="packs" />
      <main className="curation-page">
        <h2>Game asset creators</h2>
        <ul>{creators.map((creator) => <li key={creator.slug}><Link href={`/creators/${creator.slug}`}>{creator.name}</Link></li>)}</ul>
        <h2>3D collections</h2>
        <ul>{vendors.map((vendor) => <li key={vendor}><Link href={`/${vendor}`}>{licenseForVendor(vendor).vendorLabel}</Link></li>)}</ul>
      </main>
    </>
  );
}
