# Takedown Response Policy

Status: public policy draft. Contact route is `takedown@trebeljahr.com` until Rico confirms or replaces it.

Last updated: 2026-05-19

The GameDev Asset Library publishes a curated game-asset catalog and may sell a Supporter Bundle that packages allowlisted assets for buyers who want to support the project. The goal is to respect creators, remove disputed material quickly, and keep a clear record of every action taken.

This policy describes the operational response for copyright, DMCA, license, attribution, trademark, privacy, or other rights complaints. It is not legal advice.

Surface note: a dedicated public Supporter Bundle page is not live on `main` yet. When that page ships, it should link to this policy from the bundle purchase or support surface. Until then, the site footer links to the public takedown policy page.

## Contact

Send takedown notices or rights complaints to `takedown@trebeljahr.com`.

Please include as much of the following as possible:

- Your name and contact information.
- The copyrighted work or other rights you believe are affected.
- The exact asset URL, catalog entry, bundle file path, or other location of the disputed material.
- A short explanation of the issue.
- A statement that you have a good-faith belief the use is not authorized by the rights holder, their agent, or the law.
- A statement that the information is accurate and that you are authorized to act for the rights holder.
- Your physical or electronic signature.

If a notice is missing details but identifies a plausible disputed asset, the project still treats it as urgent and may temporarily remove the asset while asking for more information.

## Response SLA

The project will remove or disable access to disputed material within 24 hours of receiving a credible takedown notice or rights complaint.

That 24-hour removal SLA applies at the narrowest safe scope:

- Per asset: remove the single model, sprite pack, sound, music track, texture, metadata entry, or download route.
- Per pack: remove a full source pack when the disputed asset cannot be isolated quickly.
- Supporter Bundle: remove the disputed asset from the bundle, or pull the entire Supporter Bundle if the bundle cannot be safely rebuilt within the SLA.

Removed assets stay unavailable until the claim is resolved, replaced by a clearly safe source, or explicitly withdrawn by the complaining party.

## Supporter Bundle Refunds

If a disputed asset was included in a paid Supporter Bundle:

- The current bundle is pulled, rebuilt without the disputed asset, or unpublished within the 24-hour SLA.
- Buyers receive access to a corrected bundle when the storefront supports replacement files.
- Any buyer who purchased a bundle containing the disputed asset may request a refund through the storefront or by emailing `takedown@trebeljahr.com`.
- Refund requests for this reason should be approved without requiring the buyer to prove they used or relied on the disputed asset.

The takedown log should record the affected bundle version, storefront listing, purchase window, refund route, and whether a corrected bundle was published.

## Communication

The project should acknowledge credible notices as soon as practical, ideally within the first hour. The acknowledgement should confirm:

- Notice received.
- Material identified.
- Temporary removal or bundle-pull action taken, if already complete.
- Next expected update.

The project does not need to decide the underlying rights dispute before removing access. Fast removal is the default risk-control action.

## Restoration

Material may be restored only after the project records why restoration is safe. Examples include:

- The complaining party withdraws the notice.
- The upstream creator confirms the license or authorization in writing.
- The asset is replaced with a different source that is independently verified.
- Counsel or the storefront confirms restoration is appropriate.

Restoration should be logged with the date, reason, and evidence link.

## Private First-Hour Runbook

This section is for the maker operating the project.

1. Start a takedown log entry.
   - Record received time, sender, contact route, asset URLs, catalog IDs, bundle version, storefront URL, and current status.
   - Save the original notice in the private evidence folder or issue tracker.

2. Pull the asset.
   - Disable the public download route, remove the catalog entry, or mark it unavailable.
   - If the asset appears in generated catalogs, rebuild or patch the affected catalog output.
   - If the asset appears in CDN/R2 storage, remove or deny access to the object.

3. Pull the bundle when needed.
   - If the disputed file is in the Supporter Bundle and a clean rebuild cannot ship immediately, unpublish or pause the entire bundle listing.
   - If a clean rebuild is possible within the 24-hour SLA, rebuild the bundle, regenerate attribution/audit files, and replace the storefront file.

4. Acknowledge the notice.
   - Reply that the notice was received.
   - State what was removed or paused.
   - Give the next review step without making legal admissions.

5. File the takedown log entry.
   - Add actions taken, timestamps, bundle/refund impact, and open questions.
   - Add a follow-up reminder for final resolution, refund handling, and any public changelog needed.

## References

- U.S. Copyright Office: DMCA Designated Agent Directory, including notice elements and designated-agent guidance: https://www.copyright.gov/dmca-directory/
- U.S. Copyright Office: The Digital Millennium Copyright Act overview: https://www.copyright.gov/dmca/
