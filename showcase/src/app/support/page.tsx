import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { pageMetadata } from "@/lib/seo";

const GITHUB_SPONSORS_URL = "https://github.com/sponsors/trebeljahr";
const KO_FI_URL = "https://ko-fi.com/trebeljahr";

export const metadata: Metadata = pageMetadata({
  title: "Support the Project",
  description:
    "The GameDev Asset Library is a passion project. Supporting it helps the developer keep maintaining it.",
  pathname: "/support",
});

const shellStyle: CSSProperties = {
  minHeight: "100vh",
  background:
    "linear-gradient(180deg, rgba(255,216,77,0.08), rgba(255,216,77,0) 260px), var(--bg)",
};

export default function SupportPage() {
  return (
    <main style={shellStyle}>
      <SiteHeader />

      <section className="library-hero" aria-labelledby="support-heading">
        <div className="library-hero-copy">
          <div className="landing-kicker">Support</div>
          <h2 id="support-heading">Support the project.</h2>
          <p>
            The GameDev Asset Library is a passion project. The catalog is free to browse and
            download, and it stays that way. If it has been useful to you and you want to help, you
            can chip in below.
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
      </section>

      <div className="library-tracks">
        <section className="library-track" data-track="3d" aria-labelledby="why-support-heading">
          <div className="library-track-copy">
            <span className="landing-kicker">Why support</span>
            <h3 id="why-support-heading">It helps the developer keep going.</h3>
            <p>
              This is built and maintained by one person, in their own time. Support goes directly
              to the developer and helps keep the library running and maintained.
            </p>
          </div>
          <div className="library-track-copy">
            <p>
              There is no paywall and nothing locked behind a tier. Supporting is optional, and the
              catalog stays free either way.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
