export type VendorLicense = {
  vendorLabel: string;
  vendorUrl: string;
  license: string;
  licenseUrl?: string;
  attributionRequired: boolean;
  notes?: string;
};

const VENDORS: Record<string, VendorLicense> = {
  kaykit: {
    vendorLabel: "Kay Lousberg (KayKit)",
    vendorUrl: "https://kaylousberg.com/",
    license: "CC0 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    attributionRequired: false,
    notes: "Credit appreciated but not required.",
  },
  kenney: {
    vendorLabel: "Kenney",
    vendorUrl: "https://kenney.nl/",
    license: "CC0 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    attributionRequired: false,
    notes: "Credit appreciated but not required.",
  },
  quaternius: {
    vendorLabel: "Quaternius",
    vendorUrl: "https://quaternius.com/",
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
      license: "Unknown — check source",
      attributionRequired: true,
    }
  );
}
