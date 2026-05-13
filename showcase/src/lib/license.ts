export type VendorLicense = {
  vendorLabel: string;
  vendorUrl: string;
  links: Array<{
    label: string;
    url: string;
  }>;
  license: string;
  licenseUrl?: string;
  attributionRequired: boolean;
  notes?: string;
};

const VENDORS: Record<string, VendorLicense> = {
  kaykit: {
    vendorLabel: "Kay Lousberg (KayKit)",
    vendorUrl: "https://kaylousberg.com/",
    links: [
      { label: "Home", url: "https://kaylousberg.com/" },
      { label: "itch.io", url: "https://kaylousberg.itch.io/" },
    ],
    license: "CC0 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    attributionRequired: false,
    notes: "Credit appreciated but not required.",
  },
  kenney: {
    vendorLabel: "Kenney",
    vendorUrl: "https://kenney.nl/",
    links: [
      { label: "Home", url: "https://kenney.nl/" },
      { label: "itch.io", url: "https://kenney.itch.io/" },
    ],
    license: "CC0 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    attributionRequired: false,
    notes: "Credit appreciated but not required.",
  },
  quaternius: {
    vendorLabel: "Quaternius",
    vendorUrl: "https://quaternius.com/",
    links: [
      { label: "Home", url: "https://quaternius.com/" },
      { label: "itch.io", url: "https://quaternius.itch.io/" },
      { label: "Patreon", url: "https://www.patreon.com/quaternius" },
    ],
    license: "CC0 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    attributionRequired: false,
    notes: "Credit appreciated but not required.",
  },
};

export function licenseForVendor(vendor: string): VendorLicense {
  return (
    VENDORS[vendor] ?? {
      vendorLabel: vendor,
      vendorUrl: "",
      links: [],
      license: "Unknown — check source",
      attributionRequired: true,
    }
  );
}
