import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { pageMetadata } from "@/lib/seo";

const contactEmail = "takedown@trebeljahr.com";

export const metadata: Metadata = pageMetadata({
  title: "Takedown Response Policy",
  description:
    "How the GameDev Asset Library handles DMCA notices, disputed assets, Supporter Bundle removals, and bundle refunds.",
  pathname: "/takedown-response",
});

export default function TakedownResponsePage() {
  return (
    <>
      <SiteHeader compact active="library" />
      <main className="info-page">
        <article className="info-page-inner">
          <header className="info-hero">
            <p className="info-kicker">Policy</p>
            <h1>Takedown Response Policy</h1>
            <p>
              GameDev Asset Library removes disputed material quickly, keeps a record of the response, and
              treats Supporter Bundle buyers fairly when a paid bundle included a disputed asset.
            </p>
            <a className="info-button" href={`mailto:${contactEmail}`}>
              {contactEmail}
            </a>
          </header>

          <section className="info-section" aria-labelledby="notice-details">
            <h2 id="notice-details">Send a Notice</h2>
            <p>
              Email copyright, license, attribution, trademark, privacy, or other rights complaints to{" "}
              <a href={`mailto:${contactEmail}`}>{contactEmail}</a>. Include your contact details, the work
              or right affected, the exact asset URL or bundle file path, and a short explanation of the
              issue. The address is a placeholder until Rico confirms or replaces it.
            </p>
          </section>

          <section className="info-section" aria-labelledby="sla">
            <h2 id="sla">24-Hour Removal SLA</h2>
            <p>
              Credible takedown notices trigger removal or disabled access within 24 hours. The project acts
              at the narrowest safe scope: a single asset, a full pack, or the entire Supporter Bundle when
              the disputed file cannot be isolated quickly.
            </p>
            <div className="info-grid">
              <div className="info-panel">
                <h3>Per Asset</h3>
                <p>Models, sprites, sounds, music, textures, metadata entries, and download routes can be removed individually.</p>
              </div>
              <div className="info-panel">
                <h3>Per Bundle</h3>
                <p>The Supporter Bundle is paused or rebuilt if a disputed asset was included in a paid package.</p>
              </div>
            </div>
          </section>

          <section className="info-section" aria-labelledby="refunds">
            <h2 id="refunds">Bundle Refunds</h2>
            <p>
              If a disputed asset was included in a paid Supporter Bundle, buyers receive access to a
              corrected bundle when the storefront supports replacement files. Buyers who purchased a bundle
              containing the disputed asset may request a refund through the storefront or by emailing{" "}
              <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.
            </p>
          </section>

          <section className="info-section" aria-labelledby="bundle-surface">
            <h2 id="bundle-surface">Supporter Bundle Page</h2>
            <p>
              The public Supporter Bundle page is not live yet. Once it ships, it should link back to this
              policy from the bundle purchase or support surface. Until then, the footer is the public
              navigation route for takedown and refund terms.
            </p>
          </section>

          <section className="info-section" aria-labelledby="records">
            <h2 id="records">Records and Restoration</h2>
            <p>
              Removed assets stay unavailable until the claim is resolved, replaced by a verified safe
              source, or withdrawn by the complaining party. The private takedown log records notices,
              actions, bundle impact, refund handling, and restoration reasons.
            </p>
          </section>
        </article>
      </main>
    </>
  );
}
