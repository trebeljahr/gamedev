interface AssetFetcher {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
}

interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { metadata?: Record<string, unknown>; expirationTtl?: number },
  ): Promise<void>;
}

interface Env {
  ASSETS: AssetFetcher;
  HONEYPOT_BLOCKLIST: KVNamespace;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

interface HoneypotEntry {
  version: 1;
  ip: string;
  userAgent: string;
  timestamp: string;
  firstSeenAt: string;
  lastSeenAt: string;
  latestPath: string;
  latestMethod: string;
  hitCount: number;
}

const ASSET_PATH = "/honey-trap.glb";
const BLOCKLIST_PREFIX = "ip:";
const NO_ROBOTS = "noindex, nofollow, noarchive";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const seenAt = new Date().toISOString();
    ctx.waitUntil(recordHoneypotHit(request, env, seenAt));

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed\n", {
        status: 405,
        headers: {
          Allow: "GET, HEAD",
          "Cache-Control": "no-store",
          "Content-Type": "text/plain; charset=utf-8",
          "X-Robots-Tag": NO_ROBOTS,
        },
      });
    }

    const assetResponse = await env.ASSETS.fetch(assetRequestFor(request));

    if (!assetResponse.ok) {
      return new Response("Honey trap asset missing\n", {
        status: 502,
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "text/plain; charset=utf-8",
          "X-Robots-Tag": NO_ROBOTS,
        },
      });
    }

    const headers = new Headers(assetResponse.headers);
    headers.set("Cache-Control", "no-store");
    headers.set("Content-Type", "model/gltf-binary");
    headers.set("X-Robots-Tag", NO_ROBOTS);

    return new Response(request.method === "HEAD" ? null : assetResponse.body, {
      status: assetResponse.status,
      statusText: assetResponse.statusText,
      headers,
    });
  },
};

async function recordHoneypotHit(
  request: Request,
  env: Env,
  seenAt: string,
): Promise<void> {
  const ip = clientIp(request);

  if (!ip) {
    return;
  }

  const key = blocklistKey(ip);
  const userAgent = request.headers.get("user-agent") ?? "";
  const url = new URL(request.url);
  const entry: HoneypotEntry = {
    version: 1,
    ip,
    userAgent,
    timestamp: seenAt,
    firstSeenAt: seenAt,
    lastSeenAt: seenAt,
    latestPath: url.pathname,
    latestMethod: request.method,
    hitCount: 1,
  };

  const existing = await env.HONEYPOT_BLOCKLIST.get(key);
  if (existing) {
    try {
      const previous = JSON.parse(existing) as Partial<HoneypotEntry>;
      entry.firstSeenAt = previous.firstSeenAt ?? seenAt;
      entry.hitCount = Math.max(1, Number(previous.hitCount) || 1) + 1;
    } catch {
      entry.hitCount = 2;
    }
  }

  await env.HONEYPOT_BLOCKLIST.put(key, JSON.stringify(entry), {
    metadata: {
      ip,
      userAgent,
      lastSeenAt: seenAt,
    },
  });
}

function assetRequestFor(request: Request): Request {
  const url = new URL(request.url);
  url.pathname = ASSET_PATH;
  url.search = "";

  return new Request(url.toString(), {
    headers: request.headers,
    method: request.method,
  });
}

function clientIp(request: Request): string {
  const cfConnectingIp = request.headers.get("CF-Connecting-IP");
  if (cfConnectingIp) {
    return cfConnectingIp.trim();
  }

  const forwardedFor = request.headers.get("X-Forwarded-For");
  if (!forwardedFor) {
    return "";
  }

  return forwardedFor.split(",")[0]?.trim() ?? "";
}

function blocklistKey(ip: string): string {
  return `${BLOCKLIST_PREFIX}${ip}`;
}
