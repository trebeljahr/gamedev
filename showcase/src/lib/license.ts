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

const CC0_LEGAL_CODE_URL = "https://creativecommons.org/publicdomain/zero/1.0/legalcode";
const CC_BY_4_LEGAL_CODE_URL = "https://creativecommons.org/licenses/by/4.0/legalcode";
const CC_BY_3_LEGAL_CODE_URL = "https://creativecommons.org/licenses/by/3.0/legalcode";
const PIXABAY_CONTENT_LICENSE_URL = "https://pixabay.com/service/terms/#license";

type LicenseUrlOptions = {
  source?: string | null;
  fallbackUrl?: string | null;
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
    licenseUrl: CC0_LEGAL_CODE_URL,
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
    licenseUrl: CC0_LEGAL_CODE_URL,
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
    licenseUrl: CC0_LEGAL_CODE_URL,
    attributionRequired: false,
    notes: "Credit appreciated but not required.",
  },
};

function normalizeLicenseText(value: string): string {
  return value.toLowerCase().replace(/[\s_]+/g, " ").trim();
}

export function exactLicenseUrlFor(license: string | undefined, options: LicenseUrlOptions = {}): string | undefined {
  const licenseText = normalizeLicenseText(license ?? "");
  const sourceText = normalizeLicenseText(options.source ?? "");
  const combined = normalizeLicenseText(`${licenseText} ${sourceText}`);
  const fallbackUrl = options.fallbackUrl ?? undefined;

  if (!combined) return fallbackUrl;
  if (/cc0|cc zero|creative commons zero/.test(combined)) return CC0_LEGAL_CODE_URL;
  if (/cc[- ]?by[- ]?4(?:\.0)?|creative commons: by attribution 4\.0/.test(combined)) {
    return CC_BY_4_LEGAL_CODE_URL;
  }
  if (/cc[- ]?by[- ]?3(?:\.0)?/.test(combined)) return CC_BY_3_LEGAL_CODE_URL;
  if (/sampling plus/.test(combined)) return "https://creativecommons.org/licenses/sampling+/1.0/";
  if (/unknown|check source|see source|bundled/.test(licenseText)) return fallbackUrl;
  if (/pixabay/.test(combined)) return PIXABAY_CONTENT_LICENSE_URL;
  if (/mixamo/.test(combined)) return "https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html";
  if (/adobe fuse|fuse cc/.test(combined)) return "https://helpx.adobe.com/fuse/kb/discontinued-features-fuse.html";
  if (/cmu|mocap|motion capture database/.test(combined)) return "http://mocap.cs.cmu.edu/faqs.php";
  if (/sketchfab|varies per model/.test(combined)) return "https://sketchfab.com/licenses";
  if (/freesound|varies per sound/.test(combined)) return "https://freesound.org/help/faq/#licenses";
  if (/apache.*2(?:\.0)?/.test(combined)) return "https://www.apache.org/licenses/LICENSE-2.0";
  if (/\bmit\b/.test(combined)) return "https://opensource.org/license/mit";
  if (/open font license|\bofl\b/.test(combined)) return "https://openfontlicense.org/open-font-license-official-text/";
  if (/custom|redistribution|resale|personal \+ commercial|modification allowed/.test(combined)) return fallbackUrl;
  return fallbackUrl;
}

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
