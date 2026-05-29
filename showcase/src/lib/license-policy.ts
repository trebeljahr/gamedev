export type RawAssetLicenseDecision = {
  allowed: boolean;
  reason: string;
};

const RESTRICTED_TERMS =
  /non[-\s]?commercial|cc[-\s]?by[-\s]?nc|share[-\s]?alike|cc[-\s]?by[-\s]?sa|personal use|no redistribution|no resale|no resell|pixabay|royalty-free custom|check source|see bundled|unknown|varies|custom/i;

const CC_BY_TERMS = /\bcc[-\s]?by\b|creative commons attribution/i;
const CC0_TERMS = /\bcc0\b|cc zero|creative commons zero|public domain/i;

export function rawAssetLicenseDecision(license: string | null | undefined): RawAssetLicenseDecision {
  const value = (license ?? "").trim();
  if (!value) return { allowed: false, reason: "Missing license metadata." };
  if (RESTRICTED_TERMS.test(value)) {
    return { allowed: false, reason: "License is not cleared for raw asset redistribution." };
  }
  if (CC0_TERMS.test(value)) return { allowed: true, reason: "CC0 permits raw redistribution." };
  if (CC_BY_TERMS.test(value)) return { allowed: true, reason: "CC-BY permits sharing with attribution." };
  return { allowed: false, reason: "License is not in the production raw-redistribution allowlist." };
}

export function canRedistributeRawAssets(license: string | null | undefined): boolean {
  return rawAssetLicenseDecision(license).allowed;
}

export function shouldShowRestrictedAssets(): boolean {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.SHOW_RESTRICTED_ASSETS === "1" ||
    process.env.NEXT_PUBLIC_SHOW_RESTRICTED_ASSETS === "1"
  );
}
