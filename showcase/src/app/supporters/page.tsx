import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { pageMetadata } from "@/lib/seo";

const GITHUB_SPONSORS_URL = "https://github.com/sponsors/trebeljahr";
const KO_FI_URL = "https://ko-fi.com/trebeljahr";

export const metadata: Metadata = pageMetadata({
  title: "Help Pay the R2 Bill",
  description:
    "Support the GameDev Asset Library hosting bill and the upstream-creator revenue share for the Supporter Bundle.",
  pathname: "/supporters",
});

const shellStyle: CSSProperties = {
  minHeight: "100vh",
  background:
    "linear-gradient(180deg, rgba(255,216,77,0.08), rgba(255,216,77,0) 260px), var(--bg)",
};

const ledgerStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  padding: 18,
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 8,
  background: "rgba(12,13,16,0.86)",
};

const ledgerRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 16,
  paddingBottom: 12,
  borderBottom: "1px solid rgba(255,255,255,0.08)",
};

const quietTextStyle: CSSProperties = {
  margin: 0,
  color: "rgba(232,230,227,0.68)",
  fontSize: 14,
  lineHeight: 1.55,
};

export default function SupportersPage() {
  return (
    <main style={shellStyle}>
      <SiteHeader />

      <section className="library-hero" aria-labelledby="supporters-heading">
        <div className="library-hero-copy">
          <div className="landing-kicker">Supporters</div>
          <h2 id="supporters-heading">Help pay the R2 bill.</h2>
          <p>
            The catalog is free to browse and download. Support keeps the asset files on Cloudflare R2,
            covers the boring ops bill, and gives heavy users a clean way to help without turning the
            library into ad sludge.
          </p>
          <div className="library-actions" aria-label="Support options">
            <a className="landing-button primary" href={GITHUB_SPONSORS_URL} target="_blank" rel="noreferrer">
              GitHub Sponsors
            </a>
            <a className="landing-button secondary" href={KO_FI_URL} target="_blank" rel="noreferrer">
              Ko-fi
            </a>
          </div>
        </div>

        <div style={ledgerStyle} aria-label="Funding model">
          <div style={ledgerRowStyle}>
            <strong>R2 storage and egress</strong>
            <span>covered first</span>
          </div>
          <div style={ledgerRowStyle}>
            <strong>Supporter Bundle sales</strong>
            <span>split with creators</span>
          </div>
          <div style={{ ...ledgerRowStyle, borderBottom: 0, paddingBottom: 0 }}>
            <strong>Monthly payout log</strong>
            <span>posted here</span>
          </div>
          <p style={quietTextStyle}>
            Direct support pays for hosting and bandwidth. Supporter Bundle revenue also funds the
            people upstream whose work makes the library useful, with the payout trail kept visible below.
          </p>
        </div>
      </section>

      <div className="library-tracks">
        <section className="library-track" data-track="3d" aria-labelledby="funding-model-heading">
          <div className="library-track-copy">
            <span className="landing-kicker">Funding model</span>
            <h3 id="funding-model-heading">Small bill first. Creator share next.</h3>
            <p>
              Every preview, model download, sprite sheet, music file, and zip can turn into R2 operations
              or egress. Sponsors and Ko-fi money goes toward that bill before anything fancy happens.
            </p>
          </div>
          <div className="library-track-copy">
            <ul className="library-track-bullets">
              <li>The free catalog stays free for normal browsing and selective downloads.</li>
              <li>The Supporter Bundle sits beside the catalog as a paid convenience, not a replacement.</li>
              <li>Bundle revenue is meant to be shared back with upstream creators after basic costs are handled.</li>
              <li>The public log below should make the money trail boring and checkable.</li>
            </ul>
          </div>
        </section>

        <section className="library-track" data-track="2d" aria-labelledby="monthly-payout-log">
          <div className="library-track-copy">
            <span className="landing-kicker">Placeholder</span>
            <h3 id="monthly-payout-log">Monthly payout log</h3>
            <p>
              No payouts logged yet. Once the Supporter Bundle starts moving money, this section will list
              the month, income, R2 costs covered, and upstream creator payouts.
            </p>
          </div>
          <div className="library-track-copy">
            <p>
              Until then, this page is just the honest version: help pay the R2 bill, and help make the
              creator-share part visible when there is something real to report.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
