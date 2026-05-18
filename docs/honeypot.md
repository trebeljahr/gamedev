# Honeypot scraper trap

This ships only the code and local placeholder asset for the Cloudflare honeypot. Rico still creates the Cloudflare KV namespace, deploys the Worker, and attaches routes manually.

## Files

- `assets/honey-trap/honey-trap.glb` is a tiny placeholder GLB served only by the honeypot Worker.
- `scripts/cf-workers/honeypot/src/index.ts` serves the GLB and writes the requester IP, user-agent, timestamp, path, method, and hit count into KV.
- `scripts/cf-workers/honeypot/wrangler.toml` declares the `HONEYPOT_BLOCKLIST` KV binding and an `ASSETS` binding for the placeholder GLB.
- `scripts/cf-workers/middleware/block-check.ts` is a reusable middleware stub. It reads the same KV namespace and returns `403 Forbidden` for listed IPs.

## Runtime behavior

1. A bot requests the trap URL, for example `https://gamedev.trebeljahr.com/internal/honey-trap.glb`.
2. Cloudflare routes that exact path to the honeypot Worker.
3. The Worker records `ip:<client-ip>` in `HONEYPOT_BLOCKLIST` with the IP, UA, timestamp, first/last seen timestamps, latest path/method, and hit count.
4. The Worker returns `assets/honey-trap/honey-trap.glb` with `Content-Type: model/gltf-binary`, `Cache-Control: no-store`, and `X-Robots-Tag: noindex, nofollow, noarchive`.
5. Any Worker that imports `blockKnownScraper` and binds the same KV namespace can reject future requests from that IP with `403`.

## Cloudflare setup

Do these in the Cloudflare dashboard or with Wrangler after this code has landed.

1. Create a Workers KV namespace named `HONEYPOT_BLOCKLIST`.
2. Copy the namespace ID into `scripts/cf-workers/honeypot/wrangler.toml`:

   ```toml
   [[kv_namespaces]]
   binding = "HONEYPOT_BLOCKLIST"
   id = "<real namespace id>"
   ```

3. Bind the same KV namespace as `HONEYPOT_BLOCKLIST` on any middleware Worker that imports `scripts/cf-workers/middleware/block-check.ts`.
4. Secret/auth setup:
   - The Worker does not need an app runtime secret.
   - For local deploys, run `wrangler login`.
   - For CI or a shell token, provide Cloudflare auth outside git, for example `CLOUDFLARE_API_TOKEN`, with permission to edit Workers and the KV namespace.
   - If a future policy adds a runtime secret, set it with `wrangler secret put <NAME>` from the Worker directory.
5. Deploy the honeypot Worker:

   ```bash
   cd scripts/cf-workers/honeypot
   wrangler deploy
   ```

6. In Cloudflare dashboard, attach a route for the trap path, for example:

   ```text
   gamedev.trebeljahr.com/internal/honey-trap.glb
   ```

7. Attach the site middleware Worker route separately, for example:

   ```text
   gamedev.trebeljahr.com/*
   ```

   Ensure the exact honeypot route remains more specific than the site-wide middleware route.

## Middleware usage

Call the stub before normal asset handling:

```ts
import { blockKnownScraper } from "../middleware/block-check";

export default {
  async fetch(request: Request, env: { HONEYPOT_BLOCKLIST: KVNamespace }) {
    const blocked = await blockKnownScraper(request, env);

    if (blocked) {
      return blocked;
    }

    return fetch(request);
  },
};
```

Cloudflare KV is eventually consistent. A scraper may make a few more requests before all edge locations see the blocklist write.
