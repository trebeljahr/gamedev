# Binary Request Rate Limits

The binary asset edge Worker lives at
`scripts/cf-workers/binary-rate-limit/`. It is intended to sit in front
of the asset origin and cap repeated direct binary fetches before they
turn into R2 egress and origin-read cost.

## Daily Binary Request Cap

- Limit: 500 requests per IP per UTC day.
- Counter store: Workers KV binding `BINARY_REQ_COUNTS`.
- Key format: `<ip>:<YYYY-MM-DD>`, for example `203.0.113.42:2026-05-19`.
- Expiration: every counter write uses a 48 hour TTL so yesterday's key
  survives long enough for edge propagation and audit checks, then clears
  automatically.
- Over the cap: the Worker returns HTTP 429 with this JSON body:

```json
{"error":"daily binary request cap reached","supportUrl":"https://gamedev.trebeljahr.com/supporters"}
```

The cap is deliberately high enough for normal browsing, previewing, and
selective downloads, but low enough to stop cheap per-IP scraping loops.
The 429 response links to the Supporter Bundle so heavy automated users
get a useful next step instead of only a dead end.

## Manual Deploy Steps

Manual Cloudflare setup is deferred to the pre-launch human tasks note.
When doing that deploy, use this order:

1. Create the KV namespace:

```bash
cd scripts/cf-workers/binary-rate-limit
wrangler kv namespace create BINARY_REQ_COUNTS
wrangler kv namespace create BINARY_REQ_COUNTS --preview
```

2. Copy the returned namespace IDs into `wrangler.toml` under the
   `BINARY_REQ_COUNTS` binding.

3. Deploy the Worker:

```bash
wrangler deploy
```

4. Attach the Worker to the binary asset route in Cloudflare. The
   expected production route is `assets.gamedev.trebeljahr.com/*`, or a
   narrower set of binary prefixes if the final asset routing changes.

5. Smoke-test with `curl` after deploy:

```bash
curl -I https://assets.gamedev.trebeljahr.com/glb/<known-asset>.glb
```

6. In Cloudflare, confirm `BINARY_REQ_COUNTS` has keys shaped like
   `<ip>:<YYYY-MM-DD>` and that the key expiration is about 48 hours.

The Worker counts before proxying to the origin, so failed or missing
binary paths still consume a daily slot. That is intentional: repeated
misses are also scraping cost.
