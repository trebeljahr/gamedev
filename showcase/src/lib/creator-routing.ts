import { licenseForVendor } from "@/lib/license";
import { manifest } from "@/lib/manifest";

function normalizeCreator(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function creatorHref(creator: string): string {
  const normalized = normalizeCreator(creator);
  const vendor = manifest.packs.find((pack) => {
    const credit = licenseForVendor(pack.vendor);
    return (
      normalizeCreator(pack.vendor) === normalized ||
      normalizeCreator(credit.vendorLabel) === normalized
    );
  })?.vendor;

  return vendor ? `/${vendor}` : "/media?view=sounds&type=all";
}
