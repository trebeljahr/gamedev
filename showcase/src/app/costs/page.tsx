import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { pageMetadata } from "@/lib/seo";

const lastUpdated = "May 19, 2026";

const costLogMarkdown = `| Month | R2 storage | R2 ops | CDN | Domain | Total | Donations | Bundle revenue | Net |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| May 2026 |  |  |  |  |  |  |  |  |`;

export const metadata: Metadata = pageMetadata({
  title: "Public Costs",
  description:
    "Monthly R2, CDN, domain, donation, and supporter bundle revenue log for the GameDev Asset Library.",
  pathname: "/costs",
});

export default function CostsPage() {
  return (
    <>
      <SiteHeader />
      <main className="costs-page">
        <section className="costs-shell" aria-labelledby="costs-heading">
          <div className="costs-intro">
            <span className="landing-kicker">Public costs</span>
            <h2 id="costs-heading">Monthly R2 and ops bill log.</h2>
            <p>
              The library stays public and open source while donations and optional supporter bundle revenue help cover
              R2 storage, R2 operations, CDN, domain, and maintenance costs. Any surplus stays reserved for hosting,
              curation, and keeping the asset catalog usable for the next builder.
            </p>
          </div>

          <div className="costs-log" aria-label="Monthly costs markdown table">
            <pre>
              <code>{costLogMarkdown}</code>
            </pre>
          </div>

          <p className="costs-note">
            Manual entry workflow: this page is updated by hand from bills, receipts, donations, and bundle sales. No
            scraping, vendor polling, or automatic revenue import runs behind this log.
          </p>
          <p className="costs-updated">Last updated: {lastUpdated}</p>
        </section>
      </main>
    </>
  );
}
