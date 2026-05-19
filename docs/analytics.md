# Analytics Events

The showcase uses the Plausible script loaded in `showcase/src/app/layout.tsx`.
Custom events should go through `showcase/src/lib/analytics.ts` so event names
and props stay typed.

## Event Taxonomy

| Event | Props | Fires from | Purpose |
| --- | --- | --- | --- |
| `asset_download` | `{ format }` | 3D model format links and pack zip downloads | Measures which downloadable asset formats people use. |
| `bundle_view` | none | 3D pack pages and audio pack pages | Measures visits to bundle/pack detail surfaces before download or storefront conversion. |
| `bundle_purchase` | none | Storefront purchase-completion webhook, later | Measures supporter bundle sales. See webhook wire-up below. |
| `mcp_doc_view` | none | `/build-with-ai` | Measures interest in the MCP setup docs. |
| `build_with_ai_view` | none | `/build-with-ai` | Measures interest in the AI-coding on-ramp page. |
| `audio_export` | `{ format: "mp3" | "wav" }` | SoundPad export button after a successful client-side export | Measures whether people use the audio editor and which output format wins. |
| `search_no_results` | `{ query, type }` | 3D catalog, model index, pack search, 2D/media/source searches | Feeds the post-launch curation backlog with searches that failed. |

`search_no_results.type` is one of `3d_packs`, `models`, `pack_models`,
`sounds`, `2d`, or `sources`.

## Plausible Goals

Configure these custom-event goals in the Plausible dashboard:

- `asset_download`
- `bundle_view`
- `bundle_purchase`
- `audio_export`
- `mcp_doc_view`
- `build_with_ai_view`

Keep `search_no_results` as an analysis event, not a success goal. Review it
weekly during the first month and turn repeated missing queries into curation
tasks.

## Funnel

Dashboard funnel setup is manual in Plausible. Configure the launch funnel as:

1. Pageview `/`
2. Pageview `/models` or `/media?view=sounds`
3. Goal `asset_download`

Use `bundle_view -> bundle_purchase` as the supporter-bundle funnel once the
storefront listing exists.

## Bundle Purchase Webhook

`bundle_purchase` is intentionally a stub in the client wrapper until the
storefront is chosen. The production wire-up point is the storefront
purchase-completion webhook:

1. Storefront sends a completed purchase webhook.
2. Server verifies the storefront signature and paid status.
3. Server sends a Plausible Events API request for domain
   `gamedev.trebeljahr.com` with event name `bundle_purchase`.
4. Optional thank-you page can call `trackBundlePurchase()` as a client-side
   smoke-test, but the webhook is the source of truth.

Do not fire `bundle_purchase` from CTA clicks. CTA or landing-page interest is
`bundle_view`; only verified paid purchases count as `bundle_purchase`.
