import type { CSSProperties, ReactNode } from "react";
import { exactLicenseUrlFor } from "@/lib/license";

type LicenseLinkProps = {
  license: string;
  source?: string | null;
  fallbackUrl?: string | null;
  className?: string;
  style?: CSSProperties;
  title?: string;
  label?: ReactNode;
  fallbackElement?: "span" | "strong";
};

export function LicenseLink({
  license,
  source,
  fallbackUrl,
  className,
  style,
  title,
  label,
  fallbackElement = "strong",
}: LicenseLinkProps) {
  const href = exactLicenseUrlFor(license, { source, fallbackUrl });
  const content = label ?? license;
  const linkTitle = title ?? `Open ${license} license terms`;

  if (!href) {
    return fallbackElement === "span" ? (
      <span className={className} style={style} title={title ?? license}>
        {content}
      </span>
    ) : (
      <strong className={className} style={style} title={title ?? license}>
        {content}
      </strong>
    );
  }

  const resolvedHref = href;

  return (
    <a className={className} style={style} href={resolvedHref} target="_blank" rel="noreferrer" title={linkTitle}>
      {content}
    </a>
  );
}
